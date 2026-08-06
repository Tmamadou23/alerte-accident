const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const webpush = require('web-push');
const PDFDocument = require('pdfkit');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Set it in your host dashboard (Render / Fly.io / Railway) or in a local .env file.');
  process.exit(1);
}

const needsSSL = /sslmode=require/i.test(connectionString) || /neon\.tech|supabase|aiven|render|railway/i.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

// VAPID keys for Web Push (set as env vars for security)
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:admin@alerte-accident.app';
let pushEnabled = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  pushEnabled = true;
} else {
  console.warn('WARN: VAPID_PUBLIC / VAPID_PRIVATE not set. Push notifications disabled.');
}

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accidents (
      id SERIAL PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      place_name VARCHAR(255),
      reporter_name VARCHAR(120),
      reporter_contact VARCHAR(120),
      vehicles VARCHAR(255),
      severity VARCHAR(30),
      deaths INT DEFAULT 0,
      injured INT DEFAULT 0,
      description TEXT,
      photo_mime VARCHAR(60),
      photo_data BYTEA,
      occurred_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // For existing tables: add column if missing (idempotent)
  await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subs (
      id SERIAL PRIMARY KEY,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------- Accidents ----------
app.get('/api/accidents', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, lat, lng, place_name, reporter_name, reporter_contact,
              vehicles, severity, deaths, injured, description,
              (photo_data IS NOT NULL) AS has_photo, occurred_at, created_at
         FROM accidents ORDER BY COALESCE(occurred_at, created_at) DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/accidents', async (req, res) => {
  try {
    const b = req.body || {};
    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'invalid_coords' });

    let mime = null, buf = null;
    if (b.photo && typeof b.photo === 'string' && b.photo.startsWith('data:')) {
      const m = b.photo.match(/^data:([^;]+);base64,(.*)$/);
      if (m) {
        mime = m[1];
        buf = Buffer.from(m[2], 'base64');
        if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'photo_too_large' });
      }
    }
    const vehicles = Array.isArray(b.vehicles) ? b.vehicles.join(',') : String(b.vehicles || '');
    // Parse occurred_at (ISO string or "YYYY-MM-DDTHH:mm"). Reject if in the future or older than 30 days.
    let occurredAt = null;
    if (b.occurred_at) {
      const d = new Date(b.occurred_at);
      if (!isNaN(d.getTime())) {
        const now = Date.now();
        if (d.getTime() > now + 5 * 60 * 1000) return res.status(400).json({ error: 'occurred_in_future' });
        if (d.getTime() < now - 30 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'occurred_too_old' });
        occurredAt = d;
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO accidents (lat, lng, place_name, reporter_name, reporter_contact,
        vehicles, severity, deaths, injured, description, photo_mime, photo_data, occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, occurred_at, created_at`,
      [lat, lng, String(b.place_name || '').slice(0, 250),
        String(b.reporter_name || '').slice(0, 120),
        String(b.reporter_contact || '').slice(0, 120),
        vehicles.slice(0, 250),
        String(b.severity || 'less_grave').slice(0, 30),
        parseInt(b.deaths) || 0,
        parseInt(b.injured) || 0,
        String(b.description || '').slice(0, 2000),
        mime, buf, occurredAt]
    );
    const created = rows[0];
    // Fire push notifications (do not await; do not fail request)
    sendPushToAll({
      title: 'Nouvelle alerte accident',
      body: `${b.place_name || 'Lieu non précisé'} — ${b.severity === 'grave' ? 'Grave' : 'Moins grave'}`,
      url: '/',
      accidentId: created.id
    }).catch(err => console.error('push error', err.message));
    res.json({ id: created.id, ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'db_error' }); }
});

app.get('/photo/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT photo_mime, photo_data FROM accidents WHERE id = $1',
      [parseInt(req.params.id)]
    );
    if (!rows.length || !rows[0].photo_data) return res.status(404).end();
    res.setHeader('Content-Type', rows[0].photo_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(rows[0].photo_data);
  } catch (e) { res.status(500).end(); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(deaths),0)::int AS deaths,
             COALESCE(SUM(injured),0)::int AS injured,
             COALESCE(SUM(CASE WHEN severity='grave' THEN 1 ELSE 0 END),0)::int AS grave,
             COALESCE(SUM(CASE WHEN severity='less_grave' THEN 1 ELSE 0 END),0)::int AS less_grave
        FROM accidents
    `);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

// ---------- Exports ----------
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

app.get('/api/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, occurred_at, created_at, place_name, lat, lng, severity, vehicles,
              deaths, injured, reporter_name, reporter_contact, description
         FROM accidents ORDER BY COALESCE(occurred_at, created_at) DESC`
    );
    const headers = ['id','occurred_at','created_at','place_name','lat','lng','severity','vehicles','deaths','injured','reporter_name','reporter_contact','description'];
    let out = '\uFEFF' + headers.join(',') + '\n';
    for (const r of rows) out += headers.map(h => csvEscape(r[h])).join(',') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="accidents-${Date.now()}.csv"`);
    res.end(out);
  } catch (e) { res.status(500).json({ error: 'export_error' }); }
});

