document.addEventListener('DOMContentLoaded', async () => {

    const modal = document.getElementById('magic-modal');
    const container = document.getElementById("displayFarePrices");

    const fromSelect = document.getElementById("from_terminal_id");
    const toSelect = document.getElementById("terminal_id");

    const addBtn = document.querySelector('.add-btn');
    const uptBtn = document.querySelector('.update-btn');
    const dltBtn = document.querySelector('.delete-btn');

    const saveBtn = document.getElementById("modal-save");
    const closeBtn = document.getElementById("modal-close");

    // Validation / confirmation modal elements
    const validationModal = document.getElementById("validation-modal");
    const validationIcon = document.getElementById("validation-icon");
    const validationTitle = document.getElementById("validation-title");
    const validationMessage = document.getElementById("validation-message");
    const validationCancel = document.getElementById("validation-cancel");
    const validationConfirm = document.getElementById("validation-confirm");

    let validationResolve = null;

    // Cache of fare rows keyed by bounds_id, populated from /getFarePrice
    let fareCache = {};
    // Currently selected fare row (for update/delete)
    let selectedBoundsId = null;

    // load terminals ONCE
    await loadTerminals();

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

    let addMode = false;
    let updateMode = false;
    let deleteMode = false;

    const resetModes = () => {
        addMode = updateMode = deleteMode = false;

        addBtn.classList.remove("active");
        uptBtn.classList.remove("active");
        dltBtn.classList.remove("active");
    };

    const showModal = () => modal.classList.remove('hidden');
    const hideModal = () => modal.classList.add('hidden');

    function clearFareModalInputs() {
        document.getElementById("from_terminal_id").value = "";
        document.getElementById("terminal_id").value = "";
        document.getElementById("kilometer_number").value = "";
        document.getElementById("regular_price").value = "";
        document.getElementById("discounted_price").value = "";
        document.getElementById("regular_m_price").value = "";
        document.getElementById("discounted_m_price").value = "";
    }

    function populateModalFromFare(fare) {
        document.getElementById("from_terminal_id").value = fare.from_terminal_id ?? "";
        document.getElementById("terminal_id").value = fare.to_terminal_id ?? "";
        document.getElementById("kilometer_number").value = fare.kilometer ?? "";
        document.getElementById("regular_price").value = fare.regular_t ?? "";
        document.getElementById("discounted_price").value = fare.discounted_t ?? "";
        document.getElementById("regular_m_price").value = fare.regular_m ?? "";
        document.getElementById("discounted_m_price").value = fare.discounted_m ?? "";
    }

    function clearRowSelection() {
        selectedBoundsId = null;
        container.querySelectorAll(".fare-data-row.selected").forEach(r => r.classList.remove("selected"));
    }

    addBtn.addEventListener("click", () => {
        if (addMode) {
            resetModes();
            hideModal();
            clearFareModalInputs();
            return;
        }

        resetModes();
        addMode = true;
        addBtn.classList.add("active");
        clearFareModalInputs();
        showModal();
    });

    uptBtn.addEventListener("click", () => {
        if (updateMode) {
            resetModes();
            hideModal();
            clearFareModalInputs();
            return;
        }

        resetModes();
        updateMode = true;
        uptBtn.classList.add("active");

        if (selectedBoundsId && fareCache[selectedBoundsId]) {
            populateModalFromFare(fareCache[selectedBoundsId]);
        } else {
            clearFareModalInputs();
        }

        showModal();
    });

    dltBtn.addEventListener("click", async () => {
        if (deleteMode) {
            resetModes();
            return;
        }

        resetModes();
        deleteMode = true;
        dltBtn.classList.add("active");

        if (!selectedBoundsId) {
            await showValidationModal({
                type: "warning",
                title: "No Fare Selected",
                message: "Please select a fare row first.",
                confirmText: "OK",
                showCancel: false
            });
            resetModes();
            return;
        }

        const fare = fareCache[selectedBoundsId];
        const routeLabel = fare
            ? `${fare.from_terminal || "?"} → ${fare.to_terminal || "?"}`
            : `fare #${selectedBoundsId}`;

        const confirmed = await showValidationModal({
            type: "delete",
            title: "Delete Fare Price?",
            message: `Permanently delete the fare price for <span class="highlight-value">${routeLabel}</span>? This cannot be undone.`,
            confirmText: "Delete",
            cancelText: "Cancel",
            showCancel: true
        });

        if (!confirmed) {
            resetModes();
            return;
        }

        try {
            const res = await fetch(`/deleteFarePrice/${selectedBoundsId}`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to delete fare price.");
            }

            await showValidationModal({
                type: "success",
                title: "Fare Price Deleted",
                message: `The fare price for ${routeLabel} has been permanently deleted.`,
                confirmText: "OK",
                showCancel: false
            });

            clearRowSelection();
            location.reload();

        } catch (err) {
            console.error(err);
            await showValidationModal({
                type: "error",
                title: "Delete Failed",
                message: err.message || "Failed to delete the fare price.",
                confirmText: "OK",
                showCancel: false
            });
        } finally {
            resetModes();
        }
    });

    closeBtn.addEventListener("click", () => {
        hideModal();
        clearFareModalInputs();
    });

    saveBtn.addEventListener("click", async () => {
        try {
            const basePayload = {
                from_terminal_id: document.getElementById("from_terminal_id").value,
                to_terminal_id: document.getElementById("terminal_id").value,
                kilometer: document.getElementById("kilometer_number").value.trim(),
                regular_t: document.getElementById("regular_price").value,
                discounted_t: document.getElementById("discounted_price").value.trim(),
                regular_m: document.getElementById("regular_m_price").value.trim(),
                discounted_m: document.getElementById("discounted_m_price").value.trim(),
            };

            let url, payload, method, successMessage;

            if (updateMode) {
                url = "/updateFarePrices";
                method = "PUT";
                payload = { bounds_id: selectedBoundsId, ...basePayload };
                successMessage = "Fare price updated successfully!";
            } else {
                url = "/InsertFarePrice";
                method = "POST";
                payload = basePayload;
                successMessage = "Fare Price added successfully!";
            }

            const res = await fetch(url, {
                method: method,
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store"
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(
                    data.message || "Failed to update fare price"
                );
            }

            hideModal();
            clearFareModalInputs();
            resetModes();
            clearRowSelection();

            await showValidationModal({
                type: "success",
                title: updateMode ? "Fare Price Updated" : "Fare Price Added",
                message: successMessage,
                confirmText: "OK",
                showCancel: false
            });

            location.reload();
        } catch (err) {
            console.error(err);
            await showValidationModal({
                type: "error",
                title: "Save Failed",
                message: err.message || "Failed to save fare price.",
                confirmText: "OK",
                showCancel: false
            });
        }
    });

    try {
        const res = await fetch("/getFarePrice", { cache: "no-store" });
        const data = await res.json();
        if (!data || data.length === 0) return container.innerHTML = "<p>No fare prices found.</p>";

        const grouped = {};
        data.forEach(item => {
            const fromTerminal = item.from_terminal || "Uncategorized";
            if (!grouped[fromTerminal]) grouped[fromTerminal] = [];
            grouped[fromTerminal].push(item);
            fareCache[item.bounds_id] = item; // cache for update/delete-mode use
        });
        container.innerHTML = "";

        Object.entries(grouped).forEach(([fromTerminals, toTerminals]) => {
            const terminalHeader = document.createElement("div");
            terminalHeader.classList.add("from-terminal-header");
            terminalHeader.textContent = fromTerminals.toUpperCase();
            container.appendChild(terminalHeader);

            toTerminals.forEach(details => {
                const row = document.createElement("div");
                row.classList.add("fare-data-row");
                row.dataset.boundsId = details.bounds_id;

                row.addEventListener("click", () => {
                    const alreadySelected = row.classList.contains("selected");
                    clearRowSelection();

                    if (alreadySelected) {
                        if (updateMode) clearFareModalInputs();
                        return;
                    }

                    row.classList.add("selected");
                    selectedBoundsId = details.bounds_id;

                    if (updateMode) {
                        populateModalFromFare(details);
                    }
                });

                const fromTerminalcell = document.createElement("div");
                fromTerminalcell.classList.add("data-cell", "col-route");
                fromTerminalcell.textContent = " ~ ";

                const toTerminalcell = document.createElement("div");
                toTerminalcell.classList.add("data-cell", "col-vice");
                toTerminalcell.textContent = details.to_terminal || "No data";

                const kilometerCell = document.createElement("div");
                kilometerCell.classList.add("data-cell", "col-km");
                kilometerCell.textContent = details.kilometer || "No data";

                const regularTcell = document.createElement("div");
                regularTcell.classList.add("data-cell", "col-reg-t", "price-highlight");
                regularTcell.textContent = details.regular_t || "No data";

                const discountedTcell = document.createElement("div");
                discountedTcell.classList.add("data-cell", "col-disc-t");
                discountedTcell.textContent = details.discounted_t || "No data";

                const regularMcell = document.createElement("div");
                regularMcell.classList.add("data-cell", "col-reg-m", "price-highlight");
                regularMcell.textContent = details.regular_m || "No data";

                const discountedMcell = document.createElement("div");
                discountedMcell.classList.add("data-cell", "col-disc-m");
                discountedMcell.textContent = details.discounted_m || "No data";

                row.appendChild(fromTerminalcell);
                row.appendChild(toTerminalcell);
                row.appendChild(kilometerCell);
                row.appendChild(regularTcell);
                row.appendChild(discountedTcell);
                row.appendChild(regularMcell);
                row.appendChild(discountedMcell);
                container.appendChild(row);
            });
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Error loading fare prices.</p>";
    }

    async function loadTerminals() {
        try {
            const res = await fetch('/terminals');
            const data = await res.json();

            const terminals = data.terminals || [];

            fromSelect.innerHTML = '<option value="">Select Terminal</option>';
            toSelect.innerHTML = '<option value="">Select Terminal</option>';

            terminals.forEach(term => {
                const option1 = document.createElement("option");
                option1.value = term.terminal_id;
                option1.textContent = `${term.terminal_name} - ${term.terminal_address}`;

                const option2 = option1.cloneNode(true);

                fromSelect.appendChild(option1);
                toSelect.appendChild(option2);
            });

        } catch (err) {
            console.error("Failed to load terminals:", err);
        }
    }

});