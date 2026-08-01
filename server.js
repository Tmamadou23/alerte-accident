const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:210255@localhost:5432/bd_alerte';

const pool = new Pool({ connectionString });

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

app.get('/api/accidents', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, lat, lng, place_name, reporter_name, reporter_contact,
              vehicles, severity, deaths, injured, description,
              (photo_data IS NOT NULL) AS has_photo, created_at
         FROM accidents ORDER BY created_at DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/accidents', async (req, res) => {
  try {
    const b = req.body || {};
    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'invalid_coords' });

    let mime = null;
    let buf = null;
    if (b.photo && typeof b.photo === 'string' && b.photo.startsWith('data:')) {
      const m = b.photo.match(/^data:([^;]+);base64,(.*)$/);
      if (m) {
        mime = m[1];
        buf = Buffer.from(m[2], 'base64');
        if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'photo_too_large' });
      }
    }
    const vehicles = Array.isArray(b.vehicles) ? b.vehicles.join(',') : String(b.vehicles || '');
    const { rows } = await pool.query(
      `INSERT INTO accidents (lat, lng, place_name, reporter_name, reporter_contact,
        vehicles, severity, deaths, injured, description, photo_mime, photo_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [lat, lng, String(b.place_name || '').slice(0, 250),
        String(b.reporter_name || '').slice(0, 120),
        String(b.reporter_contact || '').slice(0, 120),
        vehicles.slice(0, 250),
        String(b.severity || 'less_grave').slice(0, 30),
        parseInt(b.deaths) || 0,
        parseInt(b.injured) || 0,
        String(b.description || '').slice(0, 2000),
        mime, buf]
    );
    res.json({ id: rows[0].id, ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
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
  } catch (e) {
    res.status(500).end();
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(deaths),0)::int AS deaths,
             COALESCE(SUM(injured),0)::int AS injured,
             SUM(CASE WHEN severity='grave' THEN 1 ELSE 0 END)::int AS grave,
             SUM(CASE WHEN severity='less_grave' THEN 1 ELSE 0 END)::int AS less_grave
        FROM accidents
    `);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

(async () => {
  try {
    await migrate();
    console.log('DB ready');
  } catch (e) {
    console.error('DB connection failed:', e.message);
    console.error('Vérifiez que PostgreSQL est démarré et que la BD "bd_alerte" existe.');
  }
  const port = parseInt(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log('Serveur démarré sur http://localhost:' + port));
})();
