const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.MAP_CONFIG_PATH || path.join(__dirname, '..', 'map-config.json');

const DEFAULT_CENTER = {
  lat: parseFloat(process.env.MAP_CENTER_LAT) || 6.499362374631149,
  lng: parseFloat(process.env.MAP_CENTER_LNG) || 124.85210363662989
};

function loadCenter() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) return saved;
  } catch (_) { /* no file yet, use default */ }
  return DEFAULT_CENTER;
}

let mapCenter = loadCenter();

exports.getMapCenter = function (req, res) {
  res.json({ success: true, data: mapCenter });
};

exports.updateMapCenter = function (req, res) {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);

  if (!Number.isFinite(lat) || lat < -90  || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'Invalid latitude/longitude' });
  }

  mapCenter = { lat, lng };

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(mapCenter));
  } catch (err) {
    console.warn('Could not persist map center (kept in memory only):', err.message);
  }

  res.json({ success: true, data: mapCenter });
};