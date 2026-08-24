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

    // load terminals ONCE
    await loadTerminals();

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

    addBtn.addEventListener("click", () => {
        if (addMode) {
            resetModes();
            hideModal();
            return;
        }

        showModal();
        resetModes();
        addMode = true;
        addBtn.classList.add("active");
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
        clearDriverModalInputs();
        showModal();
    });

    closeBtn.addEventListener("click", () => {
        hideModal();
        clearDriverModalInputs();
    });
        saveBtn.addEventListener("click", async () => {
                try {
                const payload = {
                    from_terminal_id: document.getElementById("from_terminal_id").value,
                    to_terminal_id: document.getElementById("terminal_id").value,

                    kilometer: document.getElementById("kilometer_number").value.trim(),
                    regular_t: document.getElementById("regular_price").value,
                    discounted_t: document.getElementById("discounted_price").value.trim(),
                    regular_m: document.getElementById("regular_m_price").value.trim(),
                    discounted_m: document.getElementById("discounted_m_price").value.trim(),
                    
                    
                };
                const res = await fetch("/InsertFarePrice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || "Failed to add price");
                hideModal();
                // optional: reload your table/list
                // await loadDrivers();
                alert("Fare Price added successfully!");
                location.reload();
            } catch (err) {
                console.error(err);
                alert(err.message);
            }
      });

    try{
        const res = await fetch("/getFarePrice");
        const data = await res.json();
        if (!data || data.length === 0) return container.innerHTML = "<p>No fare prices found.</p>";

        const grouped = {};
          data.forEach(item => {
            const fromTerminal = item.from_terminal || "Uncategorized";
            if(!grouped[fromTerminal]) grouped[fromTerminal] = [];
            grouped[fromTerminal].push(item); });
            container.innerHTML = "";

            Object.entries(grouped).forEach(([fromTerminals, toTerminals]) =>{
                const terminalHeader = document.createElement("div");
                terminalHeader.classList.add("from-terminal-header");
                terminalHeader.textContent = fromTerminals.toUpperCase();
                container.appendChild(terminalHeader);

                toTerminals.forEach(details => {
                    const row = document.createElement("div");
                    row.classList.add("fare-data-row");

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
                    regularTcell.classList.add("data-cell", "col-reg-t" , "price-highlight");
                    regularTcell.textContent = details.regular_t || "No data";

                    const discountedTcell = document.createElement("div");
                    discountedTcell.classList.add("data-cell", "col-disc-t");
                    discountedTcell.textContent = details.discounted_t || "No data";

                    const regularMcell = document.createElement("div");
                    regularMcell.classList.add("data-cell", "col-reg-m" , "price-highlight");
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