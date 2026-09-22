document.addEventListener('DOMContentLoaded', async () => {

  // ==================================================
  // CONFIG
  // ==================================================
  const SLOT_DURATION_MINUTES = 30;

  const SOCKET_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:4570'
    : 'https://ptamanagement-production.up.railway.app';

  const GET_QUEUE_API = '/queue';
  const DISPATCH_API  = '/queue/dispatchDriver';

  // ==================================================
  // DOM REFS
  // ==================================================
  const terminalSelect  = document.getElementById("terminal_id");
  const queueList       = document.getElementById('queue-list');
  const queueEmpty      = document.getElementById('queue-empty');
  const queueStatusText = document.getElementById('queue-status-text');
  const queueCountBadge = document.getElementById('queue-count-badge');
  const liveDot         = document.querySelector('.queue-live-dot');

  // ==================================================
  // STATE
  // ==================================================
  let terminalsData       = [];
  let koronadalCity       = null;
  let selectedMarker      = null;
  let koronadalCityMarker = null;
  let routeLine           = null;

  let currentTerminalId = null;
  let queueCache        = new Map();
  let socket            = null;

  // ==================================================
  // MAP ICONS
  // ==================================================
  function dotIcon(color) {
    return L.divIcon({
      className: 'terminal-dot-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      html: `<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="6" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      </svg>`
    });
  }

  const cityIcon = dotIcon('#e63946');

  const terminalIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  // ==================================================
  // MAP INIT
  // ==================================================
  const southCotabatoBounds = L.latLngBounds([[5.97, 124.55], [6.65, 125.3]]);
  const map = L.map('mapTop', {
    maxBounds: southCotabatoBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 10,
    maxZoom: 18
  });
  map.fitBounds(southCotabatoBounds, { padding: [10, 10] });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // ==================================================
  // LOAD TERMINALS
  // ==================================================
  await loadTerminals();

  async function loadTerminals() {
    try {
      const res = await fetch('/terminals');
      const data = await res.json();

      const terminals = data.terminals || [];
      terminalsData = terminals;

      terminalSelect.innerHTML = '<option value="">Select terminal</option>';

      terminals.forEach(term => {
        if (term.terminal_name !== "Koronadal City") {
          const option = document.createElement("option");
          option.value = term.terminal_id;
          option.textContent = `Koronadal - ${term.terminal_name}`;
          terminalSelect.appendChild(option);
        }
      });

      koronadalCity = terminals.find(t => t.terminal_name === "Koronadal City") || null;

    } catch (err) {
      console.error("Failed to load terminals:", err);
    }
  }

  // ==================================================
  // TERMINAL DROPDOWN — MAP + QUEUE
  // ==================================================
  terminalSelect.addEventListener("change", async function () {
    const terminalId = Number(this.value);

    if (!terminalId) {
      clearMap();
      currentTerminalId = null;
      queueCache.clear();
      renderQueue();
      return;
    }

    const terminal = terminalsData.find(
      t => Number(t.terminal_id) === terminalId
    );
    if (!terminal) return;

    const lat = parseFloat(terminal.latitude);
    const lng = parseFloat(terminal.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      console.warn("Selected terminal has invalid coordinates:", terminal);
      return;
    }

    clearMap();

    selectedMarker = L.marker([lat, lng], { icon: terminalIcon })
      .addTo(map)
      .bindPopup(` ${terminal.terminal_name}`)
      .openPopup();

    let cityLatLng = null;
    if (koronadalCity) {
      const cLat = parseFloat(koronadalCity.latitude);
      const cLng = parseFloat(koronadalCity.longitude);

      if (!isNaN(cLat) && !isNaN(cLng)) {
        cityLatLng = [cLat, cLng];
        koronadalCityMarker = L.marker(cityLatLng, { icon: cityIcon })
          .addTo(map)
          .bindPopup("Koronadal City");
      }
    }

    if (cityLatLng) {
      await drawRoute(cityLatLng, [lat, lng]);
      map.fitBounds(L.latLngBounds([cityLatLng, [lat, lng]]), { padding: [40, 40] });
    } else {
      map.setView([lat, lng], 14);
    }

    // >>> QUEUE: load this terminal's queue
    currentTerminalId = terminalId;
    await loadQueue(terminalId);
  });

  function clearMap() {
    if (selectedMarker) { map.removeLayer(selectedMarker); selectedMarker = null; }
    if (koronadalCityMarker) { map.removeLayer(koronadalCityMarker); koronadalCityMarker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  // ==================================================
  // ROUTE DRAWING (OSRM)
  // ==================================================
  async function drawRoute(fromLatLng, toLatLng) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLatLng[1]},${fromLatLng[0]};${toLatLng[1]},${toLatLng[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        routeLine = L.polyline(coords, { color: 'red', weight: 4, opacity: 0.6 }).addTo(map);
      } else {
        routeLine = L.polyline([fromLatLng, toLatLng], { color: 'red', weight: 3, dashArray: '6,6' }).addTo(map);
      }
    } catch (err) {
      console.error("Failed to fetch route:", err);
      routeLine = L.polyline([fromLatLng, toLatLng], { color: 'red', weight: 3, dashArray: '6,6' }).addTo(map);
    }
  }

  // ==================================================
  // QUEUE HELPERS
  // ==================================================
  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function slotRange(scheduledAt) {
    if (!scheduledAt) return '—';
    const end   = new Date(scheduledAt);
    const start = new Date(end.getTime() - SLOT_DURATION_MINUTES * 60 * 1000);
    return `${fmtTime(start)} – ${fmtTime(end)}`;
  }

  function timeUntil(iso) {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) {
      const mins = Math.floor(-diff / 60000);
      return mins < 1 ? 'overdue' : `overdue ${mins}m`;
    }
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'starting now';
    return `in ${mins} min`;
  }

  // ==================================================
  // QUEUE — FETCH + RENDER
  // ==================================================
  async function loadQueue(terminalId) {
    if (!terminalId) {
      queueCache.clear();
      renderQueue();
      return;
    }

    try {
      if (queueStatusText) queueStatusText.textContent = 'Loading…';

      const url = `${GET_QUEUE_API}?terminal_id=${encodeURIComponent(terminalId)}`;
      const res = await fetch(url, { credentials: 'include' });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load queue');
      }

      queueCache.clear();
      (result.data || []).forEach(r => queueCache.set(r.queue_id, r));
      renderQueue();

    } catch (err) {
      console.error('[queue] loadQueue error:', err);
      if (queueStatusText) queueStatusText.textContent = 'Failed to load queue';
      queueCache.clear();
      renderQueue();
    }
  }

  function renderQueue() {
    if (!queueList) return;

    const rows = Array.from(queueCache.values())
      .sort((a, b) => {
        const aT = new Date(a.scheduled_dispatch_at || a.joined_at).getTime();
        const bT = new Date(b.scheduled_dispatch_at || b.joined_at).getTime();
        return aT - bT;
      });

    if (queueCountBadge) queueCountBadge.textContent = rows.length;
    queueList.innerHTML = '';

    if (rows.length === 0) {
      if (queueEmpty) queueEmpty.style.display = 'flex';
      if (queueStatusText) {
        queueStatusText.textContent = currentTerminalId
          ? 'Queue is empty'
          : 'Select a terminal to view its queue';
      }
      if (liveDot) liveDot.classList.toggle('active', !!currentTerminalId);
      return;
    }

    if (queueEmpty) queueEmpty.style.display = 'none';
    if (queueStatusText) {
      queueStatusText.textContent = `${rows.length} vehicle${rows.length === 1 ? '' : 's'} waiting`;
    }
    if (liveDot) liveDot.classList.add('active');

    rows.forEach((row, i) => {
      queueList.appendChild(buildRow(row, i + 1));
    });
  }

  function buildRow(r, position) {
  const el = document.createElement('div');
  el.className = 'queue-row';
  el.dataset.queueId = r.queue_id;

  const name = [r.first_name, r.middle_name, r.last_name]
    .filter(Boolean)
    .join(' ') || 'Unknown';

  const inside  = r.driver_status === 'ACTIVE';
  const isFront = position === 1;

  // Status label + class
  let statusLabel = 'Waiting';
  let statusClass = 'status-waiting';

  if (isFront && inside) {
    statusLabel = 'Next to depart';
    statusClass = 'status-ready';
  } else if (isFront && !inside) {
    statusLabel = 'Departing…';
    statusClass = 'status-departing';
  } else if (!inside) {
    statusLabel = 'Moved out';
    statusClass = 'status-transit';
  }

  el.innerHTML = `
    <div class="col-pos">${position}${isFront ? ' 👑' : ''}</div>
    <div class="col-driver-name">
      <span class="driver-status-dot ${inside ? 'in' : 'out'}"
            title="${inside ? 'Inside polygon' : 'Outside polygon'}"></span>
      <span>${name}</span>
    </div>
    <div class="col-vehicle">${r.plate_number || '—'}</div>
    <div class="col-slot">
      <div class="slot-time">${slotRange(r.scheduled_dispatch_at)}</div>
      <div class="slot-hint">${timeUntil(r.scheduled_dispatch_at)}</div>
    </div>
    <div class="col-status ${statusClass}">${statusLabel}</div>
  `;

  return el;
}

  // ==================================================
  // QUEUE — DISPATCH
  // ==================================================
  async function dispatchVehicle(queueId) {
    const row = queueCache.get(queueId);
    if (!row) return;

    const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
    if (!confirm(`Dispatch ${name} (${row.plate_number}) now?`)) return;

    const btn = queueList.querySelector(
      `.btn-dispatch[data-queue-id="${queueId}"]`
    );
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
    }

    try {
      const res = await fetch(DISPATCH_API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: queueId,
          approval_type: 'MANUAL'
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Dispatch failed');
      }

      queueCache.delete(queueId);
      renderQueue();

    } catch (err) {
      console.error('[queue] dispatch error:', err);
      alert(err.message || 'Failed to dispatch vehicle');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Dispatch';
      }
    }
  }

  // ==================================================
  // QUEUE — SOCKET
  // ==================================================
  function initSocket() {
    if (typeof io === 'undefined') {
      console.warn('[queue] socket.io client not loaded — live updates disabled');
      return;
    }

    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('[queue] connected:', socket.id);
      socket.emit('admin:subscribe');
    });

    socket.on('connect_error', (err) => {
      console.warn('[queue] connect_error:', err.message);
    });

    socket.on('queue:driver_joined', (entry) => {
      console.log('[queue] driver joined:', entry);
      if (!currentTerminalId) return;
      loadQueue(currentTerminalId);
    });

    socket.on('queue:driver_dispatched', ({ queue_id }) => {
      queueCache.delete(queue_id);
      renderQueue();
    });

    socket.on('queue:driver_left', ({ driverId }) => {
      for (const [id, row] of queueCache) {
        if (row.driver_info_id === driverId) {
          queueCache.delete(id);
        }
      }
      renderQueue();
    });
  }

  // ==================================================
  // INIT
  // ==================================================
  initSocket();

  setInterval(() => {
    if (queueCache.size > 0) renderQueue();
  }, 30000);

});