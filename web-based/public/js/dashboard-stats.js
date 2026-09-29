// ==========================================================
// DASHBOARD STATS
// Fetches live operational counts and keeps them fresh
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {

  const API = '/dashboard-stats';
  const REFRESH_MS = 30000;   // 30 seconds

  // DOM refs
  const elZones       = document.getElementById('stat-active-zones');
  const elZonesSub    = document.getElementById('stat-active-zones-sub');
  const elQueue       = document.getElementById('stat-in-queue');
  const elDispatched  = document.getElementById('stat-dispatched-today');
  const elDrivers     = document.getElementById('stat-active-drivers');

  // Bail quietly if this page doesn't have the stat cards
  if (!elZones && !elQueue && !elDispatched && !elDrivers) return;

  // Smoothly animate a number from old to new
  function animateNumber(el, from, to) {
    if (!el) return;
    const start = Number(from) || 0;
    const end   = Number(to)   || 0;
    if (start === end) { el.textContent = end; return; }

    const duration = 400;
    const t0 = performance.now();

    function step(t) {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);   // easeOutCubic
      el.textContent = Math.round(start + (end - start) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Fetch + render
  async function loadStats() {
    try {
      const res  = await fetch(API, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load stats');
      }

      const d = json.data || {};

      // Active Zones
      animateNumber(elZones, elZones?.textContent, d.active_zones);
      if (elZonesSub) {
        const t = d.terminals_with_zones || 0;
        elZonesSub.textContent = `across ${t} terminal${t === 1 ? '' : 's'}`;
      }

      // In Queue
      animateNumber(elQueue, elQueue?.textContent, d.in_queue);

      // Dispatched Today
      animateNumber(elDispatched, elDispatched?.textContent, d.dispatched_today);

      // Active Drivers
      animateNumber(elDrivers, elDrivers?.textContent, d.active_drivers);

    } catch (err) {
      console.error('[dashboard-stats] load failed:', err);
      // Leave existing values as-is (don't wipe them out)
    }
  }

  // Initial load
  loadStats();

  // Auto-refresh
  setInterval(loadStats, REFRESH_MS);

  // Refresh whenever the tab becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadStats();
  });
});