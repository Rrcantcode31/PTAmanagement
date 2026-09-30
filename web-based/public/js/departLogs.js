// ==================================================
// DEPARTURE LOGS
// Fetches /getDepartureLogs and renders the table
// ==================================================
document.addEventListener('DOMContentLoaded', () => {

  const API          = '/getDepartureLogs';
  const TERMINALS_API = '/terminals';

  const filterSelect = document.getElementById('terminal_id'); // or #terminal-filter
  const tbody        = document.getElementById('departure-list');
  const emptyState   = document.getElementById('departure-empty');
  const totalCount   = document.getElementById('departure-total');

  if (!tbody) return;   // not on this page

  // ==================================================
  // Helpers
  // ==================================================
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', {
      month: 'short', day: '2-digit', year: 'numeric'
    });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  function fullName(row) {
    return [row.first_name, row.middle_name, row.last_name]
      .filter(Boolean).join(' ') || '—';
  }

  function routeLabel(row) {
    if (row.from_terminal && row.to_terminal) {
      return `${row.from_terminal} → ${row.to_terminal}`;
    }
    return row.zone_name || '—';
  }

  // ==================================================
  // Render
  // ==================================================
  function render(rows) {
    tbody.innerHTML = '';

    if (rows.length === 0) {
      emptyState.style.display = 'block';
      totalCount.textContent = '0 total departures';
      return;
    }

    emptyState.style.display = 'none';
    totalCount.textContent = `${rows.length} total departure${rows.length === 1 ? '' : 's'}`;

    rows.forEach(function (r) {
      const tr = document.createElement('tr');

      const typeClass = (r.approval_type || 'system').toLowerCase();

      tr.innerHTML = `
        <td class="col-id">#${r.departure_id}</td>
        <td class="col-plate">${r.plate_number || '—'}</td>
        <td class="col-driver">${fullName(r)}</td>
        <td class="col-route">${routeLabel(r)}</td>
        <td class="col-type">
          <span class="status-badge ${typeClass}">${r.approval_type || 'system'}</span>
        </td>
        <td class="col-date">
          <div>${fmtDate(r.departure_time)}</div>
          <div class="time-sub">${fmtTime(r.departure_time)}</div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==================================================
  // Fetch logs
  // ==================================================
  async function loadLogs(terminalId) {
    try {
      const url = terminalId
        ? `${API}?terminal_id=${encodeURIComponent(terminalId)}`
        : API;

      const res  = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load logs');
      }

      render(json.data || []);
    } catch (err) {
      console.error('[departureLogs] load failed:', err);
      emptyState.style.display = 'block';
      emptyState.querySelector('p').textContent = 'Failed to load departure logs.';
    }
  }

  // ==================================================
  // Load terminals into the filter dropdown
  // ==================================================
  async function loadTerminalFilter() {
    if (!filterSelect) return;

    try {
      const res  = await fetch(TERMINALS_API, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();

      (data.terminals || []).forEach(function (t) {
        const opt = document.createElement('option');
        opt.value = t.terminal_id;
        opt.textContent = t.terminal_name;
        filterSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('[departureLogs] terminals failed:', err);
    }
  }

  // ==================================================
  // Events
  // ==================================================
  if (filterSelect) {
    filterSelect.addEventListener('change', function () {
      loadLogs(this.value || null);
    });
  }

  // ==================================================
  // Init
  // ==================================================
  loadTerminalFilter();
  loadLogs(null);
});