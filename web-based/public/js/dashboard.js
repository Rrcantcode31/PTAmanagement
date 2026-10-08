(function setupMobileSidebar() {
  const init = () => {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const openBtn  = document.getElementById('sidebar-toggle');
    const closeBtn = document.getElementById('sidebar-close');

    if (!sidebar || !overlay) return; // sidebar not present on this page

    const open = () => {
      sidebar.classList.add('open');
      overlay.classList.add('open');
      document.body.classList.add('no-scroll');
    };

    const close = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      document.body.classList.remove('no-scroll');
    };

    if (openBtn)  openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    // Close on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
    });

    // Close when returning to desktop widths
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      // Only act if we crossed the breakpoint
      if (lastWidth <= 900 && w > 900) close();
      lastWidth = w;
    });

    // Close when a nav link is tapped (so the drawer slides away)
    sidebar.querySelectorAll('a.nav-btn, a.upload-btn').forEach((a) => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 900) close();
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Start fetching terminals immediately, in parallel with DOM/map setup.
const terminalsPromise = fetch('/terminals')
  .then((r) => {
    if (!r.ok) throw new Error('Server error');
    return r.json();
  });
terminalsPromise.catch(() => {}); // avoid unhandled rejection; handled later

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const modal = $('terminal-modal');
  const modalLat = $('modal-lat');
  const modalLng = $('modal-lng');
  const modalName = $('modal-name-input');
  const modalAddress = $('modal-address-input');
  const modalSaveBtn = $('modal-save');
  const modalCloseBtn = $('modal-close');

  const mapEl = $('map');
  const addBtn = document.querySelector('.add-btn');
  const updateBtn = document.querySelector('.update-btn');
  const deleteBtn = document.querySelector('.delete-btn');

  const validationModal = $('validation-modal');
  const validationIcon = $('validation-icon');
  const validationTitle = $('validation-title');
  const validationMessage = $('validation-message');
  const validationCancel = $('validation-cancel');
  const validationConfirm = $('validation-confirm');

  if (
    !mapEl || typeof window.L === 'undefined' || !modal || !modalLat || !modalLng ||
    !modalName || !modalAddress || !modalSaveBtn || !modalCloseBtn || !addBtn ||
    !updateBtn || !deleteBtn || !validationModal || !validationIcon ||
    !validationTitle || !validationMessage || !validationCancel || !validationConfirm
  ) {
    console.error('Missing required DOM elements or Leaflet not loaded.');
    return;
  }

  // ==========================================================
  // VALIDATION MODAL
  // ==========================================================
  let validationResolve = null;
  const ICONS = { delete: '🗑️', success: '✓', error: '✕', warning: '⚠️' };

  function showValidationModal({
    type = 'warning', title = 'Warning', message = '',
    confirmText = 'OK', cancelText = 'Cancel', showCancel = true
  }) {
    validationModal.className = `validation-modal ${type}`;
    validationModal.classList.remove('hidden');
    validationTitle.textContent = title;
    validationMessage.innerHTML = message;
    validationConfirm.textContent = confirmText;
    validationCancel.textContent = cancelText;
    validationCancel.style.display = showCancel ? 'inline-block' : 'none';
    validationIcon.textContent = ICONS[type] || ICONS.warning;
    return new Promise((resolve) => { validationResolve = resolve; });
  }

  const alertModal = (type, title, message) =>
    showValidationModal({ type, title, message, confirmText: 'OK', showCancel: false });

  function closeValidationModal(result) {
    validationModal.classList.add('hidden');
    if (validationResolve) {
      validationResolve(result);
      validationResolve = null;
    }
  }

  validationConfirm.addEventListener('click', () => closeValidationModal(true));
  validationCancel.addEventListener('click', () => closeValidationModal(false));
  validationModal.querySelector('.validation-modal-overlay')
    .addEventListener('click', () => closeValidationModal(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !validationModal.classList.contains('hidden')) {
      closeValidationModal(false);
    }
  });

  // ==========================================================
  // MAP SETUP
  // ==========================================================
  const southCotabatoBounds = L.latLngBounds([[5.95, 124.55], [6.65, 125.2]]);

  const canvasRenderer = L.canvas({ padding: 0.5, tolerance: 6 });

  const map = L.map('map', {
    maxBounds: southCotabatoBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 10.3,
    maxZoom: 20.5,
    preferCanvas: true,
    zoomSnap: 0.5,
    zoomAnimation: true
  });
  map.fitBounds(southCotabatoBounds, { padding: [10, 10] });

  const tileBounds = southCotabatoBounds.pad(1);

  const tileCommon = {
    bounds: tileBounds,
    minZoom: 10.3,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 1
  };

  const defaultLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    ...tileCommon,
    maxZoom: 20.5,
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      ...tileCommon,
      maxZoom: 18,
      maxNativeZoom: 18,
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }
  );

  defaultLayer.addTo(map);

  L.control.layers(
    { 'Default (2D)': defaultLayer, Satellite: satelliteLayer },
    null,
    { position: 'topright' }
  ).addTo(map);

  map.on('baselayerchange', (e) => {
    const newMax = Number(e.layer?.options?.maxZoom) || 20.5;
    map.setMaxZoom(newMax);
    if (map.getZoom() > newMax) map.setZoom(newMax);
  });

  // ==========================================================
  // ICONS
  // ==========================================================
  const pinSvg = (fill, w, h) => `
    <svg width="${w}" height="${h}" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"
            fill="${fill}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="4.5" fill="#fff"/>
    </svg>`;

  const makePinIcon = (fill, w, h) =>
    L.divIcon({
      className: 'terminal-pin-icon',
      html: pinSvg(fill, w, h),
      iconSize: [w, h],
      iconAnchor: [w / 2, h],
      popupAnchor: [1, -h + 7]
    });

  const terminalIcon = makePinIcon('#e53935', 25, 41);
  const ghostPinIcon = makePinIcon('#fbc02d', 30, 48);

  const HIGHLIGHTED_TERMINAL = 'Koronadal City';
  const isHighlighted = (name) =>
    (name || '').trim().toLowerCase() === HIGHLIGHTED_TERMINAL.toLowerCase();

  // ==========================================================
  // MARKER FACTORY
  // ==========================================================
  const markerGroup = L.featureGroup().addTo(map);

  function createMarker({ terminal_id, terminal_name, terminal_address, latitude, longitude }) {
    const latlng = [Number(latitude), Number(longitude)];
    let marker;

    if (isHighlighted(terminal_name)) {
      marker = L.marker(latlng, { icon: terminalIcon });
      marker.bindTooltip(terminal_name, {
        permanent: true,
        direction: 'right',
        offset: [14, 2],
        className: 'terminal-label'
      });
    } else {
      marker = L.circleMarker(latlng, {
        renderer: canvasRenderer,
        radius: 6,
        color: '#fafafb',
        weight: 2,
        fillColor: '#0d00ff',
        fillOpacity: 1
      });
    }

    marker.terminal_id = terminal_id;
    marker.terminal_name = terminal_name;
    marker.terminal_address = terminal_address;
    return marker;
  }

  function replaceMarker(oldMarker, data) {
    markerGroup.removeLayer(oldMarker);
    const fresh = createMarker(data);
    markerGroup.addLayer(fresh);
    return fresh;
  }

  // ==========================================================
  // MODES
  // ==========================================================
  let addMode = false;
  let updateMode = false;
  let deleteMode = false;

  let ghostPin = null;
  let sourceMarker = null;

  function removeGhostPin() {
    if (ghostPin) {
      map.removeLayer(ghostPin);
      ghostPin = null;
    }
    sourceMarker = null;
  }

  function spawnGhostPin(marker) {
    removeGhostPin();
    const start = marker.getLatLng();
    sourceMarker = marker;

    ghostPin = L.marker([start.lat, start.lng], {
      icon: ghostPinIcon,
      draggable: true,
      zIndexOffset: 1000,
      opacity: 0.95
    }).addTo(map);

    ghostPin.bindTooltip('Drag to move terminal', { direction: 'top', offset: [0, -46] });

    const syncCoords = (e) => {
      const ll = e.target.getLatLng();
      modalLat.textContent = ll.lat.toFixed(6);
      modalLng.textContent = ll.lng.toFixed(6);
    };
    ghostPin.on('drag', syncCoords);
    ghostPin.on('dragend', syncCoords);
  }

  const showModal = ({ lat, lng, name, address }) => {
    modalLat.textContent = lat;
    modalLng.textContent = lng;
    modalName.value = name || '';
    modalAddress.value = address || '';
    modal.classList.remove('hidden');
    modalName.focus();
  };

  const hideModal = () => modal.classList.add('hidden');

  function openUpdateModal(marker) {
    spawnGhostPin(marker);
    const ll = marker.getLatLng();
    showModal({
      lat: ll.lat.toFixed(6),
      lng: ll.lng.toFixed(6),
      name: marker.terminal_name || '',
      address: marker.terminal_address || ''
    });
  }

  const resetModes = () => {
    addMode = updateMode = deleteMode = false;
    addBtn.classList.remove('active');
    updateBtn.classList.remove('active');
    deleteBtn.classList.remove('active');
    map.dragging.enable();
    removeGhostPin();
  };

  const pending = { addLat: null, addLng: null };
  const clearPending = () => { pending.addLat = pending.addLng = null; };

  modalCloseBtn.addEventListener('click', () => {
    hideModal();
    clearPending();
    resetModes();
  });

  const toggleMode = (mode, btn, onEnter) => () => {
    const wasActive = btn.classList.contains('active');
    resetModes();
    if (wasActive) {
      hideModal();
      if (mode === 'add') clearPending();
      return;
    }
    btn.classList.add('active');
    onEnter();
  };

  addBtn.addEventListener('click', toggleMode('add', addBtn, () => {
    addMode = true;
    map.dragging.disable();
  }));
  updateBtn.addEventListener('click', toggleMode('update', updateBtn, () => { updateMode = true; }));
  deleteBtn.addEventListener('click', toggleMode('delete', deleteBtn, () => { deleteMode = true; }));

  // ==========================================================
  // DELETE
  // ==========================================================
  async function handleDeleteMarker(marker) {
    const name = marker.terminal_name || 'this terminal';
    const confirmed = await showValidationModal({
      type: 'delete',
      title: 'Delete Terminal?',
      message: `Permanently delete <span class="highlight-value">${name}</span>? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      showCancel: true
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/DeleteTerminalLocation/${marker.terminal_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await res.json();

      if (result.error) {
        await alertModal('error', 'Delete Failed', result.error);
        return;
      }

      markerGroup.removeLayer(marker);
      cacheTerminals();
      await alertModal('success', 'Terminal Deleted', 'The terminal was removed successfully.');
    } catch (err) {
      console.error(err);
      await alertModal('error', 'Delete Failed', 'Something went wrong while deleting this terminal.');
    }
  }

  // ==========================================================
  // CLICK HANDLING
  // ==========================================================
  markerGroup.on('click', async (e) => {
    const marker = e.layer;
    if (updateMode) {
      openUpdateModal(marker);
    } else if (deleteMode) {
      await handleDeleteMarker(marker);
    }
  });

  // ==========================================================
  // LOAD TERMINALS
  // ==========================================================
  const CACHE_KEY = 'terminals_cache_v1';

  function renderTerminals(list) {
    markerGroup.clearLayers();
    const frag = list.map(createMarker);
    frag.forEach((m) => markerGroup.addLayer(m));
  }

  function cacheTerminals() {
    try {
      const list = [];
      markerGroup.eachLayer((m) => {
        const ll = m.getLatLng();
        list.push({
          terminal_id: m.terminal_id,
          terminal_name: m.terminal_name,
          terminal_address: m.terminal_address,
          latitude: ll.lat,
          longitude: ll.lng
        });
      });
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(list));
    } catch (_) { /* storage unavailable – ignore */ }
  }

  let cachedRaw = null;
  try {
    cachedRaw = sessionStorage.getItem(CACHE_KEY);
    if (cachedRaw) renderTerminals(JSON.parse(cachedRaw));
  } catch (_) { cachedRaw = null; }

  terminalsPromise
    .then((data) => {
      const terminals = data.terminals || [];
      const fresh = JSON.stringify(terminals);
      if (fresh !== cachedRaw) {
        renderTerminals(terminals);
        try { sessionStorage.setItem(CACHE_KEY, fresh); } catch (_) {}
      }
    })
    .catch((err) => {
      console.error(err);
      if (!cachedRaw) alertModal('error', 'Load Failed', 'Failed to load terminals.');
    });

  // ==========================================================
  // MAP CLICK (Add)
  // ==========================================================
  map.on('click', (e) => {
    if (!addMode) return;
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    pending.addLat = lat;
    pending.addLng = lng;
    showModal({ name: '', address: '', lat, lng });
  });

  // ==========================================================
  // SAVE (Add + Update)
  // ==========================================================
  modalSaveBtn.addEventListener('click', async () => {
    const terminal_name = modalName.value.trim();
    const terminal_address = modalAddress.value.trim();

    const validate = async () => {
      if (!terminal_name) {
        await alertModal('warning', 'Missing Name', 'Terminal Name is required.');
        return false;
      }
      if (!terminal_address) {
        await alertModal('warning', 'Missing Address', 'Terminal Address is required.');
        return false;
      }
      return true;
    };

    // ---------- ADD ----------
    if (addMode) {
      if (!pending.addLat || !pending.addLng) return;
      if (!(await validate())) return;

      try {
        const response = await fetch('/AddTerminalLocation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            terminal_name,
            terminal_address,
            latitude: pending.addLat,
            longitude: pending.addLng
          })
        });
        const result = await response.json();

        if (result.error) {
          await alertModal('error', 'Add Failed', result.error);
          return;
        }

        markerGroup.addLayer(createMarker({
          terminal_id: result.terminal_id,
          terminal_name,
          terminal_address,
          latitude: pending.addLat,
          longitude: pending.addLng
        }));
        cacheTerminals();

        hideModal();
        clearPending();
        resetModes();
        await alertModal('success', 'Terminal Added', 'The terminal was added successfully.');
      } catch (err) {
        console.error(err);
        await alertModal('error', 'Add Failed', 'Failed to add terminal.');
      }
      return;
    }

    // ---------- UPDATE ----------
    if (updateMode) {
      if (!ghostPin || !sourceMarker) return;
      if (!(await validate())) return;

      try {
        const ll = ghostPin.getLatLng();
        const newLat = ll.lat.toFixed(6);
        const newLng = ll.lng.toFixed(6);
        const terminal_id = sourceMarker.terminal_id;

        const response = await fetch('/UpdateTerminalLocation', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            terminal_id,
            terminal_name,
            terminal_address,
            latitude: newLat,
            longitude: newLng
          })
        });

        if (!response.ok) throw new Error('Server error');
        const result = await response.json();

        if (result.error) {
          await alertModal('error', 'Update Failed', result.error);
          return;
        }

        replaceMarker(sourceMarker, {
          terminal_id,
          terminal_name,
          terminal_address,
          latitude: newLat,
          longitude: newLng
        });
        cacheTerminals();

        hideModal();
        clearPending();
        resetModes();
        await alertModal('success', 'Terminal Updated', 'The terminal was updated successfully.');
      } catch (err) {
        console.error(err);
        await alertModal('error', 'Update Failed', 'Failed to update terminal.');
      }
      return;
    }

    resetModes();
    clearPending();
  });
});