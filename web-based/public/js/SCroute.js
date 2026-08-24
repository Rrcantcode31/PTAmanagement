document.addEventListener('DOMContentLoaded', async () => {

  const terminalSelect = document.getElementById("terminal_id");

  let terminalsData = [];
  let koronadalCity = null;
  let selectedMarker = null;
  let koronadalCityMarker = null;
  let routeLine = null;

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

const cityIcon = dotIcon('#e63946');       // red dot for Koronadal City

  const terminalIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  //side-map
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

      // Just store it — don't render it yet
      koronadalCity = terminals.find(t => t.terminal_name === "Koronadal City") || null;

    } catch (err) {
      console.error("Failed to load terminals:", err);
    }
  }

  terminalSelect.addEventListener("change", async function () {
    const terminalId = Number(this.value);

    // Nothing selected — clear everything back to blank state
    if (!terminalId) {
      clearMap();
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

    // Show selected terminal
    selectedMarker = L.marker([lat, lng], { icon: terminalIcon })
      .addTo(map)
      .bindPopup(` ${terminal.terminal_name}`)
      .openPopup();

    // Show Koronadal City now, alongside it
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

    // Draw the route/path between Koronadal City and the selected terminal
    if (cityLatLng) {
      await drawRoute(cityLatLng, [lat, lng]);
    }

    // Fit map to show both points
    if (cityLatLng) {
      map.fitBounds(L.latLngBounds([cityLatLng, [lat, lng]]), { padding: [40, 40] });
    } else {
      map.setView([lat, lng], 14);
    }
  });

  function clearMap() {
    if (selectedMarker) { map.removeLayer(selectedMarker); selectedMarker = null; }
    if (koronadalCityMarker) { map.removeLayer(koronadalCityMarker); koronadalCityMarker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  // Fetches an actual road route from OSRM's public routing API
  async function drawRoute(fromLatLng, toLatLng) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLatLng[1]},${fromLatLng[0]};${toLatLng[1]},${toLatLng[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        routeLine = L.polyline(coords, { color: 'red', weight: 4, opacity: 0.6 }).addTo(map);
      } else {
        // Fallback: straight line if no route found
        routeLine = L.polyline([fromLatLng, toLatLng], { color: 'red', weight: 3, dashArray: '6,6' }).addTo(map);
      }
    } catch (err) {
      console.error("Failed to fetch route:", err);
      // Fallback: straight line if routing service fails
      routeLine = L.polyline([fromLatLng, toLatLng], { color: 'red', weight: 3, dashArray: '6,6' }).addTo(map);
    }
  }

});