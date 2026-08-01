// ---------- i18n ----------
const I18N = {
  fr: {
    app_title: "Alerte Accident", report_btn: "Signaler", stats_btn: "Statistiques",
    filters: "Filtres", grave: "Grave", less_grave: "Moins grave",
    v_car: "Voiture", v_moto: "Moto", v_truck: "Camion", v_bike: "Vélo",
    v_ped: "Piéton", v_bus: "Bus", v_other: "Autre",
    report_title: "Signaler un accident", reporter_name: "Nom et prénom de l'auteur du signalement",
    reporter_contact: "Contact", place_name: "Nom du lieu",
    lat: "Latitude", lng: "Longitude", use_geo: "📍 Utiliser ma position",
    geo_hint: "ou cliquez sur la carte pour choisir",
    vehicles: "Engins impliqués", severity: "Niveau",
    deaths: "Morts", injured: "Blessés", description: "Description",
    photo: "Photo", cancel: "Annuler", submit: "Envoyer l'alerte",
    stats_title: "Statistiques", total: "Signalements", g: "Graves", lg: "Moins graves",
    ok_saved: "Alerte enregistrée. Merci !", err_save: "Erreur d'envoi",
    need_coords: "Sélectionnez un lieu (position ou clic sur la carte)",
    need_vehicle: "Choisissez au moins un engin",
    new_alert: "Nouvelle alerte à proximité !",
    notif_enabled: "Notifications activées", notif_denied: "Notifications refusées",
    geo_unavailable: "Géolocalisation indisponible"
  },
  en: {
    app_title: "Accident Alert", report_btn: "Report", stats_btn: "Statistics",
    filters: "Filters", grave: "Severe", less_grave: "Minor",
    v_car: "Car", v_moto: "Motorcycle", v_truck: "Truck", v_bike: "Bicycle",
    v_ped: "Pedestrian", v_bus: "Bus", v_other: "Other",
    report_title: "Report an accident", reporter_name: "Full name",
    reporter_contact: "Contact (phone / email)", place_name: "Location name",
    lat: "Latitude", lng: "Longitude", use_geo: "📍 Use my location",
    geo_hint: "or click on the map to pick",
    vehicles: "Vehicles involved", severity: "Level",
    deaths: "Deaths", injured: "Injured", description: "Description",
    photo: "Photo", cancel: "Cancel", submit: "Send alert",
    stats_title: "Statistics", total: "Reports", g: "Severe", lg: "Minor",
    ok_saved: "Alert saved. Thank you!", err_save: "Send error",
    need_coords: "Pick a location (GPS or map click)",
    need_vehicle: "Pick at least one vehicle",
    new_alert: "New alert nearby!",
    notif_enabled: "Notifications enabled", notif_denied: "Notifications denied",
    geo_unavailable: "Geolocation unavailable"
  }
};
let LANG = localStorage.getItem('lang') || 'fr';
function t(k) { return (I18N[LANG] && I18N[LANG][k]) || I18N.fr[k] || k; }
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.documentElement.lang = LANG;
}
document.getElementById('lang').value = LANG;
document.getElementById('lang').addEventListener('change', e => {
  LANG = e.target.value; localStorage.setItem('lang', LANG); applyI18n(); renderStatsIfOpen();
});
applyI18n();

// ---------- Map ----------
const map = L.map('map').setView([14.6928, -17.4467], 6); // Default Dakar-ish
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
const cluster = L.markerClusterGroup();
map.addLayer(cluster);

// Try user location
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(p => {
    map.setView([p.coords.latitude, p.coords.longitude], 12);
  }, () => {}, { timeout: 5000 });
}

// Pick location by clicking map when modal is open
let pickMode = false;
map.on('click', e => {
  if (!pickMode) return;
  document.getElementById('in-lat').value = e.latlng.lat.toFixed(6);
  document.getElementById('in-lng').value = e.latlng.lng.toFixed(6);
});

// ---------- Modal helpers ----------
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => {
  e.target.closest('.modal').classList.add('hidden'); pickMode = false;
}));

document.getElementById('btn-report').addEventListener('click', () => {
  openModal('modal-report');
  pickMode = true;
});
document.getElementById('btn-stats').addEventListener('click', async () => {
  openModal('modal-stats');
  await renderStats();
});

// ---------- Toast ----------
function toast(msg, cls) {
  const t = document.getElementById('toast');
  t.className = 'toast ' + (cls || '');
  t.textContent = msg;
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ---------- Geo button ----------
document.getElementById('btn-geo').addEventListener('click', () => {
  if (!navigator.geolocation) return toast(t('geo_unavailable'), 'err');
  navigator.geolocation.getCurrentPosition(p => {
    document.getElementById('in-lat').value = p.coords.latitude.toFixed(6);
    document.getElementById('in-lng').value = p.coords.longitude.toFixed(6);
    map.setView([p.coords.latitude, p.coords.longitude], 15);
  }, () => toast(t('geo_unavailable'), 'err'));
});

// ---------- Photo preview + resize ----------
const photoInput = document.getElementById('in-photo');
const preview = document.getElementById('preview');
let photoDataUrl = null;

photoInput.addEventListener('change', () => {
  const f = photoInput.files[0]; if (!f) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => { img.src = reader.result; };
  img.onload = () => {
    const maxDim = 1280;
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      const r = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    photoDataUrl = c.toDataURL('image/jpeg', 0.82);
    preview.src = photoDataUrl; preview.classList.add('show');
  };
  reader.readAsDataURL(f);
});

// ---------- Submit ----------
document.getElementById('form-report').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const data = {
    reporter_name: f.reporter_name.value.trim(),
    reporter_contact: f.reporter_contact.value.trim(),
    place_name: f.place_name.value.trim(),
    lat: parseFloat(f.lat.value),
    lng: parseFloat(f.lng.value),
    vehicles: Array.from(f.querySelectorAll('input[name=vehicles]:checked')).map(c => c.value),
    severity: (f.querySelector('input[name=severity]:checked') || {}).value,
    deaths: parseInt(f.deaths.value) || 0,
    injured: parseInt(f.injured.value) || 0,
    description: f.description.value.trim(),
    photo: photoDataUrl
  };
  if (isNaN(data.lat) || isNaN(data.lng)) return toast(t('need_coords'), 'err');
  if (!data.vehicles.length) return toast(t('need_vehicle'), 'err');

  try {
    const r = await fetch('/api/accidents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw 0;
    toast(t('ok_saved'), 'ok');
    closeModal('modal-report');
    pickMode = false;
    f.reset(); preview.classList.remove('show'); photoDataUrl = null;
    await loadAccidents();
  } catch {
    toast(t('err_save'), 'err');
  }
});

