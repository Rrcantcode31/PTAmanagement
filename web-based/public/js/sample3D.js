// sample3D.js
// Requires Leaflet + Leaflet-Geoman + Socket.IO client to already be loaded

document.addEventListener('DOMContentLoaded', function () {

  // ==================================================
  // CONFIGURATION
  // ==================================================

  const CENTER = [6.406392585980692, 124.80452341672029];

  const GET_DISPATCH_ZONE_API    = '/getDispatchAreZone';
  const POST_DISPATCH_ZONE_API   = '/postDispatchAreaZone';
  const PUT_DISPATCH_ZONE_API    = '/putDispatchAreaZone';
  const DELETE_DISPATCH_ZONE_API = '/deleteDispatchAreaZone';
  const GET_TERMINALS_API        = '/terminals';

  const SOCKET_URL = 'http://192.168.1.74:4570';

  // ==================================================
  // STATE
  // ==================================================

  let selectedZoneId   = null;
  let selectedZoneName = null;
  let activeTool       = null;

  let terminalsCache   = null;   // cached list of terminals
  let pendingGeometry  = null;   // GeoJSON geometry waiting for modal submit

  // ==================================================
  // MODAL SYSTEM — INJECTED AT STARTUP
  // ==================================================

  function injectModalHTML() {
    if (document.getElementById('zoneModal')) return;

    const html = `
      <div id="zoneModal" class="zone-modal" aria-hidden="true">

        <div class="zone-modal-backdrop" data-close="1"></div>

        <div class="zone-modal-box" role="dialog" aria-modal="true">

          <div class="zone-modal-header">
            <h3 id="zoneModalTitle">
              <i class="fas fa-draw-polygon"></i>
              <span id="zoneModalTitleText">Create Dispatch Zone</span>
            </h3>
            <button type="button" class="zone-modal-close" data-close="1" aria-label="Close">&times;</button>
          </div>

          <div class="zone-modal-body" id="zoneModalBody"></div>

          <div class="zone-modal-footer" id="zoneModalFooter"></div>

        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    document.body.appendChild(wrapper.firstElementChild);
  }

  injectModalHTML();

  const modalEl     = document.getElementById('zoneModal');
  const modalTitle  = document.getElementById('zoneModalTitleText');
  const modalBody   = document.getElementById('zoneModalBody');
  const modalFooter = document.getElementById('zoneModalFooter');

  function openModal() {
    modalEl.classList.add('is-open');
    modalEl.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modalEl.classList.remove('is-open');
    modalEl.setAttribute('aria-hidden', 'true');
    // Small delay so the close animation can finish before clearing content
    setTimeout(function () {
      modalBody.innerHTML = '';
      modalFooter.innerHTML = '';
    }, 220);
  }

  // Backdrop / close button click
  modalEl.addEventListener('click', function (e) {
    if (e.target.dataset && e.target.dataset.close === '1') {
      // Signal cancel to whatever is listening
      if (typeof modalEl._cancelHandler === 'function') {
        modalEl._cancelHandler();
      }
    }
  });

  // ==================================================
  // MODAL 1 — CREATE ZONE FORM
  // ==================================================

  async function loadTerminals() {
    if (terminalsCache) return terminalsCache;

    try {
      const res  = await fetch(GET_TERMINALS_API, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      terminalsCache = data.terminals || [];
      return terminalsCache;
    } catch (err) {
      console.error('[zones] failed to load terminals:', err);
      terminalsCache = [];
      return terminalsCache;
    }
  }

  function openCreateZoneModal(geometry) {
    return new Promise(async (resolve) => {

      const terminals = await loadTerminals();

      // Header
      modalTitle.textContent = 'Create Dispatch Zone';

      // Body
      modalBody.innerHTML = `
        <div class="zone-modal-field">
          <label for="zmName">Zone Name</label>
          <input
            type="text"
            id="zmName"
            class="zone-modal-input"
            placeholder="e.g. Banga Waiting Area"
            autocomplete="off"
            maxlength="60"
          />
          <span class="zone-modal-error" id="zmNameError"></span>
        </div>

        <div class="zone-modal-field">
          <label>Zone Type</label>
          <div class="zone-type-pills" id="zmTypePills">
            <button type="button" class="zone-type-pill" data-value="loading">Loading</button>
            <button type="button" class="zone-type-pill" data-value="waiting">Waiting</button>
            <button type="button" class="zone-type-pill" data-value="queue">Queue</button>
            <button type="button" class="zone-type-pill" data-value="dispatch">Dispatch</button>
          </div>
          <span class="zone-modal-error" id="zmTypeError"></span>
        </div>

        <div class="zone-modal-field">
          <label for="zmTerminal">Assign to Terminal</label>
          <select id="zmTerminal" class="zone-modal-select">
            <option value="">— Select a terminal —</option>
            ${terminals.map(t => `
              <option value="${t.terminal_id}">${t.terminal_name}</option>
            `).join('')}
          </select>
          <span class="zone-modal-error" id="zmTerminalError"></span>
        </div>
      `;

      // Footer
      modalFooter.innerHTML = `
        <button type="button" class="zone-modal-btn zone-modal-cancel" id="zmCancel">
          Cancel
        </button>
        <button type="button" class="zone-modal-btn zone-modal-primary" id="zmSubmit">
          Create Zone
        </button>
      `;

      // Zone type pill selection
      let selectedType = '';
      const pills = modalBody.querySelectorAll('.zone-type-pill');
      pills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          pills.forEach(p => p.classList.remove('is-selected'));
          pill.classList.add('is-selected');
          selectedType = pill.dataset.value;
          document.getElementById('zmTypeError').textContent = '';
        });
      });

      // Cancel handler
      function doCancel() {
        modalEl._cancelHandler = null;
        closeModal();
        resolve(null);
      }
      modalEl._cancelHandler = doCancel;

      document.getElementById('zmCancel').addEventListener('click', doCancel);

      // Submit
      document.getElementById('zmSubmit').addEventListener('click', function () {
        const name = document.getElementById('zmName').value.trim();
        const term = document.getElementById('zmTerminal').value;

        let hasError = false;

        // Validate name
        if (!name) {
          document.getElementById('zmNameError').textContent = 'Zone name is required';
          document.getElementById('zmName').classList.add('has-error');
          hasError = true;
        } else {
          document.getElementById('zmNameError').textContent = '';
          document.getElementById('zmName').classList.remove('has-error');
        }

        // Validate type
        if (!selectedType) {
          document.getElementById('zmTypeError').textContent = 'Please choose a zone type';
          hasError = true;
        }

        // Validate terminal
        if (!term) {
          document.getElementById('zmTerminalError').textContent = 'Please select a terminal';
          document.getElementById('zmTerminal').classList.add('has-error');
          hasError = true;
        } else {
          document.getElementById('zmTerminalError').textContent = '';
          document.getElementById('zmTerminal').classList.remove('has-error');
        }

        if (hasError) return;

        modalEl._cancelHandler = null;
        closeModal();
        resolve({
          zone_name: name,
          zone_type: selectedType,
          terminal_id: Number(term)
        });
      });

      // Enter submits, Esc cancels
      const keyHandler = function (e) {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          document.getElementById('zmSubmit').click();
        } else if (e.key === 'Escape') {
          doCancel();
        }
      };
      modalEl.addEventListener('keydown', keyHandler);

      // Clean up key listener when modal closes
      const closeWatcher = setInterval(function () {
        if (!modalEl.classList.contains('is-open')) {
          modalEl.removeEventListener('keydown', keyHandler);
          clearInterval(closeWatcher);
        }
      }, 200);

      openModal();

      // Autofocus the name field
      setTimeout(function () {
        document.getElementById('zmName')?.focus();
      }, 250);
    });
  }

  // ==================================================
  // MODAL 2 — CONFIRM
  // ==================================================

  function openConfirmModal(opts) {
    return new Promise(function (resolve) {

      const {
        title        = 'Confirm',
        icon         = 'fa-exclamation-triangle',
        iconVariant  = 'danger',
        message      = '',
        confirmText  = 'Confirm',
        cancelText   = 'Cancel',
        confirmStyle = 'danger'
      } = opts;

      modalTitle.textContent = title;

      modalBody.innerHTML = `
        <div class="zone-modal-confirm ${iconVariant === 'success' ? 'is-success' : ''}">
          <div class="zone-modal-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="zone-modal-message">${message}</div>
        </div>
      `;

      modalFooter.innerHTML = `
        <button type="button" class="zone-modal-btn zone-modal-cancel" id="zmConfirmCancel">
          ${cancelText}
        </button>
        <button type="button" class="zone-modal-btn zone-modal-${confirmStyle}" id="zmConfirmOk">
          ${confirmText}
        </button>
      `;

      function finish(result) {
        modalEl._cancelHandler = null;
        closeModal();
        resolve(result);
      }

      modalEl._cancelHandler = function () { finish(false); };

      document.getElementById('zmConfirmCancel').addEventListener('click', function () { finish(false); });
      document.getElementById('zmConfirmOk').addEventListener('click', function () { finish(true); });

      const keyHandler = function (e) {
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter')  finish(true);
      };
      modalEl.addEventListener('keydown', keyHandler);

      const closeWatcher = setInterval(function () {
        if (!modalEl.classList.contains('is-open')) {
          modalEl.removeEventListener('keydown', keyHandler);
          clearInterval(closeWatcher);
        }
      }, 200);

      openModal();
    });
  }

  // ==================================================
  // MODAL 3 — ALERT
  // ==================================================

  function openAlertModal(opts) {
    return new Promise(function (resolve) {

      const {
        title = 'Notice',
        icon  = 'fa-check-circle',
        variant = 'success',
        message = '',
        buttonText = 'OK'
      } = opts;

      modalTitle.textContent = title;

      modalBody.innerHTML = `
        <div class="zone-modal-confirm ${variant === 'success' ? 'is-success' : ''}">
          <div class="zone-modal-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="zone-modal-message">${message}</div>
        </div>
      `;

      modalFooter.innerHTML = `
        <button type="button" class="zone-modal-btn zone-modal-primary" id="zmAlertOk">
          ${buttonText}
        </button>
      `;

      function finish() {
        modalEl._cancelHandler = null;
        closeModal();
        resolve();
      }

      modalEl._cancelHandler = finish;

      document.getElementById('zmAlertOk').addEventListener('click', finish);

      const keyHandler = function (e) {
        if (e.key === 'Escape' || e.key === 'Enter') finish();
      };
      modalEl.addEventListener('keydown', keyHandler);

      const closeWatcher = setInterval(function () {
        if (!modalEl.classList.contains('is-open')) {
          modalEl.removeEventListener('keydown', keyHandler);
          clearInterval(closeWatcher);
        }
      }, 200);

      openModal();
    });
  }

  // ==================================================
  // MAP INITIALIZATION
  // ==================================================

  const mapEl = document.getElementById('map');
  if (!mapEl) {
    console.error('Map element #map was not found.');
    return;
  }

  const map = L.map('map', { zoomControl: false }).setView(CENTER, 18);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // ==================================================
  // BASE LAYERS
  // ==================================================

  const southCotabatoBounds = L.latLngBounds([[5.95, 124.55], [6.65, 125.2]]);

  const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxBounds: southCotabatoBounds,
    minZoom: 18,
    maxZoom: 19.8,
    attribution: '&copy; OpenStreetMap contributors'
  });

  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxBounds: southCotabatoBounds,
    minZoom: 18,
    maxZoom: 19.7,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  });

  defaultLayer.addTo(map);

  L.control.layers(
    { 'Default (2D)': defaultLayer, 'Satellite': satelliteLayer },
    null,
    { position: 'topright' }
  ).addTo(map);

  const zoneLayerGroup = L.featureGroup().addTo(map);

  // ==================================================
  // GEOMAN — disable default toolbar
  // ==================================================

  map.pm.addControls({
    drawPolygon: false,
    drawRectangle: false,
    drawPolyline: false,
    drawCircle: false,
    drawCircleMarker: false,
    drawMarker: false,
    drawText: false,
    editMode: false,
    dragMode: false,
    cutPolygon: false,
    removalMode: false,
    rotateMode: false
  });

  // ==================================================
  // CUSTOM ZONE TOOLS DROPDOWN
  // ==================================================

  const ZoneToolsControl = L.Control.extend({
    options: { position: 'topleft' },

    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar zone-tools-control');

      container.innerHTML = `
        <button type="button" id="zoneToolsBtn" class="zone-tools-trigger">
          <i class="fas fa-cog"></i>
          <span>Zone Tools</span>
          <i class="fas fa-caret-down zone-tools-caret"></i>
        </button>

        <div id="zoneToolsMenu" class="zone-tools-menu is-hidden">

          <div class="zone-tools-section">Draw Tools</div>

          <button type="button" class="zone-tools-item" data-action="draw-polygon">
            <i class="fas fa-draw-polygon"></i> Draw Polygon Zone
          </button>

          <button type="button" class="zone-tools-item" data-action="draw-rectangle">
            <i class="fas fa-vector-square"></i> Draw Rectangle Zone
          </button>

          <div class="zone-tools-section">Edit Tools</div>

          <button type="button" class="zone-tools-item" data-action="toggle-edit">
            <i class="fas fa-pen"></i> <span id="zoneToolsEditLabel">Toggle Reshape Mode</span>
          </button>

          <div class="zone-tools-section">Actions</div>

          <button type="button" class="zone-tools-item zone-tools-danger" data-action="delete-zone">
            <i class="fas fa-trash"></i> Delete Selected Zone
          </button>

          <button type="button" id="zoneToolsCancel" class="zone-tools-cancel is-hidden">
            <i class="fas fa-times-circle"></i> Cancel Current Tool
          </button>

        </div>
      `;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      return container;
    }
  });

  map.addControl(new ZoneToolsControl());

  // ==================================================
  // WIRE UP DROPDOWN EVENTS
  // ==================================================

  const toolsBtn  = document.getElementById('zoneToolsBtn');
  const toolsMenu = document.getElementById('zoneToolsMenu');
  const editLabel = document.getElementById('zoneToolsEditLabel');
  const cancelBtn = document.getElementById('zoneToolsCancel');

  function closeMenu() { toolsMenu.classList.add('is-hidden'); }
  function openMenu()  { toolsMenu.classList.remove('is-hidden'); }

  toolsBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (toolsMenu.classList.contains('is-hidden')) openMenu();
    else closeMenu();
  });

  document.addEventListener('click', function (e) {
    if (activeTool) return;
    const control = document.querySelector('.zone-tools-control');
    if (control && !control.contains(e.target)) closeMenu();
  });

  toolsMenu.addEventListener('click', function (e) {
    const btn = e.target.closest('.zone-tools-item');
    if (!btn) return;

    const action = btn.dataset.action;

    switch (action) {
      case 'draw-polygon':
        map.pm.disableDraw();
        map.pm.disableGlobalEditMode();
        setActiveTool('draw-polygon');
        map.pm.enableDraw('Polygon', { snappable: true, snapDistance: 20 });
        break;

      case 'draw-rectangle':
        map.pm.disableDraw();
        map.pm.disableGlobalEditMode();
        setActiveTool('draw-rectangle');
        map.pm.enableDraw('Rectangle', { snappable: true, snapDistance: 20 });
        break;

      case 'toggle-edit':
        if (activeTool === 'edit-mode') {
          map.pm.disableGlobalEditMode();
          clearActiveTool();
        } else {
          map.pm.disableDraw();
          map.pm.enableGlobalEditMode();
          setActiveTool('edit-mode');
        }
        break;

      case 'delete-zone':
        closeMenu();
        deleteSelectedZone();
        break;
    }
  });

  cancelBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    cancelActiveTool();
  });

  // ==================================================
  // ACTIVE TOOL HELPERS
  // ==================================================

  function setActiveTool(tool) {
    activeTool = tool;

    document.querySelectorAll('.zone-tools-item').forEach(function (item) {
      if (item.dataset.action === tool) item.classList.add('is-active');
      else item.classList.remove('is-active');
    });

    if (editLabel) {
      editLabel.textContent = (tool === 'edit-mode')
        ? 'Exit Reshape Mode'
        : 'Toggle Reshape Mode';
    }

    if (cancelBtn) cancelBtn.classList.remove('is-hidden');
    openMenu();
  }

  function clearActiveTool() {
    activeTool = null;
    document.querySelectorAll('.zone-tools-item').forEach(function (item) {
      item.classList.remove('is-active');
    });
    if (editLabel) editLabel.textContent = 'Toggle Reshape Mode';
    if (cancelBtn) cancelBtn.classList.add('is-hidden');
  }

  function cancelActiveTool() {
    map.pm.disableDraw();
    map.pm.disableGlobalEditMode();
    clearActiveTool();
    closeMenu();
  }

  map.on('pm:drawend', function () {
    if (activeTool === 'draw-polygon' || activeTool === 'draw-rectangle') {
      clearActiveTool();
    }
  });

  // ==================================================
  // LEGEND
  // ==================================================

  const legend = L.control({ position: 'topright' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'zone-legend');

    div.innerHTML = `
      <div class="zone-legend-row">
        <span class="zone-swatch" style="background:#D85A30"></span>
        Dispatch Zone
      </div>
      <div class="zone-legend-row">
        <span class="zone-swatch" style="background:#2ecc71; border-radius:50%;"></span>
        Driver &mdash; Active
      </div>
      <div class="zone-legend-row">
        <span class="zone-swatch" style="background:#e74c3c; border-radius:50%;"></span>
        Driver &mdash; Inactive
      </div>
      <div class="zone-legend-note">Geofence boundary</div>
    `;

    return div;
  };

  legend.addTo(map);

  // ==================================================
  // DRAW EXISTING ZONE
  // ==================================================

  function drawZone(zone) {

    if (!zone.boundary) {
      console.warn('Dispatch zone has no boundary:', zone.zone_id);
      return;
    }

    const zoneLayer = L.geoJSON(zone.boundary, {
      style: function () {
        return {
          color: '#D85A30',
          weight: 2,
          fillColor: '#D85A30',
          fillOpacity: 0.35
        };
      }
    });

    zoneLayer.addTo(zoneLayerGroup);
    zoneLayer.zoneId = zone.zone_id;

    zoneLayer.bindTooltip(
      `
        <div class="zone-tooltip">
          <b>${zone.zone_name}</b><br>
          Type: ${zone.zone_type}<br>
          Terminal: ${zone.terminal_name || zone.terminal_id}
        </div>
      `,
      { sticky: true }
    );

    zoneLayer.bindPopup(
      `
        <div class="zone-popup">
          <h4>${zone.zone_name}</h4>
          <p><strong>Zone ID:</strong> ${zone.zone_id}</p>
          <p><strong>Type:</strong> ${zone.zone_type}</p>
          <p><strong>Terminal:</strong> ${zone.terminal_name || zone.terminal_id}</p>
          <p><strong>Status:</strong> ${zone.is_active ? 'Active' : 'Inactive'}</p>
        </div>
      `
    );

    zoneLayer.eachLayer(function (subLayer) {

      subLayer.zoneId = zone.zone_id;

      subLayer.on('pm:update', function () {
        saveZoneBoundary(zone.zone_id, subLayer.toGeoJSON().geometry);
      });

      subLayer.on('click', function () {
        selectedZoneId   = zone.zone_id;
        selectedZoneName = zone.zone_name;

        console.log('[zone] selected:', selectedZoneId, selectedZoneName);

        subLayer.setStyle({ color: '#1f6f66', weight: 4 });
        setTimeout(function () {
          subLayer.setStyle({ color: '#D85A30', weight: 2 });
        }, 400);
      });

    });

  }

  // ==================================================
  // SAVE EDITED ZONE BOUNDARY
  // ==================================================

  async function saveZoneBoundary(zoneId, boundaryGeometry) {
    try {

      const response = await fetch(
        `${PUT_DISPATCH_ZONE_API}/${zoneId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ boundary: boundaryGeometry })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to save the reshaped zone boundary');
      }

      console.log('Zone boundary updated:', result);

    } catch (error) {
      console.error('Error saving zone boundary:', error);
      openAlertModal({
        title: 'Save Failed',
        icon: 'fa-exclamation-triangle',
        variant: 'danger',
        message: error.message || 'Failed to save the reshaped zone boundary.'
      });
    }
  }

  // ==================================================
  // DELETE SELECTED ZONE
  // ==================================================

  async function deleteSelectedZone() {

    if (!selectedZoneId) {
      await openAlertModal({
        title: 'No Zone Selected',
        icon: 'fa-info-circle',
        variant: 'danger',
        message: 'Click a zone on the map first, then choose <strong>Delete Selected Zone</strong>.'
      });
      return;
    }

    const confirmed = await openConfirmModal({
      title: 'Delete Zone',
      icon: 'fa-trash',
      iconVariant: 'danger',
      confirmText: 'Delete Zone',
      cancelText: 'Cancel',
      confirmStyle: 'danger',
      message:
        `Are you sure you want to permanently delete this zone?<br><br>` +
        `<strong>${selectedZoneName || 'Zone #' + selectedZoneId}</strong><br><br>` +
        `Waiting vehicles in this zone will be removed from the queue. ` +
        `Past departure logs will be kept but lose the zone reference.<br><br>` +
        `<em>This action cannot be undone.</em>`
    });

    if (!confirmed) return;

    const deleteItem = document.querySelector('[data-action="delete-zone"]');
    const originalHTML = deleteItem ? deleteItem.innerHTML : null;

    if (deleteItem) {
      deleteItem.disabled = true;
      deleteItem.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
    }

    try {

      const response = await fetch(
        `${DELETE_DISPATCH_ZONE_API}/${selectedZoneId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to delete dispatch zone');
      }

      console.log('Zone deleted:', result);

      await openAlertModal({
        title: 'Zone Deleted',
        icon: 'fa-check-circle',
        variant: 'success',
        message:
          `The zone was permanently removed.<br><br>` +
          `Waiting vehicles removed: <strong>${result.waiting_entries_deleted || 0}</strong><br>` +
          `Departure logs orphaned: <strong>${result.departure_logs_orphaned || 0}</strong>`
      });

      selectedZoneId   = null;
      selectedZoneName = null;

      await loadDispatchZones();

    } catch (error) {
      console.error('Error deleting dispatch zone:', error);
      await openAlertModal({
        title: 'Delete Failed',
        icon: 'fa-exclamation-triangle',
        variant: 'danger',
        message: error.message || 'Failed to delete dispatch zone.'
      });
    } finally {
      if (deleteItem) {
        deleteItem.disabled = false;
        deleteItem.innerHTML = originalHTML || '<i class="fas fa-trash"></i> Delete Selected Zone';
      }
    }
  }

  // ==================================================
  // RENDER ZONES
  // ==================================================

  function renderZones(zoneList) {
    zoneLayerGroup.clearLayers();

    zoneList.forEach(function (zone) {
      drawZone(zone);
    });

    if (zoneLayerGroup.getLayers().length === 0) {
      console.warn('No dispatch zones were returned to render.');
    }
  }

  // ==================================================
  // LOAD ZONES FROM BACKEND
  // ==================================================

  async function loadDispatchZones() {
    try {

      const response = await fetch(GET_DISPATCH_ZONE_API, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Server did not return JSON:', responseText);
        throw new Error('Backend returned HTML instead of JSON. Check your API route.');
      }

      if (!result.success) {
        throw new Error(result.message || 'Failed to load dispatch zones');
      }

      renderZones(result.data || []);

    } catch (error) {
      console.error('Error loading dispatch zones:', error);
    }
  }

  // ==================================================
  // CREATE NEW DISPATCH ZONE (via modal)
  // ==================================================

  map.on('pm:create', async function (event) {

    const layer = event.layer;

    if (event.shape !== 'Polygon' && event.shape !== 'Rectangle') {
      map.removeLayer(layer);
      return;
    }

    const geoJson = layer.toGeoJSON();

    // Show modal — resolves with { zone_name, zone_type, terminal_id } or null
    const formData = await openCreateZoneModal(geoJson.geometry);

    if (!formData) {
      // User cancelled
      map.removeLayer(layer);
      clearActiveTool();
      return;
    }

    try {

      const response = await fetch(POST_DISPATCH_ZONE_API, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          terminal_id: formData.terminal_id,
          zone_name:   formData.zone_name,
          zone_type:   formData.zone_type,
          boundary:    geoJson.geometry
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create dispatch zone');
      }

      console.log('Dispatch zone created:', result);

      map.removeLayer(layer);

      drawZone({
        zone_id: result.zone_id,
        terminal_id: formData.terminal_id,
        terminal_name: null,
        zone_name: formData.zone_name,
        zone_type: formData.zone_type,
        boundary: geoJson.geometry,
        is_active: 1
      });

      loadDispatchZones().catch(function (err) {
        console.error('Background sync after create failed:', err);
      });

      await openAlertModal({
        title: 'Zone Created',
        icon: 'fa-check-circle',
        variant: 'success',
        message:
          `<strong>${formData.zone_name}</strong> was created successfully.`
      });

    } catch (error) {
      console.error('Error creating dispatch zone:', error);
      map.removeLayer(layer);
      await openAlertModal({
        title: 'Create Failed',
        icon: 'fa-exclamation-triangle',
        variant: 'danger',
        message: error.message || 'Failed to create dispatch zone.'
      });
    } finally {
      clearActiveTool();
    }

  });

  // ==================================================
  // LIVE DRIVER TRACKING
  // ==================================================

  const driverMarkers = {};

  function driverDotIcon(status) {
    const color = status === 'ACTIVE' ? '#2ecc71' : '#e74c3c';

    return L.divIcon({
      className: 'driver-dot-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      html: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="7" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      </svg>`
    });
  }

  function initDriverTracking() {

    if (typeof io === 'undefined') {
      console.error('Socket.IO client not found.');
      return;
    }

    const socket = io(SOCKET_URL);

    socket.on('connect', function () {
      console.log('Connected to server:', socket.id);
      socket.emit('admin:subscribe');
    });

    socket.on('connect_error', function (err) {
      console.error('Socket connection failed:', err.message);
    });

    socket.on('driver:location', function (data) {

      const driverId = data.driverId;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        console.error('Invalid GPS coordinates:', data);
        return;
      }

      const status = data.status;
      const zone = data.zone;

      const icon = driverDotIcon(status);
      const popupText = `Driver #${driverId} — ${status}${zone ? ' (' + zone + ')' : ''}`;

      if (driverMarkers[driverId]) {
        driverMarkers[driverId].setLatLng([latitude, longitude]);
        driverMarkers[driverId].setIcon(icon);
        driverMarkers[driverId].setPopupContent(popupText);
      } else {
        driverMarkers[driverId] = L.marker([latitude, longitude], { icon })
          .addTo(map)
          .bindPopup(popupText);
        map.setView([latitude, longitude], 18);
      }
    });

    socket.on('driver:offline', function (data) {
      const driverId = data.driverId;
      if (driverMarkers[driverId]) {
        map.removeLayer(driverMarkers[driverId]);
        delete driverMarkers[driverId];
      }
    });

    socket.on('queue:driver_joined', function (entry) {
      console.log('Driver joined queue:', entry);
    });

    socket.on('queue:driver_dispatched', function (entry) {
      console.log('Driver dispatched:', entry);
    });

  }

  // ==================================================
  // START
  // ==================================================

  loadDispatchZones();
  initDriverTracking();

});