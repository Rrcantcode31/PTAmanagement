document.addEventListener("DOMContentLoaded", async () => {

  const vanPanel = document.getElementById("vanPanel");
  const busPanel = document.getElementById("busPanel");
  const tabButtons = document.querySelectorAll(".tab-btn");

  try {

    const response = await fetch("/getDriverInfo");
    const data = await response.json();

    console.log("Driver info response:", data); // TEMP — check terminal_name is present

    const vans = data.filter(v =>
      v.type_name?.toLowerCase().includes("van") ||
      v.type_name?.toLowerCase().includes("vehicle")
    );

    const buses = data.filter(v =>
      v.type_name?.toLowerCase().includes("bus")
    );

    renderGroupedList(vans, vanPanel);
    renderGroupedList(buses, busPanel);

  } catch (err) {
    console.error("Failed to fetch drivers:", err);
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      vanPanel.classList.add("hidden");
      busPanel.classList.add("hidden");
      document.getElementById(btn.dataset.target).classList.remove("hidden");
    });
  });

});

function renderGroupedList(list, container) {

  container.innerHTML = "";

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-message">No vehicles available</div>`;
    return;
  }

  // Group vehicles directly by terminal_name (already joined in getDriverInfo)
  const groups = {};

  list.forEach(vehicle => {
    const key = vehicle.terminal_name || "Unknown Terminal";
    if (!groups[key]) groups[key] = [];
    groups[key].push(vehicle);
  });

  const sortedTerminalNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  sortedTerminalNames.forEach(terminalName => {

    const vehicles = groups[terminalName];

    const section = document.createElement("div");
    section.classList.add("terminal-group");

    const header = document.createElement("div");
    header.classList.add("terminal-group-header");
    header.innerHTML = `
      <i class="fas fa-map-marker-alt"></i>
      <span>${terminalName}</span>
      <span class="terminal-count">${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}</span>
    `;

    const grid = document.createElement("div");
    grid.classList.add("terminal-group-grid");

    vehicles.forEach(vehicle => {
      grid.appendChild(buildVehicleCard(vehicle));
    });

    section.appendChild(header);
    section.appendChild(grid);
    container.appendChild(section);

  });

}

function buildVehicleCard(vehicle) {

  const item = document.createElement("div");
  item.classList.add("vehicle-card");

  const fullName = [
    vehicle.first_name,
    vehicle.middle_name,
    vehicle.last_name
  ].filter(Boolean).join(" ");

  const statusClass =
    vehicle.status === "Active" ? "status-active" : "status-inactive";

  item.innerHTML = `
    <div class="card-top">
      <h3>${vehicle.plate_number}</h3>
      <span class="status-badge ${statusClass}">${vehicle.status}</span>
    </div>
    <p class="driver-name">${fullName}</p>
    <button class="view-btn">View Details</button>
    <div class="vehicle-details hidden">
      <p><strong>Contact:</strong> ${vehicle.contact_number}</p>
      <p><strong>Vehicle Type:</strong> ${vehicle.type_name}</p>
    </div>
  `;

  const button = item.querySelector(".view-btn");
  const details = item.querySelector(".vehicle-details");

  button.addEventListener("click", () => {
    details.classList.toggle("hidden");
    button.textContent = details.classList.contains("hidden") ? "View Details" : "Hide Details";
  });

  return item;

}