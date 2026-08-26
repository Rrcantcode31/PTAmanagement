// sample3D.js
// Requires Leaflet + Leaflet-Geoman + Socket.IO client to already be loaded

document.addEventListener('DOMContentLoaded', function () {

  // ==================================================
  // CONFIGURATION
  // ==================================================

  const CENTER = [6.4064762, 124.8046827]; // Rang-ay Barangay Hall, Banga, South Cotabato

  // Adjust the prefix to match wherever your router is mounted,
  // e.g. app.use('/dispatch', dispatchRouter) -> '/dispatch/getDispatchAreZone'
  const GET_DISPATCH_ZONE_API = '/getDispatchAreZone';
  const POST_DISPATCH_ZONE_API = '/postDispatchAreaZone';
  const PUT_DISPATCH_ZONE_API = '/putDispatchAreaZone'; // zone_id is appended, e.g. /putDispatchAreaZone/12


  // ==================================================
  // MAP INITIALIZATION
  // ==================================================

  const mapEl = document.getElementById('map');

  if (!mapEl) {
    console.error('Map element #map was not found.');
    return;
  }

  const map = L.map('map', {
    zoomControl: true
  }).setView(CENTER, 18);


  // ==================================================
  // BASE LAYERS: DEFAULT (OSM) AND SATELLITE
  // ==================================================
  const southCotabatoBounds = L.latLngBounds([[5.95, 124.55], [6.65, 125.2]]);

  // OSM's raster tile server only actually serves tiles up to zoom 19 —
  // setting maxZoom higher than that causes blank/missing tiles once you
  // zoom past what the server can provide, which looks like the map
  // "disappearing." 19 is the real ceiling here.
  const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxBounds: southCotabatoBounds,
    minZoom: 18,
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors'
  });

  // Esri World Imagery — free satellite/aerial layer, no API key or
  // billing account required.
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxBounds: southCotabatoBounds,
    minZoom: 18,
    maxZoom: 20,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  });

  defaultLayer.addTo(map);

  L.control.layers(
    {
      'Default (2D)': defaultLayer,
      'Satellite': satelliteLayer
    },
    null,
    { position: 'topright' }
  ).addTo(map);


  // ==================================================
  // DISPATCH ZONE LAYER
  // ==================================================

  const zoneLayerGroup = L.featureGroup().addTo(map);


  // ==================================================
  // GEOMAN DRAWING CONTROLS
  // ==================================================

  map.pm.addControls({

    position: 'topleft',

    // Drawing
    drawPolygon: true,
    drawRectangle: true,

    // Disable tools we don't need
    drawPolyline: false,
    drawCircle: false,
    drawCircleMarker: false,
    drawMarker: false,
    drawText: false,

    // Editing
    editMode: true,
    dragMode: false,

    // Other tools
    cutPolygon: false,
    removalMode: true

  });


  // ==================================================
  // LEGEND
  // ==================================================

  const legend = L.control({
    position: 'topright'
  });

  legend.onAdd = function () {

    const div = L.DomUtil.create(
      'div',
      'zone-legend'
    );

    div.innerHTML = `
      <div class="zone-legend-row">
        <span
          class="zone-swatch"
          style="background:#D85A30">
        </span>

        Dispatch Zone
      </div>

      <div class="zone-legend-row">
        <span
          class="zone-swatch"
          style="background:#2ecc71; border-radius:50%;">
        </span>

        Driver — Active
      </div>

      <div class="zone-legend-row">
        <span
          class="zone-swatch"
          style="background:#e74c3c; border-radius:50%;">
        </span>

        Driver — Inactive
      </div>

      <div class="zone-legend-note">
        Geofence boundary
      </div>
    `;

    return div;
  };

  legend.addTo(map);


  // ==================================================
  // DRAW EXISTING ZONE
  // ==================================================

  function drawZone(zone) {

    if (!zone.boundary) {

      console.warn(
        'Dispatch zone has no boundary:',
        zone.zone_id
      );

      return;
    }


    const zoneLayer = L.geoJSON(
      zone.boundary,
      {

        style: function () {

          return {
            color: '#D85A30',
            weight: 2,
            fillColor: '#D85A30',
            fillOpacity: 0.35
          };

        }

      }
    );


    zoneLayer.addTo(zoneLayerGroup);


    // Store database ID
    zoneLayer.zoneId = zone.zone_id;


    // Tooltip
    zoneLayer.bindTooltip(
      `
        <div class="zone-tooltip">

          <b>
            ${zone.zone_name}
          </b>

          <br>

          Type:
          ${zone.zone_type}

          <br>

          Terminal:
          ${zone.terminal_name || zone.terminal_id}

        </div>
      `,
      {
        sticky: true
      }
    );


    // Popup
    zoneLayer.bindPopup(
      `
        <div class="zone-popup">

          <h4>
            ${zone.zone_name}
          </h4>

          <p>
            <strong>Zone ID:</strong>
            ${zone.zone_id}
          </p>

          <p>
            <strong>Type:</strong>
            ${zone.zone_type}
          </p>

          <p>
            <strong>Terminal:</strong>
            ${zone.terminal_name || zone.terminal_id}
          </p>

          <p>
            <strong>Status:</strong>
            ${zone.is_active ? 'Active' : 'Inactive'}
          </p>

        </div>
      `
    );


    // ------------------------------------------------
    // Save reshaped boundary back to the server
    // ------------------------------------------------
    // L.geoJSON() wraps each feature in its own sub-layer, so we attach
    // the edit listener to the actual polygon layer(s) inside zoneLayer,
    // not to the wrapping group itself — Geoman fires 'pm:update' on the
    // specific vector layer once an edit session on it ends (e.g. you
    // finish dragging a vertex and click away / toggle edit mode off).
    zoneLayer.eachLayer(function (subLayer) {

      subLayer.zoneId = zone.zone_id;

      subLayer.on('pm:update', function () {

        saveZoneBoundary(
          zone.zone_id,
          subLayer.toGeoJSON().geometry
        );

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
          body: JSON.stringify({
            boundary: boundaryGeometry
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {

        throw new Error(
          result.message ||
          'Failed to save the reshaped zone boundary'
        );

      }

      console.log('Zone boundary updated:', result);

    } catch (error) {

      console.error('Error saving zone boundary:', error);

      alert(
        error.message ||
        'Failed to save the reshaped zone boundary. Reloading will show the last saved shape.'
      );

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

    console.log(
      'Requesting:',
      GET_DISPATCH_ZONE_API
    );

    const response = await fetch(
      GET_DISPATCH_ZONE_API,
      {
        method: 'GET',
        credentials: 'include', // sends the session cookie so isLoggedIn can authenticate the request
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    console.log(
      'Response status:',
      response.status
    );

    console.log(
      'Response content-type:',
      response.headers.get('content-type')
    );

    const responseText = await response.text();

    console.log(
      'Raw server response:',
      responseText
    );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}: ${responseText.substring(0, 200)}`
      );

    }

    let result;

    try {

      result = JSON.parse(responseText);

    } catch (jsonError) {

      console.error(
        'Server did not return JSON:',
        responseText
      );

      throw new Error(
        'Backend returned HTML instead of JSON. Check your API route.'
      );

    }

    if (!result.success) {

      throw new Error(
        result.message ||
        'Failed to load dispatch zones'
      );

    }

    console.log(
      'Dispatch zones:',
      result.data
    );

    renderZones(
      result.data || []
    );

  } catch (error) {

    console.error(
      'Error loading dispatch zones:',
      error
    );

  }
}


  // ==================================================
  // CREATE NEW DISPATCH ZONE
  // ==================================================

  map.on(
    'pm:create',
    async function (event) {

      const layer = event.layer;


      // ------------------------------------------------
      // Only allow Polygon / Rectangle
      // ------------------------------------------------

      if (
        event.shape !== 'Polygon' &&
        event.shape !== 'Rectangle'
      ) {

        map.removeLayer(layer);

        return;
      }


      // ------------------------------------------------
      // Convert Leaflet shape to GeoJSON
      // ------------------------------------------------

      const geoJson =
        layer.toGeoJSON();


      console.log(
        'Drawn zone:',
        geoJson
      );


      // ------------------------------------------------
      // Ask for zone information
      // ------------------------------------------------

      const zoneName =
        prompt(
          'Enter dispatch zone name:'
        );


      if (
        !zoneName ||
        !zoneName.trim()
      ) {

        map.removeLayer(layer);

        return;
      }


      const zoneType =
        prompt(
          'Enter zone type:\nloading, waiting, queue, dispatch'
        );


      if (
        !zoneType ||
        !zoneType.trim()
      ) {

        map.removeLayer(layer);

        return;
      }


      const terminalId =
        prompt(
          'Enter terminal ID:'
        );


      if (!terminalId) {

        map.removeLayer(layer);

        return;
      }


      // ------------------------------------------------
      // POST TO BACKEND
      // ------------------------------------------------

      try {

        const response =
          await fetch(
            POST_DISPATCH_ZONE_API,
            {
              method: 'POST',

              credentials: 'include', // sends the session cookie so isLoggedIn can authenticate the request

              headers: {
                'Content-Type':
                  'application/json',

                'Accept':
                  'application/json'
              },

              body: JSON.stringify({

                terminal_id:
                  Number(terminalId),

                zone_name:
                  zoneName.trim(),

                zone_type:
                  zoneType.trim(),

                boundary:
                  geoJson.geometry

              })

            }
          );


        const result =
          await response.json();


        if (
          !response.ok ||
          !result.success
        ) {

          throw new Error(
            result.message ||
            'Failed to create dispatch zone'
          );

        }


        console.log(
          'Dispatch zone created:',
          result
        );


        // Remove the temporary drawn shape — we'll replace it with a
        // properly styled version below so it doesn't just vanish.
        map.removeLayer(layer);


        // Draw the new zone immediately using the data we already have,
        // instead of waiting on a fresh GET request to show it.
        drawZone({
          zone_id: result.zone_id,
          terminal_id: Number(terminalId),
          terminal_name: null,
          zone_name: zoneName.trim(),
          zone_type: zoneType.trim(),
          boundary: geoJson.geometry,
          is_active: 1
        });


        // Sync with the database in the background so the map stays
        // accurate (e.g. picks up terminal_name, matches DB-assigned data).
        // Errors here are logged but won't hide the zone you just drew.
        loadDispatchZones().catch(function (err) {
          console.error('Background sync after create failed:', err);
        });


        alert(
          'Dispatch zone created successfully.'
        );


      } catch (error) {

        console.error(
          'Error creating dispatch zone:',
          error
        );


        map.removeLayer(layer);


        alert(
          error.message ||
          'Failed to create dispatch zone.'
        );

      }

    }
  );


  // ==================================================
  // LIVE DRIVER TRACKING (SOCKET.IO)
  // ==================================================
  // Requires the Socket.IO client script to be loaded on the page, e.g.:
  //   <script defer src="/socket.io/socket.io.js"></script>
  // placed BEFORE this file's <script> tag.

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

      console.error(
        'Socket.IO client not found. Add <script defer src="/socket.io/socket.io.js"></script> before sample3D.js.'
      );

      return;
    }

    // Point explicitly at the backend server — the admin page (web-based,
    // port 4560) and the Socket.IO server (backend, port 4570) are two
    // separate Express apps, so a same-origin io() call won't reach it.
    const socket = io('https://ptamanagement-production.up.railway.app');

    socket.on('connect', function () {
      console.log('Connected to server:', socket.id);
      socket.emit('admin:subscribe');
    });

    socket.on('connect_error', function (err) {
      console.error('Socket connection failed:', err.message);
    });

    socket.on('driver:location', function (data) {

      console.log('driver:location received:', data);

      const driverId = data.driverId;
      const latitude = data.latitude;
      const longitude = data.longitude;
      const status = data.status;
      const zone = data.zone;

      const icon = driverDotIcon(status);
      const popupText = `Driver #${driverId} — ${status}${zone ? ` (${zone})` : ''}`;

      if (driverMarkers[driverId]) {

        driverMarkers[driverId].setLatLng([latitude, longitude]);
        driverMarkers[driverId].setIcon(icon);
        driverMarkers[driverId].setPopupContent(popupText);

      } else {

        driverMarkers[driverId] = L.marker([latitude, longitude], { icon: icon })
          .addTo(map)
          .bindPopup(popupText);

        // Pan/zoom to the driver the first time we see them, since they
        // may be outside the map's current view otherwise.
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

  }


  // ==================================================
  // START
  // ==================================================

  loadDispatchZones();
  initDriverTracking();

});