app.get('/api/export/json', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, occurred_at, created_at, place_name, lat, lng, severity, vehicles,
              deaths, injured, reporter_name, reporter_contact, description
         FROM accidents ORDER BY COALESCE(occurred_at, created_at) DESC`
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="accidents-${Date.now()}.json"`);
    res.end(JSON.stringify(rows, null, 2));
  } catch (e) { res.status(500).json({ error: 'export_error' }); }
});

app.get('/api/export/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, occurred_at, created_at, place_name, lat, lng, severity, vehicles,
              deaths, injured, reporter_name, reporter_contact, description
         FROM accidents ORDER BY COALESCE(occurred_at, created_at) DESC`
    );
    const { rows: statsRows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(deaths),0)::int AS deaths,
             COALESCE(SUM(injured),0)::int AS injured,
             COALESCE(SUM(CASE WHEN severity='grave' THEN 1 ELSE 0 END),0)::int AS grave,
             COALESCE(SUM(CASE WHEN severity='less_grave' THEN 1 ELSE 0 END),0)::int AS less_grave
        FROM accidents`);
    const s = statsRows[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport-accidents-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fillColor('#991b1b').fontSize(22).text('Rapport Alerte Accident', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#334155').fontSize(10).text(`Généré le ${new Date().toLocaleString('fr-FR')}`, { align: 'center' });
    doc.moveDown();

    // Stats summary
    doc.fillColor('#0f172a').fontSize(14).text('Synthèse', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor('#0f172a');
    doc.text(`Total signalements : ${s.total}`);
    doc.text(`Accidents graves    : ${s.grave}`);
    doc.text(`Accidents moins graves : ${s.less_grave}`);
    doc.text(`Morts   : ${s.deaths}`);
    doc.text(`Blessés : ${s.injured}`);
    doc.moveDown();

    doc.fontSize(14).fillColor('#0f172a').text('Détail des accidents', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#334155');

    if (!rows.length) {
      doc.text('Aucun signalement enregistré.');
    } else {
      rows.forEach((r, i) => {
        if (doc.y > 760) doc.addPage();
        doc.fillColor('#991b1b').fontSize(11).text(`#${r.id} — ${r.place_name || 'Lieu inconnu'}`);
        doc.fillColor('#0f172a').fontSize(9);
        doc.text(`Accident   : ${r.occurred_at ? new Date(r.occurred_at).toLocaleString('fr-FR') : '—'}`);
        doc.text(`Signalé le : ${new Date(r.created_at).toLocaleString('fr-FR')}`);
        doc.text(`Gravité    : ${r.severity === 'grave' ? 'Grave' : 'Moins grave'}`);
        doc.text(`Position   : ${r.lat}, ${r.lng}`);
        doc.text(`Engins     : ${r.vehicles || '—'}`);
        doc.text(`Victimes   : ${r.deaths} mort(s), ${r.injured} blessé(s)`);
        doc.text(`Informateur: ${r.reporter_name || '—'} (${r.reporter_contact || '—'})`);
        if (r.description) doc.text(`Description: ${r.description}`);
        doc.moveDown(0.6);
      });
    }
    doc.end();
  } catch (e) { console.error(e); res.status(500).end(); }
});

// ---------- Push notifications ----------
app.get('/api/push/vapid-public', (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'push_disabled' });
  res.json({ key: VAPID_PUBLIC });
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const sub = req.body || {};
    if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'invalid_subscription' });
    }
    await pool.query(
      `INSERT INTO push_subs (endpoint, p256dh, auth) VALUES ($1,$2,$3)
       ON CONFLICT (endpoint) DO NOTHING`,
      [sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await pool.query('DELETE FROM push_subs WHERE endpoint = $1', [endpoint]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

async function sendPushToAll(payload) {
  if (!pushEnabled) return;
  const { rows } = await pool.query('SELECT endpoint, p256dh, auth FROM push_subs');
  const body = JSON.stringify(payload);
  const stale = [];
  await Promise.all(rows.map(async r => {
    const sub = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
    try {
      await webpush.sendNotification(sub, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) stale.push(r.endpoint);
      else console.error('push send error', err.statusCode || err.message);
    }
  }));
  if (stale.length) {
    await pool.query('DELETE FROM push_subs WHERE endpoint = ANY($1)', [stale]);
  }
}

// ---------- Boot ----------
(async () => {
  try {
    await migrate();
    console.log('DB ready');
  } catch (e) {
    console.error('DB connection failed:', e.message);
  }
  const port = parseInt(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log('listening on ' + port));
})();
