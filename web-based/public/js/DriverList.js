document.addEventListener('DOMContentLoaded', async () => {

  const modal = document.getElementById('magic-modal');
  const container = document.getElementById("regionalPriceContainer");

  const addBtn = document.querySelector('.add-btn');
  const uptBtn = document.querySelector('.update-btn');
  const dltBtn = document.querySelector('.delete-btn');

  const saveBtn = document.getElementById("modal-save");
  const closeBtn = document.getElementById("modal-close");

  const terminalSelect = document.getElementById("terminal_id");
  const vehicleSelect = document.getElementById("type_id");
  const driverSelect = document.getElementById("driver_select");

  const validationModal = document.getElementById("validation-modal");
  const validationIcon = document.getElementById("validation-icon");
  const validationTitle = document.getElementById("validation-title");
  const validationMessage = document.getElementById("validation-message");
  const validationCancel = document.getElementById("validation-cancel");
  const validationConfirm = document.getElementById("validation-confirm");

  let validationResolve = null;

  // Cache of driver rows keyed by driver_id, populated from /getDriverInfo
  let driverCache = {};
  // Currently selected driver (for update/delete)
  let selectedDriverId = null;

  //fetch sections
  await loadTerminals();
  await loadVehicles();

  // ==========================================================
  // VALIDATION MODAL (moved to be self-contained, correctly closed)
  // ==========================================================

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

    // Change icon
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
  // DRIVER FORM HELPERS (now correctly top-level)
  // ==========================================================

  function loadDriverOptions() {
    if (!driverSelect) return;
    driverSelect.innerHTML = '<option value="">Select Driver</option>';
    Object.values(driverCache).forEach(driver => {
      const fullName = [driver.first_name, driver.middle_name, driver.last_name]
        .filter(Boolean).join(" ");
      const option = document.createElement("option");
      option.value = driver.driver_id;
      option.textContent = fullName || `Driver #${driver.driver_id}`;
      driverSelect.appendChild(option);
    });
  }

  if (driverSelect) {
    driverSelect.addEventListener("change", () => {
      selectedDriverId = driverSelect.value || null;
      if (selectedDriverId) {
        populateModalFromDriver(driverCache[selectedDriverId]);
      } else {
        clearDriverModalInputs();
      }
    });
  }

  function clearDriverModalInputs() {
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    document.getElementById("first_name").value = "";
    document.getElementById("middle_name").value = "";
    document.getElementById("last_name").value = "";
    document.getElementById("contact_number").value = "";
    document.getElementById("plate_number").value = "";
    document.getElementById("type_id").value = "";
    document.getElementById("terminal_id").value = "";
  }

  function populateModalFromDriver(driver) {
    document.getElementById("email").value = driver.email || "";
    document.getElementById("password").value = ""; // never pre-fill password
    document.getElementById("first_name").value = driver.first_name || "";
    document.getElementById("middle_name").value = driver.middle_name || "";
    document.getElementById("last_name").value = driver.last_name || "";
    document.getElementById("contact_number").value = driver.contact_number || "";
    document.getElementById("plate_number").value = driver.plate_number || "";
    document.getElementById("type_id").value = driver.type_id ?? driver.vehicle_id ?? "";
    document.getElementById("terminal_id").value = driver.terminal_id ?? "";
  }

  function clearRowSelection() {
    selectedDriverId = null;
    container.querySelectorAll(".data-row.selected").forEach(r => r.classList.remove("selected"));
  }

  let addMode = false;
  let updateMode = false;
  let deleteMode = false;

  const resetModes = () => {
    addMode = updateMode = deleteMode = false;
    addBtn.classList.remove("active");
    uptBtn.classList.remove("active");
    dltBtn.classList.remove("active");
  };

  const showModal = () => {
    modal.classList.remove('hidden');
  };

  const hideModal = () => {
    modal.classList.add('hidden');
  };

  addBtn.addEventListener("click", () => {
    if (addMode) {
      resetModes();
      hideModal();
      clearDriverModalInputs();
      return;
    }
    resetModes();
    addMode = true;
    addBtn.classList.add("active");
    clearDriverModalInputs();
    showModal();
  });

  uptBtn.addEventListener("click", () => {
    if (updateMode) {
      resetModes();
      hideModal();
      clearDriverModalInputs();
      return;
    }
    resetModes();
    updateMode = true;
    uptBtn.classList.add("active");

    loadDriverOptions();

    if (selectedDriverId && driverCache[selectedDriverId]) {
      if (driverSelect) driverSelect.value = selectedDriverId;
      populateModalFromDriver(driverCache[selectedDriverId]);
    } else {
      clearDriverModalInputs();
    }

    showModal();
  });

  closeBtn.addEventListener("click", () => {
    hideModal();
    clearDriverModalInputs();
  });

  // ==========================================================
  // DELETE
  // ==========================================================

  dltBtn.addEventListener("click", async () => {

    if (!selectedDriverId) {
      await showValidationModal({
        type: "warning",
        title: "No Driver Selected",
        message: "Please select a driver first.",
        confirmText: "OK",
        showCancel: false
      });
      return;
    }

    const driver = driverCache[selectedDriverId];

    const fullName = driver
      ? [driver.first_name, driver.middle_name, driver.last_name]
          .filter(Boolean).join(" ")
      : `Driver #${selectedDriverId}`;

    const plate_number = driver 
      ? [driver.plate_number]
              .filter(Boolean).join(" ")
              : `Driver #${selectedDriverId}`;  

    const confirmed = await showValidationModal({
  type: "delete",
  title: "Delete Driver?",
  message:
    `Permanently delete <span class="highlight-value">${fullName || "this driver"}</span>? ` +
    `with a vehicle <span class="highlight-value">${plate_number || "this vehicle"}</span>? ` +
    `This will delete the driver's information and authentication account. ` +
    `<strong>This action cannot be undone.</strong>`,
  confirmText: "Delete",
  cancelText: "Cancel",
  showCancel: true
});

    if (!confirmed) return;

    try {
      const res = await fetch("/DeleteDriverInfo", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ driver_id: Number(selectedDriverId) })
      });

      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Server returned non-JSON:", text);
        throw new Error(`Server returned an unexpected response (${res.status}).`);
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to delete driver.");
      }

      await showValidationModal({
        type: "success",
        title: "Driver Deleted",
        message: `${fullName || "The driver"} has been permanently deleted.`,
        confirmText: "OK",
        showCancel: false
      });

      clearRowSelection();
      location.reload();

    } catch (err) {
      console.error("Delete driver error:", err);
      await showValidationModal({
        type: "error",
        title: "Delete Failed",
        message: err.message || "Failed to delete the driver.",
        confirmText: "OK",
        showCancel: false
      });
    }

  });

  // ==========================================================
  // SAVE (ADD / UPDATE)
  // ==========================================================

  saveBtn.addEventListener("click", async () => {
    try {
      const basePayload = {
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        first_name: document.getElementById("first_name").value.trim(),
        middle_name: document.getElementById("middle_name").value.trim(),
        last_name: document.getElementById("last_name").value.trim(),
        contact_number: document.getElementById("contact_number").value.trim(),
        plate_number: document.getElementById("plate_number").value.trim(),
        type_id: document.getElementById("type_id").value,
        terminal_id: document.getElementById("terminal_id").value,
      };

      let url, payload, successMessage;

      if (updateMode) {
        url = "/UpdateDriverCred";
        payload = { driver_id: selectedDriverId, ...basePayload };
        successMessage = "Driver updated successfully!";
      } else {
        url = "/InsertDriverInfo";
        payload = { ...basePayload, role_id: document.getElementById("role_id").value, status: "Inactive" };
        successMessage = "Driver added successfully!";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save driver");

      hideModal();
      clearDriverModalInputs();
      resetModes();
      clearRowSelection();
      alert(successMessage);
      location.reload();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });

  // ==========================================================
  // LOAD DRIVER LIST
  // ==========================================================

  try {
    const res = await fetch("/getDriverInfo");
    const data = await res.json();
    if (!data || data.length === 0) return container.innerHTML = "<p>No Info found found.</p>";

    const grouped = {};
    data.forEach(item => {
      const vehicleType = item.type_name || "Uncategorized";
      if (!grouped[vehicleType]) grouped[vehicleType] = [];
      grouped[vehicleType].push(item);
      driverCache[item.driver_id] = item;
    });
    container.innerHTML = "";

    Object.entries(grouped).forEach(([vehicleType, drivers]) => {
      const categoryHeader = document.createElement("div");
      categoryHeader.classList.add("vehicle-header");
      categoryHeader.textContent = vehicleType.toUpperCase();
      container.appendChild(categoryHeader);

      drivers.forEach(driver => {
        const row = document.createElement("div");
        row.classList.add("data-row");
        row.dataset.driverId = driver.driver_id;

        row.addEventListener("click", () => {
          const alreadySelected = row.classList.contains("selected");
          clearRowSelection();

          if (alreadySelected) {
            if (updateMode) clearDriverModalInputs();
            return;
          }

          row.classList.add("selected");
          selectedDriverId = driver.driver_id;

          if (updateMode) {
            if (driverSelect) driverSelect.value = driver.driver_id;
            populateModalFromDriver(driver);
          }
        });

        const vehicleTypecell = document.createElement("div");
        vehicleTypecell.classList.add("data-cell", "col-vehicle");
        vehicleTypecell.textContent = "~";

        const nameCell = document.createElement("div");
        nameCell.classList.add("data-cell", "col-driver-name");
        const fullName = [driver.first_name, driver.middle_name, driver.last_name]
          .filter(Boolean).join(" ");
        nameCell.textContent = fullName || "No Name";

        const contactCell = document.createElement("div");
        contactCell.classList.add("data-cell", "col-cont-no");
        contactCell.textContent = driver.contact_number || "No Data";

        const Statuscell = document.createElement("div");
        Statuscell.classList.add("data-cell", "col-status", "data-highlight");
        Statuscell.textContent = driver.status || "Inactive";

        const unitCell = document.createElement("div");
        unitCell.classList.add("data-cell", "col-plate-no");
        unitCell.textContent = driver.plate_number || "-";

        row.appendChild(vehicleTypecell);
        row.appendChild(nameCell);
        row.appendChild(contactCell);
        row.appendChild(Statuscell);
        row.appendChild(unitCell);
        container.appendChild(row);
      });
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Error loading drivers.</p>";
  }

  //fetch terminal locations
  async function loadTerminals() {
    try {
      const res = await fetch('/terminals');
      const data = await res.json();
      const terminals = data.terminals || [];
      terminalSelect.innerHTML = '<option value="">Select Terminal</option>';
      terminals.forEach(term => {
        const option = document.createElement("option");
        option.value = term.terminal_id;
        option.textContent = `${term.terminal_name} - ${term.terminal_address}`;
        terminalSelect.appendChild(option);
      });
    } catch (err) {
      console.error("Failed to load terminals:", err);
    }
  };

  //fetch vehicles
  async function loadVehicles() {
    try {
      const res = await fetch('/getVehicles');
      const data = await res.json();
      const vehicles = data.vehicles || [];
      vehicleSelect.innerHTML = '<option value="">Select Vehicle</option>';
      vehicles.forEach(v => {
        const option = document.createElement("option");
        option.value = v.type_id;
        option.textContent = `${v.type_name}`;
        vehicleSelect.appendChild(option);
      });
    } catch (err) {
      console.error("Failed to load vehicles:", err)
    }
  };

});