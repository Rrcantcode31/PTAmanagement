document.addEventListener('DOMContentLoaded', async () => {
  const modal = document.getElementById('terminal-modal');
  const modalLat = document.getElementById('modal-lat');
  const modalLng = document.getElementById('modal-lng');
  const modalName = document.getElementById('modal-name-input');
  const modalAddress = document.getElementById('modal-address-input');
  const modalSaveBtn = document.getElementById('modal-save');
  const modalCloseBtn = document.getElementById('modal-close');

  const mapEl = document.getElementById('map');
  const addBtn = document.querySelector('.add-btn');
  const updateBtn = document.querySelector('.update-btn');
  const deleteBtn = document.querySelector('.delete-btn');

  // Validation / confirmation modal elements
  const validationModal = document.getElementById("validation-modal");
  const validationIcon = document.getElementById("validation-icon");
  const validationTitle = document.getElementById("validation-title");
  const validationMessage = document.getElementById("validation-message");
  const validationCancel = document.getElementById("validation-cancel");
  const validationConfirm = document.getElementById("validation-confirm");

  if (
    !mapEl ||
    typeof window.L === 'undefined' ||
    !modal ||
    !modalLat ||
    !modalLng ||
    !modalName ||
    !modalAddress ||
    !modalSaveBtn ||
    !modalCloseBtn ||
    !addBtn ||
    !updateBtn ||
    !deleteBtn ||
    !validationModal ||
    !validationIcon ||
    !validationTitle ||
    !validationMessage ||
    !validationCancel ||
    !validationConfirm
  ) {
    console.error('Missing required DOM elements or Leaflet not loaded.');
    return;
  }

  // ==========================================================
  // VALIDATION / CONFIRMATION MODAL (replaces confirm()/alert())
  // ==========================================================

  let validationResolve = null;

  function showValidationModal({
    type = "warning",
    title = "Warning",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
    showCancel = true
  }) {

    validationModal.className = `validation-modal ${type}`;
    validationModal.classList.remove("hidden");

    validationTitle.textContent = title;
    validationMessage.innerHTML = message;
    validationConfirm.textContent = confirmText;
    validationCancel.textContent = cancelText;
    validationCancel.style.display = showCancel ? "inline-block" : "none";

    if (type === "delete") {
      validationIcon.textContent = "🗑️";
    } else if (type === "success") {
      validationIcon.textContent = "✓";
    } else if (type === "error") {
      validationIcon.textContent = "✕";
    } else {
      validationIcon.textContent = "⚠️";
    }

    return new Promise((resolve) => {
      validationResolve = resolve;
    });
  }

  function closeValidationModal(result) {
    validationModal.classList.add("hidden");
    if (validationResolve) {
      validationResolve(result);
      validationResolve = null;
    }
  }

  validationConfirm.addEventListener("click", () => {
    closeValidationModal(true);
  });

  validationCancel.addEventListener("click", () => {
    closeValidationModal(false);
  });

  validationModal
    .querySelector(".validation-modal-overlay")
    .addEventListener("click", () => {
      closeValidationModal(false);
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !validationModal.classList.contains("hidden")) {
      closeValidationModal(false);
    }
  });

  // ==========================================================
  // MAP SETUP
  // ==========================================================

  const southCotabatoBounds = L.latLngBounds([[5.95, 124.55], [6.65, 125.2]]);
  const map = L.map('map', {
    maxBounds: southCotabatoBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 10.3,
    maxZoom: 20.5
  });
  map.fitBounds(southCotabatoBounds, { padding: [10, 10] });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Full pin icon (used for the highlighted terminal, e.g. Koronadal City)
  const terminalIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  // Simple dot icon (used for all other terminals)
  const dotIcon = L.divIcon({
    className: 'terminal-dot-icon',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<svg width="16" height="16" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="6" fill="#ff0000" stroke="#fafafb83" stroke-width="2"/>
    </svg>`
  });

  // Name of the terminal that should keep the full pin marker.
  // Change this constant if you want a different terminal highlighted.
  const HIGHLIGHTED_TERMINAL = 'Koronadal City';

  // Helper: pick the right icon based on terminal name (case/whitespace-insensitive)
  const getIconFor = (name) =>
    (name || '').trim().toLowerCase() === HIGHLIGHTED_TERMINAL.toLowerCase()
      ? terminalIcon
      : dotIcon;

  // Helper: only show a permanent label for the highlighted terminal.
  // Set this to `true` if you want ALL markers (dots included) to show labels.
  const SHOW_LABEL_FOR_ALL = false;

  const maybeBindTooltip = (marker, name) => {
    const isHighlighted = (name || '').trim().toLowerCase() === HIGHLIGHTED_TERMINAL.toLowerCase();
    if (SHOW_LABEL_FOR_ALL || isHighlighted) {
      marker.bindTooltip(name, {
        permanent: true,
        direction: 'right',
        offset: [14, 2],
        className: 'terminal-label'
      });
    }
  };

  // ==========================================================
  // MODES
  // ==========================================================

  let addMode = false;
  let updateMode = false;
  let deleteMode = false;

  const resetModes = () => {
    addMode = updateMode = deleteMode = false;

    addBtn.classList.remove('active');
    updateBtn.classList.remove('active');
    deleteBtn.classList.remove('active');

    map.dragging.enable();
  };

  // Pending action state (so Save knows what to POST/PATCH)
  const pending = {
    addLat: null,
    addLng: null,
    updateMarker: null
  };

  const showModal = ({ lat, lng, name, address }) => {
    modalLat.textContent = lat;
    modalLng.textContent = lng;
    modalName.value = name || '';
    modalAddress.value = address || '';
    modal.classList.remove('hidden');
    modalName.focus();
  };

  const hideModal = () => {
    modal.classList.add('hidden');
  };

  const clearPending = () => {
    pending.addLat = null;
    pending.addLng = null;
    pending.updateMarker = null;
  };

  // Close modal (cancel current pending data, keep mode as-is)
  modalCloseBtn.addEventListener('click', () => {
    hideModal();
    clearPending();
    resetModes(); // <- important: turns off add/update/delete modes
  });

  // Add Mode
  addBtn.addEventListener('click', () => {
    if (addMode) { // toggle off
      resetModes();
      hideModal();
      clearPending();
      return;
    }

    resetModes();
    addMode = true;
    addBtn.classList.add('active');
    map.dragging.disable();
  });

  // Update Mode
  updateBtn.addEventListener('click', () => {
    if (updateMode) { // toggle off
      resetModes();
      hideModal();
      return;
    }

    resetModes();
    updateMode = true;
    updateBtn.classList.add('active');
  });

  // Delete Mode
  deleteBtn.addEventListener('click', () => {
    if (deleteMode) { // toggle off
      resetModes();
      hideModal();
      return;
    }

    resetModes();
    deleteMode = true;
    deleteBtn.classList.add('active');
  });

  // ==========================================================
  // DELETE HELPER — shared by both marker click handlers below
  // ==========================================================

  async function handleDeleteMarker(marker) {
  const confirmed = await showValidationModal({
    type: "delete",
    title: "Delete Terminal?",
    message: `Permanently delete <span class="highlight-value">${marker.terminal_name || 'this terminal'}</span>?` +
    ` This cannot be undone.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    showCancel: true
  });

  if (!confirmed) return;

  try {
    const delRes = await fetch(`/DeleteTerminalLocation/${marker.terminal_id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const delResult = await delRes.json();

    if (delResult.error) {
      await showValidationModal({
        type: "error",
        title: "Delete Failed",
        message: delResult.error,
        confirmText: "OK",
        showCancel: false
      });
      return;
    }

    map.removeLayer(marker);

    await showValidationModal({
      type: "success",
      title: "Terminal Deleted",
      message: "The terminal was removed successfully.",
      confirmText: "OK",
      showCancel: false
    });

  } catch (err) {
    console.error(err);
    await showValidationModal({
      type: "error",
      title: "Delete Failed",
      message: "Something went wrong while deleting this terminal.",
      confirmText: "OK",
      showCancel: false
    });
  }
}

  // ==========================================================
  // FETCH TERMINALS + RENDER MARKERS
  // ==========================================================

  const markers = [];

  try {
    const res = await fetch('/terminals');
    const data = await res.json();
    const terminals = data.terminals || [];

    terminals.forEach(term => {
      const marker = L.marker([term.latitude, term.longitude], { icon: getIconFor(term.terminal_name) }).addTo(map);
      marker.terminal_id = term.terminal_id;
      marker.terminal_name = term.terminal_name;
      marker.terminal_address = term.terminal_address;

      maybeBindTooltip(marker, term.terminal_name);

      markers.push(marker);
    });
  } catch (err) {
    console.error(err);
    await showValidationModal({
      type: "error",
      title: "Load Failed",
      message: "Failed to load terminals.",
      confirmText: "OK",
      showCancel: false
    });
  }

  // Map click for Add: open modal (do NOT use prompt; let user type)
  map.on('click', (e) => {
    if (!addMode) return;

    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);

    pending.addLat = lat;
    pending.addLng = lng;
    pending.updateMarker = null;

    showModal({
      name: '',
      address: '',
      lat,
      lng
    });
  });

  // ==========================================================
  // SAVE MODAL (handles both Add and Update)
  // ==========================================================

  modalSaveBtn.addEventListener('click', async () => {
    const terminal_name = modalName.value.trim();
    const terminal_address = modalAddress.value.trim();

    if (addMode) {
      if (!pending.addLat || !pending.addLng) return;

      if (!terminal_name) {
        await showValidationModal({
          type: "warning",
          title: "Missing Name",
          message: "Terminal Name is required.",
          confirmText: "OK",
          showCancel: false
        });
        return;
      }

      if (!terminal_address) {
        await showValidationModal({
          type: "warning",
          title: "Missing Address",
          message: "Terminal Address is required.",
          confirmText: "OK",
          showCancel: false
        });
        return;
      }

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
          await showValidationModal({
            type: "error",
            title: "Add Failed",
            message: result.error,
            confirmText: "OK",
            showCancel: false
          });
          return;
        }

        const marker = L.marker([pending.addLat, pending.addLng], { icon: getIconFor(terminal_name) }).addTo(map);
        marker.terminal_id = result.terminal_id;
        marker.terminal_name = terminal_name;
        marker.terminal_address = terminal_address;

        maybeBindTooltip(marker, terminal_name);

        marker.on('click', async () => {
          if (updateMode) {
            pending.updateMarker = marker;
            pending.addLat = null;
            pending.addLng = null;

            const ll = marker.getLatLng();
            showModal({
              lat: ll.lat.toFixed(6),
              lng: ll.lng.toFixed(6),
              name: marker.terminal_name || '',
              address: marker.terminal_address || ''
            });
          }

          if (deleteMode) {
            await handleDeleteMarker(marker);
          }
        });

        markers.push(marker);

        hideModal();
        clearPending();
        resetModes();

        await showValidationModal({
          type: "success",
          title: "Terminal Added",
          message: "The terminal was added successfully.",
          confirmText: "OK",
          showCancel: false
        });

      } catch (err) {
        console.error(err);
        await showValidationModal({
          type: "error",
          title: "Add Failed",
          message: "Failed to add terminal.",
          confirmText: "OK",
          showCancel: false
        });
      }
      return;
    }

    if (updateMode) {
      const marker = pending.updateMarker;
      if (!marker) return;

      if (!terminal_name) {
        await showValidationModal({
          type: "warning",
          title: "Missing Name",
          message: "Terminal Name is required.",
          confirmText: "OK",
          showCancel: false
        });
        return;
      }

      if (!terminal_address) {
        await showValidationModal({
          type: "warning",
          title: "Missing Address",
          message: "Terminal Address is required.",
          confirmText: "OK",
          showCancel: false
        });
        return;
      }

      try {
        const ll = marker.getLatLng();

        const response = await fetch('/UpdateTerminalLocation', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            terminal_id: marker.terminal_id,
            terminal_name,
            terminal_address,
            latitude: ll.lat,
            longitude: ll.lng
          })
        });

        if (!response.ok) throw new Error("Server error");

        const result = await response.json();

        if (result.error) {
          await showValidationModal({
            type: "error",
            title: "Update Failed",
            message: result.error,
            confirmText: "OK",
            showCancel: false
          });
          return;
        }

        marker.terminal_name = terminal_name;
        marker.terminal_address = terminal_address;

        // Icon may need to change if the name was edited to/from the highlighted terminal
        marker.setIcon(getIconFor(terminal_name));

        // Remove any existing tooltip before re-binding, to avoid duplicates
        if (marker.getTooltip()) {
          marker.unbindTooltip();
        }
        maybeBindTooltip(marker, terminal_name);

        hideModal();
        clearPending();
        resetModes();

        await showValidationModal({
          type: "success",
          title: "Terminal Updated",
          message: "The terminal was updated successfully.",
          confirmText: "OK",
          showCancel: false
        });

      } catch (err) {
        console.error(err);
        await showValidationModal({
          type: "error",
          title: "Update Failed",
          message: "Failed to update terminal.",
          confirmText: "OK",
          showCancel: false
        });
      }

      return;
    }

    // If no mode is active, just close
    resetModes();
    clearPending();
  });

  // ==========================================================
  // MARKER INTERACTIONS (existing markers loaded on page load)
  // ==========================================================

  markers.forEach(marker => {
    marker.on('click', async () => {
      if (updateMode) {
        pending.updateMarker = marker;
        pending.addLat = null;
        pending.addLng = null;

        const ll = marker.getLatLng();
        showModal({
          lat: ll.lat.toFixed(6),
          lng: ll.lng.toFixed(6),
          name: marker.terminal_name || '',
          address: marker.terminal_address || ''
        });
        return;
      }

      if (deleteMode) {
        await handleDeleteMarker(marker);
      }
    });
  });
});