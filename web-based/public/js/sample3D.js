// sample3D.js
// Requires Leaflet + Leaflet-Geoman + Socket.IO client to already be loaded

document.addEventListener('DOMContentLoaded', function () {

  // ==================================================
  // CONFIGURATION
  // ==================================================

  const CENTER = [6.484106059165397, 124.85201408832982];

  const GET_DISPATCH_ZONE_API    = '/getDispatchAreZone';
  const POST_DISPATCH_ZONE_API   = '/postDispatchAreaZone';
  const PUT_DISPATCH_ZONE_API    = '/putDispatchAreaZone';
  const DELETE_DISPATCH_ZONE_API = '/deleteDispatchAreaZone';
  const GET_TERMINALS_API        = '/terminals';

  const SOCKET_URL = 'https://mobile-backend-application.up.railway.app';

  // Koronadal City is the hub — never offered as a zone assignment target
  const HUB_TERMINAL_ID = 1;

  // Every new zone is a queue area
  const DEFAULT_ZONE_TYPE = 'queue';

  // Radius (in km) around CENTER where drivers are allowed to appear
  const DRIVER_VISIBILITY_RADIUS_KM = 0.5;

  // How far the admin can pan away from CENTER (in km) — safety net
  const MAX_PAN_RADIUS_KM = 2;

  // How long to wait after the user stops dragging before snapping back
  const SNAP_BACK_DELAY_MS = 1200;

  // Default zoom level
  const DEFAULT_ZOOM = 18;

  // ==================================================
  // STATE
  // ==================================================

  let selectedZoneId   = null;
  let selectedZoneName = null;
  let activeTool       = null;

  let terminalsCache   = null;

  // Snap-back timer handle
  let snapBackTimer = null;

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
    setTimeout(function () {
      modalBody.innerHTML = '';
      modalFooter.innerHTML = '';
    }, 220);
  }

  modalEl.addEventListener('click', function (e) {
    if (e.target.dataset && e.target.dataset.close === '1') {
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

      const allTerminals = await loadTerminals();

      // Filter out the hub — Koronadal City is where all routes originate
      // FROM, not a destination that needs its own dispatch zone
      const assignableTerminals = allTerminals.filter(function (t) {
        return Number(t.terminal_id) !== HUB_TERMINAL_ID;
      });

      // Header
      modalTitle.textContent = 'Create Queue Zone';

      // Body — name + terminal only (zone_type is implicit)
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
          <label for="zmTerminal">Assign to Terminal</label>
          <select id="zmTerminal" class="zone-modal-select">
            <option value="">— Select a terminal —</option>
            ${assignableTerminals.map(t => `
              <option value="${t.terminal_id}">${t.terminal_name}</option>
            `).join('')}
          </select>
          <span class="zone-modal-error" id="zmTerminalError"></span>
        </div>

        <div class="zone-modal-hint">
          <i class="fas fa-info-circle"></i>
          All zones are treated as <strong>queue areas</strong>.
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
          zone_name:   name,
          zone_type:   DEFAULT_ZONE_TYPE,   // always 'queue'
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

      const closeWatcher = setInterval(function () {
        if (!modalEl.classList.contains('is-open')) {
          modalEl.removeEventListener('keydown', keyHandler);
          clearInterval(closeWatcher);
        }
      }, 200);

      openModal();

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
  // MAP INITIALIZATION — SNAP-BACK TO CENTER
  // ==================================================

  const mapEl = document.getElementById('map');
  if (!mapEl) {
    console.error('Map element #map was not found.');
    return;
  }

  // Convert a km radius around a lat/lng into a bounding box
  function boundsAround(lat, lng, radiusKm) {
    const latDelta = radiusKm / 111;                                     // ~111 km per degree latitude
    const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));   // adjust for longitude convergence
    return L.latLngBounds(
      [lat - latDelta, lng - lngDelta],   // south-west corner
      [lat + latDelta, lng + lngDelta]    // north-east corner
    );
  }

  const PAN_BOUNDS = boundsAround(CENTER[0], CENTER[1], MAX_PAN_RADIUS_KM);

  const map = L.map('map', {
    zoomControl: false,

    // Dragging is allowed, but the map will glide back to CENTER after
    // the user stops interacting
    dragging: true,
    keyboard: true,

    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,

    // Safety net: even mid-drag, the map can't run away further than
    // MAX_PAN_RADIUS_KM from CENTER
    maxBounds: PAN_BOUNDS,
    maxBoundsViscosity: 0.85,   // slight give — feels natural, snaps back on
    minZoom: 17,
    maxZoom: 18.5
  }).setView(CENTER, DEFAULT_ZOOM);

  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // ==================================================
  // SNAP-BACK LOGIC
  // ==================================================

  function cancelSnapBack() {
    if (snapBackTimer) {
      clearTimeout(snapBackTimer);
      snapBackTimer = null;
    }
  }

  function scheduleSnapBack() {
    cancelSnapBack();

    snapBackTimer = setTimeout(function () {
      snapBackTimer = null;

      const c = map.getCenter();

      // Already centered? Do nothing.
      const dLat = Math.abs(c.lat - CENTER[0]);
      const dLng = Math.abs(c.lng - CENTER[1]);
      if (dLat < 0.00005 && dLng < 0.00005) return;

      // Preserve the current zoom level — user gets to choose how close they look
      map.flyTo(
        [CENTER[0], CENTER[1]],
        map.getZoom(),
        {
          animate: true,
          duration: 0.8,
          easeLinearity: 0.25
        }
      );
    }, SNAP_BACK_DELAY_MS);
  }

  // Cancel any pending snap-back while the user is actively dragging
  map.on('dragstart', cancelSnapBack);

  // Snap back after the user releases the drag
  map.on('dragend', scheduleSnapBack);

  // ==================================================
  // RECENTER BUTTON — instant snap-back
  // ==================================================

  const RecenterControl = L.Control.extend({
    options: { position: 'bottomleft' },

    onAdd: function () {
      const btn = L.DomUtil.create('button', 'leaflet-bar recenter-btn');
      btn.type = 'button';
      btn.title = 'Recenter map';
      btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
      btn.style.cssText =
        'width:30px;height:30px;background:#fff;border:none;' +
        'border-radius:4px;cursor:pointer;font-size:14px;color:#2c7a6e;';

      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, 'click', function (e) {
        L.DomEvent.stop(e);
        cancelSnapBack();
        map.flyTo(
          [CENTER[0], CENTER[1]],
          map.getZoom(),
          { animate: true, duration: 0.6 }
        );
      });

      return btn;
    }
  });

  map.addControl(new RecenterControl());

  // ==================================================
  // BASE LAYERS
  // ==================================================

  const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 17,
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors'
  });

  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    minZoom: 17,
    maxZoom: 20,
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
  // VISIBILITY RADIUS (visual aid)
  // ==================================================

  L.circle(CENTER, {
    radius: DRIVER_VISIBILITY_RADIUS_KM * 1000, // convert km to meters
    color: '#2c7a6e',
    weight: 1,
    dashArray: '6 4',
    fillColor: '#2c7a6e',
    fillOpacity: 0.05,
    interactive: false
  }).addTo(map);

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

    const formData = await openCreateZoneModal(geoJson.geometry);

    if (!formData) {
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

  // Haversine distance in km between two lat/lng points
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function initDriverTracking() {

    if (typeof io === 'undefined') {
      console.error('[socket] Socket.IO client not found. Include socket.io-client script.');
      return;
    }

    console.log('[socket] Connecting to', SOCKET_URL);

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    // ---------- connection lifecycle ----------
    socket.on('connect', function () {
      console.log('[socket] ✅ Connected. id =', socket.id, '| transport =', socket.io.engine.transport.name);

      // Subscribe to admin room so the server can broadcast driver updates
      socket.emit('admin:subscribe');
      console.log('[socket] → emitted admin:subscribe');

      // Re-check on transport upgrade
      socket.io.engine.on('upgrade', function () {
        console.log('[socket] transport upgraded to', socket.io.engine.transport.name);
      });
    });

    socket.on('disconnect', function (reason) {
      console.warn('[socket] ❌ Disconnected. Reason:', reason);
    });

    socket.on('connect_error', function (err) {
      console.error('[socket] connect_error:', err.message);
    });

    socket.on('reconnect', function (attempt) {
      console.log('[socket] ✅ Reconnected after', attempt, 'attempts');
    });

    // ---------- DEBUG: log every event the admin receives ----------
    // This is the single most useful diagnostic — if events show up here
    // but no dot appears, the bug is in the handler below.
    socket.onAny(function (eventName, ...args) {
      console.log('[socket] ⬅️  received event:', eventName, args);
    });

    // ---------- driver location updates ----------
    socket.on('driver:location', function (data) {

      console.log('[driver:location] raw payload:', data);

      // Accept alternate key names, in case the backend uses snake_case
      const driverId =
        data.driverId ?? data.driver_id ?? data.driverInfoId ?? data.id;

      const latitude  = Number(data.latitude  ?? data.lat);
      const longitude = Number(data.longitude ?? data.lng ?? data.lon);

      if (driverId == null) {
        console.warn('[driver:location] ⚠️  Missing driverId in payload:', data);
        return;
      }

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        console.warn('[driver:location] ⚠️  Invalid GPS coordinates:', data);
        return;
      }

      // ---- Distance filter: only show drivers within the radius ----
      const distanceKm = haversineKm(
        CENTER[0], CENTER[1],
        latitude, longitude
      );

      const withinRadius = distanceKm <= DRIVER_VISIBILITY_RADIUS_KM;

      console.log(
        `[driver:location] driver=${driverId} ` +
        `(${latitude}, ${longitude}) ` +
        `distance=${distanceKm.toFixed(3)} km ` +
        `withinRadius=${withinRadius}`
      );

      // If outside the radius and we already have a marker, remove it
      if (!withinRadius) {
        if (driverMarkers[driverId]) {
          map.removeLayer(driverMarkers[driverId]);
          delete driverMarkers[driverId];
          console.log(`[driver:location] removed out-of-range marker for ${driverId}`);
        } else {
          console.log(`[driver:location] driver ${driverId} out of range — no marker to add`);
        }
        return;
      }

      const status = data.status || 'INACTIVE';
      const zone = data.zone;

      const icon = driverDotIcon(status);
      const popupText =
        `Driver #${driverId} — ${status}` +
        `${zone ? ' (' + zone + ')' : ''}<br>` +
        `Distance: ${distanceKm.toFixed(3)} km`;

      if (driverMarkers[driverId]) {
        // Update existing marker in place
        driverMarkers[driverId].setLatLng([latitude, longitude]);
        driverMarkers[driverId].setIcon(icon);
        driverMarkers[driverId].setPopupContent(popupText);
        console.log(`[driver:location] updated marker for ${driverId}`);
      } else {
        // Create new marker — do NOT move the map view
        driverMarkers[driverId] = L.marker([latitude, longitude], { icon })
          .addTo(map)
          .bindPopup(popupText);
        console.log(`[driver:location] ✅ added new marker for ${driverId}`);
      }
    });

    socket.on('driver:offline', function (data) {
      const driverId =
        data.driverId ?? data.driver_id ?? data.driverInfoId ?? data.id;

      if (driverMarkers[driverId]) {
        map.removeLayer(driverMarkers[driverId]);
        delete driverMarkers[driverId];
        console.log(`[driver:offline] removed marker for ${driverId}`);
      }
    });

    socket.on('queue:driver_joined', function (entry) {
      console.log('[queue] driver joined:', entry);
    });

    socket.on('queue:driver_dispatched', function (entry) {
      console.log('[queue] driver dispatched:', entry);
    });

  }

  // ==================================================
  // START
  // ==================================================

  loadDispatchZones();
  initDriverTracking();

});