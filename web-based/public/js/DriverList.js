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

  // Search + sort controls
  const searchInput = document.getElementById("driver-search");
  const searchClear = document.getElementById("driver-search-clear");
  const sortSelect  = document.getElementById("driver-sort");

  let validationResolve = null;

  // Cache of driver rows keyed by driver_id
  let driverCache = {};
  // Currently selected driver (for update/delete)
  let selectedDriverId = null;

  // Live search + sort state (persists across polls)
  let searchTerm = "";
  let sortMode   = "name-asc";

  // Cached dataset between polls
  let cachedDrivers = [];

  // ==========================================================
  // VALIDATION MODAL
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
  // INLINE FIELD VALIDATION
  // ==========================================================

  // Field definitions: id → { label, validators[] }
  const FIELD_RULES = {
    email: {
      label: "Email",
      required: true,
      validate: (v) => {
        if (!v) return "Email is required.";
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(v)) return "Enter a valid email address.";
        return null;
      },
    },
    password: {
      label: "Password",
      required: true,
      // Update mode allows empty password (means "don't change")
      skipWhenEmpty: () => updateMode,
      validate: (v) => {
        if (updateMode && !v) return null;
        if (!v) return "Password is required.";
        if (v.length < 8) return "Password must be at least 8 characters.";
        return null;
      },
    },
    first_name: {
      label: "First Name",
      required: true,
      validate: (v) => {
        if (!v) return "First name is required.";
        if (v.length < 2) return "First name is too short.";
        if (!/^[A-Za-zÀ-ÿ.'\-\s]+$/.test(v)) return "Only letters, spaces, and .'- are allowed.";
        return null;
      },
    },
    middle_name: {
      label: "Middle Initial",
      required: false,
      validate: (v) => {
        if (!v) return null;
        if (v.length > 5) return "Middle initial should be short (max 5 chars).";
        if (!/^[A-Za-zÀ-ÿ.'\-\s]+$/.test(v)) return "Only letters, spaces, and .'- are allowed.";
        return null;
      },
    },
    last_name: {
      label: "Last Name",
      required: true,
      validate: (v) => {
        if (!v) return "Last name is required.";
        if (v.length < 2) return "Last name is too short.";
        if (!/^[A-Za-zÀ-ÿ.'\-\s]+$/.test(v)) return "Only letters, spaces, and .'- are allowed.";
        return null;
      },
    },
    contact_number: {
      label: "Contact Number",
      required: true,
      validate: (v) => {
        if (!v) return "Contact number is required.";
        const digits = v.replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 13) {
          return "Contact number must be 10–13 digits.";
        }
        return null;
      },
    },
    plate_number: {
      label: "Plate Number",
      required: true,
      validate: (v) => {
        if (!v) return "Plate number is required.";
        if (v.length < 3) return "Plate number is too short.";
        if (!/^[A-Za-z0-9\-\s]+$/.test(v)) return "Only letters, numbers, spaces, and hyphens.";
        return null;
      },
    },
    type_id: {
      label: "Vehicle Type",
      required: true,
      validate: (v) => (!v ? "Select a vehicle type." : null),
    },
    terminal_id: {
      label: "Terminal",
      required: true,
      validate: (v) => (!v ? "Select a terminal." : null),
    },
  };

  // ---- DOM helpers ----

  // Ensure each .modal-field has an error <span> under the input.
  function ensureErrorSlots() {
    Object.keys(FIELD_RULES).forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      const field = input.closest(".modal-field");
      if (!field) return;

      let slot = field.querySelector(".field-error");
      if (!slot) {
        slot = document.createElement("span");
        slot.className = "field-error";
        slot.dataset.for = id;
        field.appendChild(slot);
      }
    });
  }

  function setFieldError(id, message) {
    const input = document.getElementById(id);
    if (!input) return;
    const field = input.closest(".modal-field");
    if (!field) return;
    const slot = field.querySelector(".field-error");

    if (message) {
      input.classList.add("input-invalid");
      input.setAttribute("aria-invalid", "true");
      if (slot) slot.textContent = message;
    } else {
      input.classList.remove("input-invalid");
      input.removeAttribute("aria-invalid");
      if (slot) slot.textContent = "";
    }
  }

  function clearAllFieldErrors() {
    Object.keys(FIELD_RULES).forEach((id) => setFieldError(id, null));
  }

  // ---- Validate a single field ----
  function validateField(id) {
    const rule = FIELD_RULES[id];
    if (!rule) return null;

    const input = document.getElementById(id);
    if (!input) return null;

    let value = (input.value || "").trim();

    // Special case: password can be blank when updating
    if (rule.skipWhenEmpty && rule.skipWhenEmpty()) {
      setFieldError(id, null);
      return null;
    }

    const msg = rule.validate(value);
    setFieldError(id, msg);
    return msg;
  }

  // ---- Validate all fields ----
  // Returns an object: { valid: boolean, errors: { id: message } }
  function validateAll() {
    const errors = {};
    let firstInvalidId = null;

    Object.keys(FIELD_RULES).forEach((id) => {
      const msg = validateField(id);
      if (msg) {
        errors[id] = msg;
        if (!firstInvalidId) firstInvalidId = id;
      }
    });

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      firstInvalidId,
    };
  }

  // ---- Live re-validation as user types ----
  function attachLiveValidation() {
    Object.keys(FIELD_RULES).forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;

      const handler = () => {
        // Re-validate only if the field currently shows an error,
        // so we don't yell at the user before they've submitted.
        if (input.classList.contains("input-invalid")) {
          validateField(id);
        }
      };

      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
      input.addEventListener("blur", () => {
        // On blur, validate if the user has typed anything
        if ((input.value || "").trim() !== "") {
          validateField(id);
        }
      });
    });
  }

  // ==========================================================
  // DRIVER FORM HELPERS
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

    clearAllFieldErrors();
  }

  function populateModalFromDriver(driver) {
    document.getElementById("email").value = driver.email || "";
    document.getElementById("password").value = "";
    document.getElementById("first_name").value = driver.first_name || "";
    document.getElementById("middle_name").value = driver.middle_name || "";
    document.getElementById("last_name").value = driver.last_name || "";
    document.getElementById("contact_number").value = driver.contact_number || "";
    document.getElementById("plate_number").value = driver.plate_number || "";
    document.getElementById("type_id").value = driver.type_id ?? driver.vehicle_id ?? "";
    document.getElementById("terminal_id").value = driver.terminal_id ?? "";

    clearAllFieldErrors();
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
    resetModes();
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
      ? [driver.plate_number].filter(Boolean).join(" ")
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
      // ---- Validate every field before hitting the server ----
      const { valid, errors, firstInvalidId } = validateAll();

      if (!valid) {
        // Focus the first invalid field so the user can fix it right away
        if (firstInvalidId) {
          const el = document.getElementById(firstInvalidId);
          if (el) {
            el.focus();
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        return;
      }

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

      let url;
      let payload;
      let successMessage;
      let method = "POST";

      if (updateMode) {
        url = "/UpdateDriverCred";
        method = "PUT";
        payload = {
          driver_id: Number(selectedDriverId),
          ...basePayload
        };
        successMessage = "Driver updated successfully!";
      } else {
        url = "/InsertDriverInfo";
        method = "POST";
        payload = {
          ...basePayload,
          role_id: document.getElementById("role_id").value,
          status: "Inactive"
        };
        successMessage = "Driver added successfully!";
      }

      console.log("Sending request:", { method, url, payload });

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Server returned non-JSON:", {
          status: res.status,
          response: text
        });
        throw new Error(`Server returned an unexpected response (${res.status}).`);
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        // If the server gives us a field-specific error, show it inline
        if (data.field && FIELD_RULES[data.field]) {
          setFieldError(data.field, data.message || "Invalid value.");
          const el = document.getElementById(data.field);
          if (el) {
            el.focus();
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          return;
        }

        // Otherwise show the generic error modal
        throw new Error(data.message || "Failed to save driver");
      }

      hideModal();
      clearDriverModalInputs();
      resetModes();
      clearRowSelection();

      await showValidationModal({
        type: "success",
        title: updateMode ? "Driver Updated" : "Driver Added",
        message: successMessage,
        confirmText: "OK",
        showCancel: false
      });

      location.reload();

    } catch (err) {
      console.error("Save driver error:", err);
      await showValidationModal({
        type: "error",
        title: "Save Failed",
        message: err.message || "Failed to save driver.",
        confirmText: "OK",
        showCancel: false
      });
    }
  });

  // ==========================================================
  // SEARCH + SORT HELPERS
  // ==========================================================

  function fullNameOf(d) {
    return [d.first_name, d.middle_name, d.last_name]
      .filter(Boolean).join(" ")
      .toLowerCase();
  }

  function matchesSearch(d, term) {
    if (!term) return true;
    const t = term.toLowerCase();
    return (
      fullNameOf(d).includes(t) ||
      (d.email || "").toLowerCase().includes(t) ||
      (d.contact_number || "").toLowerCase().includes(t) ||
      (d.plate_number || "").toLowerCase().includes(t) ||
      (d.type_name || "").toLowerCase().includes(t) ||
      (d.terminal_name || "").toLowerCase().includes(t)
    );
  }

  function sortDrivers(list, mode) {
    const arr = [...list];

    switch (mode) {
      case "name-asc":
        arr.sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)));
        break;

      case "terminal":
        arr.sort((a, b) => {
          const ta = (a.terminal_name || "zzz").toLowerCase();
          const tb = (b.terminal_name || "zzz").toLowerCase();
          if (ta !== tb) return ta.localeCompare(tb);
          return fullNameOf(a).localeCompare(fullNameOf(b));
        });
        break;

      case "vehicle-type":
        arr.sort((a, b) => {
          const va = (a.type_name || "zzz").toLowerCase();
          const vb = (b.type_name || "zzz").toLowerCase();
          if (va !== vb) return va.localeCompare(vb);
          return fullNameOf(a).localeCompare(fullNameOf(b));
        });
        break;
    }

    return arr;
  }

  function updateSearchClear() {
    if (!searchClear) return;
    if (searchTerm) searchClear.classList.add("is-visible");
    else searchClear.classList.remove("is-visible");
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value.trim();
      updateSearchClear();
      renderDriverListFromCache();
    });
  }

  if (searchClear) {
    searchClear.addEventListener("click", () => {
      searchTerm = "";
      if (searchInput) searchInput.value = "";
      updateSearchClear();
      renderDriverListFromCache();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      sortMode = e.target.value;
      renderDriverListFromCache();
    });
  }

  // ==========================================================
  // BUILD A SINGLE DRIVER ROW
  // ==========================================================

  function buildDriverRow(driver) {
    const row = document.createElement("div");
    row.classList.add("data-row");
    row.dataset.driverId = driver.driver_id;

    if (String(driver.driver_id) === String(selectedDriverId)) {
      row.classList.add("selected");
    }

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

    const statusCell = document.createElement("div");
    statusCell.classList.add("data-cell", "col-status", "data-highlight");
    statusCell.textContent = driver.status || "Inactive";

    const unitCell = document.createElement("div");
    unitCell.classList.add("data-cell", "col-plate-no");
    unitCell.textContent = driver.plate_number || "-";

    row.appendChild(vehicleTypecell);
    row.appendChild(nameCell);
    row.appendChild(contactCell);
    row.appendChild(statusCell);
    row.appendChild(unitCell);

    return row;
  }

  // ==========================================================
  // RENDER LIST FROM CACHE
  // ==========================================================

  function renderDriverListFromCache() {
    const filtered = cachedDrivers.filter((d) => matchesSearch(d, searchTerm));
    const sorted = sortDrivers(filtered, sortMode);

    if (sorted.length === 0) {
      container.innerHTML = searchTerm
        ? `<p>No drivers match "<strong>${searchTerm}</strong>".</p>`
        : "<p>No drivers found.</p>";
      return;
    }

    container.innerHTML = "";

    let groupKeyFn = null;
    if (sortMode === "terminal") {
      groupKeyFn = (d) => d.terminal_name || "Unknown Terminal";
    } else if (sortMode === "vehicle-type") {
      groupKeyFn = (d) => d.type_name || "Uncategorized";
    }

    if (!groupKeyFn) {
      sorted.forEach((driver) => {
        container.appendChild(buildDriverRow(driver));
      });
      return;
    }

    const grouped = {};
    sorted.forEach((item) => {
      const key = groupKeyFn(item);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    groupKeys.forEach((key) => {
      const categoryHeader = document.createElement("div");
      categoryHeader.classList.add("vehicle-header");
      categoryHeader.textContent = key.toUpperCase();
      container.appendChild(categoryHeader);

      grouped[key].forEach((driver) => {
        container.appendChild(buildDriverRow(driver));
      });
    });
  }

  // ==========================================================
  // FETCH + CACHE
  // ==========================================================

  async function renderDriverList() {
    try {
      const res = await fetch("/getDriverInfo", { credentials: "include" });
      const data = await res.json();

      if (!data || data.length === 0) {
        cachedDrivers = [];
        driverCache = {};
        container.innerHTML = "<p>No drivers found.</p>";
        return;
      }

      const newCache = {};
      data.forEach((item) => {
        newCache[item.driver_id] = item;
      });
      driverCache = newCache;
      cachedDrivers = data;

      renderDriverListFromCache();

    } catch (err) {
      console.error("renderDriverList error:", err);
      container.innerHTML = "<p>Error loading drivers.</p>";
    }
  }

  // ==========================================================
  // LOAD TERMINALS + VEHICLES
  // ==========================================================

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
  }

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
      console.error("Failed to load vehicles:", err);
    }
  }

  // ==========================================================
  // INIT
  // ==========================================================

  // Inject error <span> slots into each .modal-field before anything else
  ensureErrorSlots();
  attachLiveValidation();

  await renderDriverList();
  setInterval(renderDriverList, 5000);

  await loadTerminals();
  await loadVehicles();

});