// ---------- Load + filter ----------
let ALL = [];
let SEEN = new Set();
let FIRST_LOAD = true;

function iconFor(sev) {
  const color = sev === 'grave' ? '#dc2626' : '#f59e0b';
  return L.divIcon({
    className: 'acc-marker',
    html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:white;font-weight:700;font-size:13px;">!</span></div>`,
    iconSize: [26, 26], iconAnchor: [13, 26]
  });
}

function popupHtml(a) {
  const photo = a.has_photo ? `<img src="/photo/${a.id}" alt="photo"/>` : '';
  const date = new Date(a.created_at).toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-US');
  const sevLabel = t(a.severity);
  return `<div class="popup">
    <h4>${escapeHtml(a.place_name || '—')}</h4>
    <div><span class="badge ${a.severity}">${sevLabel}</span></div>
    <div class="meta">${date}</div>
    <div style="margin-top:6px"><b>${t('vehicles')}:</b> ${escapeHtml(a.vehicles || '—')}</div>
    <div><b>${t('deaths')}:</b> ${a.deaths} · <b>${t('injured')}:</b> ${a.injured}</div>
    ${a.description ? `<div style="margin-top:6px">${escapeHtml(a.description)}</div>` : ''}
    <div class="meta" style="margin-top:6px">${t('reporter_name')}: ${escapeHtml(a.reporter_name || '—')}<br/>${escapeHtml(a.reporter_contact || '')}</div>
    ${photo}
  </div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function refreshMarkers() {
  cluster.clearLayers();
  const sevs = Array.from(document.querySelectorAll('.f-sev:checked')).map(c => c.value);
  const vehs = Array.from(document.querySelectorAll('.f-v:checked')).map(c => c.value);
  ALL.forEach(a => {
    if (!sevs.includes(a.severity)) return;
    const list = (a.vehicles || '').split(',').filter(Boolean);
    if (list.length && !list.some(v => vehs.includes(v))) return;
    const m = L.marker([a.lat, a.lng], { icon: iconFor(a.severity) });
    m.bindPopup(popupHtml(a));
    cluster.addLayer(m);
  });
}
document.querySelectorAll('.f-sev, .f-v').forEach(c => c.addEventListener('change', refreshMarkers));

async function loadAccidents() {
  try {
    const r = await fetch('/api/accidents');
    const rows = await r.json();
    // Detect new ones for notifications
    if (!FIRST_LOAD) {
      rows.forEach(a => {
        if (!SEEN.has(a.id)) notifyNew(a);
      });
    }
    rows.forEach(a => SEEN.add(a.id));
    ALL = rows;
    FIRST_LOAD = false;
    refreshMarkers();
  } catch (e) { console.error(e); }
}

// ---------- Notifications ----------
document.getElementById('btn-notif').addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('Notifications ' + t('geo_unavailable'), 'err');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? t('notif_enabled') : t('notif_denied'), p === 'granted' ? 'ok' : 'err');
});

function notifyNew(a) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = t('new_alert');
  const body = `${a.place_name || ''} — ${t(a.severity)}`;
  try {
    const n = new Notification(title, { body, icon: '/icon.png' });
    n.onclick = () => { window.focus(); map.setView([a.lat, a.lng], 15); };
  } catch {}
}

// ---------- Stats ----------
let STATS_OPEN = false;
async function renderStats() {
  STATS_OPEN = true;
  const el = document.getElementById('stats-body');
  el.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#64748b">…</div>';
  try {
    const s = await (await fetch('/api/stats')).json();
    el.innerHTML = `
      <div class="stat-card"><div class="n">${s.total || 0}</div><div class="l">${t('total')}</div></div>
      <div class="stat-card" style="border-left-color:#dc2626"><div class="n">${s.grave || 0}</div><div class="l">${t('g')}</div></div>
      <div class="stat-card" style="border-left-color:#f59e0b"><div class="n">${s.less_grave || 0}</div><div class="l">${t('lg')}</div></div>
      <div class="stat-card" style="border-left-color:#7c3aed"><div class="n">${s.deaths || 0}</div><div class="l">${t('deaths')}</div></div>
      <div class="stat-card" style="border-left-color:#0891b2"><div class="n">${s.injured || 0}</div><div class="l">${t('injured')}</div></div>
    `;
  } catch { el.innerHTML = '<div>Error</div>'; }
}
function renderStatsIfOpen() { if (STATS_OPEN && !document.getElementById('modal-stats').classList.contains('hidden')) renderStats(); }
document.querySelector('#modal-stats [data-close]').addEventListener('click', () => STATS_OPEN = false);

// ---------- Boot ----------
loadAccidents();
setInterval(loadAccidents, 20000); // Poll every 20s for new alerts
