document.addEventListener("DOMContentLoaded", async () => {

  const vanPanel = document.getElementById("vanPanel");
  const busPanel = document.getElementById("busPanel");
  const tabButtons = document.querySelectorAll(".tab-btn");

  try {

    const response = await fetch("/getDriverInfo");
    const data = await response.json();

    const vans = data.filter(v =>
  v.type_name?.toLowerCase().includes("van") ||
  v.type_name?.toLowerCase().includes("vehicle")
);

const buses = data.filter(v =>
  v.type_name?.toLowerCase().includes("bus")
);

    renderList(vans, vanPanel);
    renderList(buses, busPanel);

  } catch (err) {
    console.error("Failed to fetch drivers:", err);
  }

  // TAB SWITCHING
  tabButtons.forEach(btn => {

    btn.addEventListener("click", () => {

      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      vanPanel.classList.add("hidden");
      busPanel.classList.add("hidden");

      document
        .getElementById(btn.dataset.target)
        .classList.remove("hidden");
    });

  });

});

function renderList(list, container) {

  container.innerHTML = "";

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-message">
        No vehicles available
      </div>
    `;
    return;
  }

  list.forEach(vehicle => {

    const item = document.createElement("div");
    item.classList.add("vehicle-card");

    const fullName = [
      vehicle.first_name,
      vehicle.middle_name,
      vehicle.last_name
    ].filter(Boolean).join(" ");

    const statusClass =
      vehicle.status === "Active"
        ? "status-active"
        : "status-inactive";

    item.innerHTML = `
      <div class="card-top">
        <h3>${vehicle.plate_number}</h3>
        <span class="status-badge ${statusClass}">
          ${vehicle.status}
        </span>
      </div>

      <p class="driver-name">${fullName}</p>

      <button class="view-btn">
        View Details
      </button>

      <div class="vehicle-details hidden">
        <p><strong>Contact:</strong> ${vehicle.contact_number}</p>
        <p><strong>Vehicle Type:</strong> ${vehicle.type_name}</p>
      </div>
    `;

    const button = item.querySelector(".view-btn");
    const details = item.querySelector(".vehicle-details");

    button.addEventListener("click", () => {

      details.classList.toggle("hidden");

      button.textContent =
        details.classList.contains("hidden")
          ? "View Details"
          : "Hide Details";
    });

    container.appendChild(item);

  });

}