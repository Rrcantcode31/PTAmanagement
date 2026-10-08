document.addEventListener('DOMContentLoaded', () => {
  const API = '/getDepartureLogs';
  const MAX_DAYS = 62;                       // safety limit for the range
  const HDR_KEY  = 'departureReportHeader';

  const $ = (id) => document.getElementById(id);
  const modal      = $('reportModal');
  const openBtn    = $('openReportBtn');
  if (!openBtn) return;

  const terminalSel = $('terminal_id');
  const fromInput   = $('reportFrom');
  const toInput     = $('reportTo');
  const incHeader   = $('includeHeader');
  const hdrFields   = $('headerFields');
  const hdrOrg      = $('hdrOrg');
  const hdrTitle    = $('hdrTitle');
  const hdrSub      = $('hdrSubtitle');
  const statusEl    = $('reportStatus');
  const genBtn      = $('generateReportBtn');

  // ---------- helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => toStr(new Date());

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
  const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fullName = (r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || '—';
  const routeLabel = (r) => (r.from_terminal && r.to_terminal)
    ? `${r.from_terminal} -> ${r.to_terminal}` : (r.zone_name || '—');

  function setStatus(msg, ok = false) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('ok', ok);
  }

  // ---------- saved header ----------
  function loadHeader() {
    try {
      const h = JSON.parse(localStorage.getItem(HDR_KEY) || '{}');
      hdrOrg.value   = h.org      || '';
      hdrTitle.value = h.title    || 'Departure Logs Report';
      hdrSub.value   = h.subtitle || '';
      incHeader.checked = h.include !== false;
    } catch { /* ignore */ }
    toggleHeaderFields();
  }
  function saveHeader() {
    localStorage.setItem(HDR_KEY, JSON.stringify({
      org: hdrOrg.value.trim(),
      title: hdrTitle.value.trim(),
      subtitle: hdrSub.value.trim(),
      include: incHeader.checked
    }));
  }
  function toggleHeaderFields() {
    hdrFields.classList.toggle('disabled', !incHeader.checked);
  }
  incHeader.addEventListener('change', toggleHeaderFields);

  // ---------- modal ----------
  function openModal() {
    if (!terminalSel.value) {
      alert('Please select a terminal first.');
      return;
    }
    $('reportTerminalName').textContent =
      terminalSel.options[terminalSel.selectedIndex].textContent;
    const t = todayStr();
    if (!fromInput.value) fromInput.value = t;
    if (!toInput.value)   toInput.value   = t;
    loadHeader();
    setStatus('');
    modal.style.display = 'flex';
  }
  function closeModal() { modal.style.display = 'none'; }

  openBtn.addEventListener('click', openModal);
  $('closeReportBtn').addEventListener('click', closeModal);
  $('cancelReportBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // ---------- fetch data for the range ----------
  // Uses your existing endpoint, one request per day.
  async function fetchDay(terminalId, date) {
    const params = new URLSearchParams({ terminal_id: terminalId, date });
    const res = await fetch(`${API}?${params}`, {
      credentials: 'include', headers: { Accept: 'application/json' }
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load logs');
    return json.data || [];
  }

  async function fetchRange(terminalId, from, to) {
    const days = [];
    for (let d = new Date(from + 'T00:00:00'); toStr(d) <= to; d.setDate(d.getDate() + 1)) {
      days.push(toStr(d));
    }
    if (days.length > MAX_DAYS) throw new Error(`Please pick a range of ${MAX_DAYS} days or less.`);

    const all = [];
    for (let i = 0; i < days.length; i += 5) {          // 5 requests at a time
      const chunk = await Promise.all(days.slice(i, i + 5).map(d => fetchDay(terminalId, d)));
      chunk.forEach(rows => all.push(...rows));
    }
    all.sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
    return all;
  }

  // ---------- build files ----------
  const COLS = ['Log ID', 'Plate', 'Driver', 'Route', 'Approved By', 'Departed'];
  const toRow = (r) => [
    `#${r.departure_id}`,
    r.plate_number || '—',
    fullName(r),
    routeLabel(r),
    (r.approval_type || 'system').toUpperCase(),
    `${fmtDate(r.departure_time)} ${fmtTime(r.departure_time)}`
  ];

  function periodLabel(from, to) {
    return from === to ? fmtDate(from + 'T00:00:00')
      : `${fmtDate(from + 'T00:00:00')} - ${fmtDate(to + 'T00:00:00')}`;
  }

  function buildPDF(rows, meta) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 40;

    if (meta.header) {
      doc.setFont('helvetica', 'bold');
      if (meta.header.org) { doc.setFontSize(18); doc.text(meta.header.org, pageW / 2, y, { align: 'center' }); y += 22; }
      if (meta.header.title) { doc.setFontSize(14); doc.text(meta.header.title, pageW / 2, y, { align: 'center' }); y += 18; }
      doc.setFont('helvetica', 'normal');
      if (meta.header.subtitle) { doc.setFontSize(10); doc.text(meta.header.subtitle, pageW / 2, y, { align: 'center' }); y += 14; }
      doc.setDrawColor(67, 172, 161);
      doc.line(40, y, pageW - 40, y);
      y += 18;
    }

    doc.setFontSize(10);
    doc.text(`Terminal: ${meta.terminal}`, 40, y);
    doc.text(`Period: ${meta.period}`, 40, y + 14);
    doc.text(`Total departures: ${rows.length}`, pageW - 40, y, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleString('en-PH')}`, pageW - 40, y + 14, { align: 'right' });

    doc.autoTable({
      startY: y + 28,
      head: [COLS],
      body: rows.map(toRow),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [67, 172, 161] },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW / 2,
          doc.internal.pageSize.getHeight() - 15, { align: 'center' });
      }
    });

    return doc.output('blob');
  }

  async function buildDOCX(rows, meta) {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            WidthType, AlignmentType, BorderStyle, PageOrientation } = window.docx;

    const children = [];
    const center = (text, size, bold) => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text, size, bold })]
    });

    if (meta.header) {
      if (meta.header.org)      children.push(center(meta.header.org, 36, true));
      if (meta.header.title)    children.push(center(meta.header.title, 28, true));
      if (meta.header.subtitle) children.push(center(meta.header.subtitle, 20, false));
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '43ACA1' } },
        spacing: { after: 200 }
      }));
    }

    children.push(
      new Paragraph({ children: [new TextRun({ text: `Terminal: ${meta.terminal}`, size: 20 })] }),
      new Paragraph({ children: [new TextRun({ text: `Period: ${meta.period}`, size: 20 })] }),
      new Paragraph({ children: [new TextRun({ text: `Total departures: ${rows.length}`, size: 20 })] }),
      new Paragraph({ spacing: { after: 200 },
        children: [new TextRun({ text: `Generated: ${new Date().toLocaleString('en-PH')}`, size: 20 })] })
    );

    const cell = (text, head = false) => new TableCell({
      shading: head ? { fill: '43ACA1' } : undefined,
      children: [new Paragraph({
        children: [new TextRun({ text: String(text), size: 18, bold: head, color: head ? 'FFFFFF' : '000000' })]
      })]
    });

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: COLS.map(c => cell(c, true)) }),
        ...rows.map(r => new TableRow({ children: toRow(r).map(v => cell(v)) }))
      ]
    }));

    const doc = new Document({
      sections: [{
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children
      }]
    });
    return Packer.toBlob(doc);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- generate ----------
  genBtn.addEventListener('click', async () => {
    const from = fromInput.value;
    const to   = toInput.value;
    const format = document.querySelector('input[name="reportFormat"]:checked').value;
    const terminalId = terminalSel.value;
    const terminalName = terminalSel.options[terminalSel.selectedIndex].textContent;

    if (!from || !to)  return setStatus('Please pick both dates.');
    if (from > to)     return setStatus('"From" date must be before "To" date.');

    saveHeader();
    genBtn.disabled = true;
    setStatus('Collecting data…', true);

    try {
      const rows = await fetchRange(terminalId, from, to);
      if (rows.length === 0) {
        setStatus('No departure logs found in that date range.');
        return;
      }

      const meta = {
        terminal: terminalName,
        period: periodLabel(from, to),
        header: incHeader.checked ? {
          org: hdrOrg.value.trim(),
          title: hdrTitle.value.trim(),
          subtitle: hdrSub.value.trim()
        } : null
      };

      setStatus('Building file…', true);
      const blob = format === 'pdf' ? buildPDF(rows, meta) : await buildDOCX(rows, meta);
      const safeTerminal = terminalName.replace(/[^a-z0-9]+/gi, '_');
      download(blob, `departure_report_${safeTerminal}_${from}_to_${to}.${format}`);

      setStatus(`Done. ${rows.length} record(s) exported.`, true);
    } catch (err) {
      console.error('[departReport]', err);
      setStatus(err.message || 'Failed to generate report.');
    } finally {
      genBtn.disabled = false;
    }
  });
});