// ==================================================
// DEPARTURE LOGS
// Fetches /getDepartureLogs and renders the table
// Loads only after a terminal is selected.
// Defaults to TODAY's logs. Past logs show only when
// a specific date is picked from the date input.
// ==================================================
document.addEventListener('DOMContentLoaded', () => {

  const API           = '/getDepartureLogs';
  const TERMINALS_API = '/terminals';

  const filterSelect = document.getElementById('terminal_id');
  const dateInput    = document.getElementById('departure_date');
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

  // YYYY-MM-DD for today in local time
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ==================================================
  // Empty-state helpers
  // ==================================================
  function showPrompt(message) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.querySelector('p').textContent = message;
    totalCount.textContent = '0 total departures';
  }

  // ==================================================
  // Render
  // ==================================================
  function render(rows, dateLabel) {
    tbody.innerHTML = '';

    if (rows.length === 0) {
      emptyState.style.display = 'block';
      emptyState.querySelector('p').textContent =
        dateLabel
          ? `No departure logs for ${dateLabel}.`
          : 'No departure logs for this selection.';
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

        function showPrompt(message) {
          tbody.innerHTML = '';
          emptyState.style.display = 'block';   // ← this overrides your CSS entirely
          emptyState.querySelector('p').textContent = message;
          totalCount.textContent = '0 total departures';
      }

  // ==================================================
  // Fetch logs
  // ==================================================
  async function loadLogs() {
    const terminalId = filterSelect?.value || null;

    // If the input is empty, use today. If it has a value, use that.
    const selectedDate = dateInput?.value || todayStr();
    const isToday = selectedDate === todayStr();

    // Only load when a terminal is selected.
    if (!terminalId) {
      showPrompt();
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('terminal_id', terminalId);
      params.set('date', selectedDate);   // always send a date now

      const res = await fetch(`${API}?${params.toString()}`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load logs');
      }

      const dateLabel = isToday
        ? 'today'
        : fmtDate(selectedDate);

      render(json.data || [], dateLabel);
    } catch (err) {
      console.error('[departureLogs] load failed:', err);
      emptyState.style.display = 'block';
      emptyState.querySelector('p').textContent = 'Failed to load departure logs.';
      totalCount.textContent = '—';
    }
  }

  // ==================================================
  // Load terminals into the filter dropdown
  // ==================================================
  async function loadTerminalFilter() {
    if (!filterSelect) return;

    try {
      const res = await fetch(TERMINALS_API, {
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
    filterSelect.addEventListener('change', loadLogs);
  }

  if (dateInput) {
    dateInput.addEventListener('change', loadLogs);
    // If the user clears the date, snap back to today.
    dateInput.addEventListener('blur', () => {
      if (!dateInput.value) dateInput.value = todayStr();
    });
  }

  // ==================================================
  // Init
  // ==================================================
  (async () => {
    // Prefill date with today so "today" is the default view
    if (dateInput) dateInput.value = todayStr();

    await loadTerminalFilter();
    showPrompt('Select a terminal to view departure logs.');
  })();

});