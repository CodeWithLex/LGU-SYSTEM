const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const PDFDocument = require('pdfkit');
const ExcelJS    = require('exceljs');

// Admin guard
function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

// ── GET /api/reports/summary ──────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const [{ data: txs, error: txErr }, { data: events, error: evErr }] = await Promise.all([
    supabase.from('transactions').select('type, amount, use_allocation'),
    supabase.from('events').select('allocated_budget')
  ]);

  if (txErr) return res.status(500).json({ error: txErr.message });
  if (evErr) return res.status(500).json({ error: evErr.message });

  const summary = txs.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + Number(tx.amount);
    
    // Track dashboard-impacting expenses (only from general fund pool)
    if (tx.type === 'expense' && !tx.use_allocation) {
      acc.dashboard_expense += Number(tx.amount);
    }

    return acc;
  }, { expense: 0, donation: 0, collection: 0, allocation: 0, transfer: 0, dashboard_expense: 0 });

  let totalReservedEnvelopes = 0;
  (events || []).forEach(e => {
     totalReservedEnvelopes += Number(e.allocated_budget);
  });

  const totalIncome  = summary.allocation + summary.donation + summary.collection;
  const totalExpense = summary.dashboard_expense;
  
  const remainingBalance = totalIncome - totalExpense - totalReservedEnvelopes;

  res.json({
    totalIncome,
    totalExpense,
    remainingBalance,
    breakdown: {
      ...summary,
      reserved_envelopes: totalReservedEnvelopes
    }
  });
});

// ── GET /api/reports/monthly ──────────────────────────────────────────────────
router.get('/monthly', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, transaction_date')
    .order('transaction_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const monthly = {};
  data.forEach(tx => {
    const month = tx.transaction_date.slice(0, 7); // "YYYY-MM"
    if (!monthly[month]) monthly[month] = { income: 0, expense: 0 };
    if (tx.type === 'expense') monthly[month].expense += Number(tx.amount);
    else                       monthly[month].income  += Number(tx.amount);
  });

  res.json(Object.entries(monthly).map(([month, d]) => ({
    month,
    income:    d.income,
    expense:   d.expense,
    remaining: d.income - d.expense
  })));
});

// ── GET /api/reports/events-summary ──────────────────────────────────────────
router.get('/events-summary', async (req, res) => {
  const [{ data: events, error: evtErr }, { data: transactions }] = await Promise.all([
    supabase.from('events').select('id, event_name, allocated_budget, remaining_budget, status').order('created_at', { ascending: false }),
    supabase.from('transactions').select('event_id, type, amount')
  ]);

  if (evtErr) return res.status(500).json({ error: evtErr.message });

  const txStats = {};
  if (transactions) {
    transactions.forEach(tx => {
      if (!txStats[tx.event_id]) txStats[tx.event_id] = { income: 0, expenses: 0, alloc_expenses: 0 };
      if (tx.type === 'expense') {
        txStats[tx.event_id].expenses += Number(tx.amount);
        if (tx.use_allocation) txStats[tx.event_id].alloc_expenses += Number(tx.amount);
      }
      else txStats[tx.event_id].income += Number(tx.amount);
    });
  }

  res.json(events.map(ev => {
    const stats = txStats[ev.id] || { income: 0, expenses: 0, alloc_expenses: 0 };
    return {
      ...ev,
      // Event remaining strictly reflects original allocation minus explicit event costs
      computed_remaining: Number(ev.allocated_budget) - stats.alloc_expenses
    };
  }));
});

// ── GET /api/reports/pdf/:eventId ─────────────────────────────────────────────
router.get('/pdf/:eventId', requireAdmin, async (req, res) => {
  const { eventId } = req.params;

  const [{ data: event, error: evtErr }, { data: transactions, error: txErr }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('transactions').select('*').eq('event_id', eventId).order('transaction_date', { ascending: true })
    ]);

  if (evtErr) return res.status(404).json({ error: 'Event not found.' });
  if (txErr)  return res.status(500).json({ error: txErr.message });

  // ── Build PDF ──
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="LGU-Report-${event.event_name.replace(/\s+/g,'-')}.pdf"`);
  doc.pipe(res);

  const primary   = '#1a1f35';
  const accent    = '#6384ff';
  const textMuted = '#64748b';
  const pageWidth = doc.page.width - 100;

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill(primary);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
     .text('COE Financial Transparency System', 50, 22);
  doc.font('Helvetica').fontSize(10).fillColor('#a5b4fc')
     .text('College of Engineering — Cor Jesu College', 50, 46);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
     .text('LIQUIDATION REPORT', 50, 64);

  doc.moveDown(3.2);

  // Event info card
  const infoY = doc.y;
  doc.roundedRect(50, infoY, pageWidth, 100, 8).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor(primary).font('Helvetica-Bold').fontSize(14)
     .text(event.event_name, 66, infoY + 14, { width: pageWidth - 32 });

  const fmt = n => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' }) : '—';

  let pdfAllExp = 0, pdfAllocExp = 0, pdfInc = 0;
  (transactions || []).forEach(tx => {
    if (tx.type === 'expense') {
       pdfAllExp += Number(tx.amount);
       if (tx.use_allocation) pdfAllocExp += Number(tx.amount);
    }
    else pdfInc += Number(tx.amount);
  });
  const trueRemaining = Number(event.allocated_budget) - pdfAllocExp;

  doc.font('Helvetica').fontSize(9.5).fillColor(textMuted);
  doc.text(`Event Date: ${fmtDate(event.event_date)}`,        66, infoY + 36);
  doc.text(`Status: ${(event.status || 'N/A').toUpperCase()}`, 66, infoY + 52);
  doc.text(`Allocated Budget: ${fmt(event.allocated_budget)}`,  66, infoY + 68);
  doc.text(`Remaining Budget: ${fmt(trueRemaining)}`, 300, infoY + 68);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}`, 66, infoY + 84);

  doc.moveDown(5.5);

  // Section heading
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(11).text('TRANSACTION LEDGER', 50);
  doc.moveDown(0.4);

  // Table header
  const cols  = { date: 50, type: 130, desc: 215, amount: 430, receipt: 500 };
  const thY   = doc.y;
  doc.rect(50, thY, pageWidth, 22).fill(primary);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
  doc.text('DATE',        cols.date,    thY + 7, { width: 75 });
  doc.text('TYPE',        cols.type,    thY + 7, { width: 80 });
  doc.text('DESCRIPTION', cols.desc,   thY + 7, { width: 210 });
  doc.text('AMOUNT',      cols.amount,  thY + 7, { width: 65, align: 'right' });

  // Table rows
  let rowY   = thY + 22;
  let totalExpense = 0, totalIncome = 0;

  (transactions || []).forEach((tx, i) => {
    const bg   = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const rowH = 20;
    doc.rect(50, rowY, pageWidth, rowH).fill(bg);

    const isExpense = tx.type === 'expense';
    const amtColor  = isExpense ? '#ef4444' : '#10b981';
    if (isExpense) totalExpense += Number(tx.amount);
    else           totalIncome  += Number(tx.amount);

    doc.fillColor(textMuted).font('Helvetica').fontSize(8.5);
    doc.text(fmtDate(tx.transaction_date), cols.date,   rowY + 6, { width: 75 });
    doc.text(tx.type.toUpperCase(),        cols.type,   rowY + 6, { width: 80 });
    doc.text(tx.description || '—',        cols.desc,   rowY + 6, { width: 210 });
    doc.fillColor(amtColor).font('Helvetica-Bold')
       .text(fmt(tx.amount),              cols.amount, rowY + 6, { width: 65, align: 'right' });

    rowY += rowH;

    // New page if needed
    if (rowY > doc.page.height - 120) {
      doc.addPage();
      rowY = 50;
    }
  });

  // Summary footer
  const sumY = rowY + 12;
  doc.rect(50, sumY, pageWidth, 50).fillAndStroke('#f0f4ff', accent);
  doc.fillColor(primary).font('Helvetica-Bold').fontSize(9.5);
  doc.text(`Total Income:   ${fmt(totalIncome)}`,   66,  sumY + 8);
  doc.text(`Total Expenses: ${fmt(totalExpense)}`,   66,  sumY + 24);
  doc.fillColor(accent).fontSize(11)
     .text(`Net Balance:    ${fmt(totalIncome - totalExpense)}`, 280, sumY + 18);

  // Footer line
  doc.moveDown(4);
  doc.fillColor(textMuted).font('Helvetica').fontSize(8)
     .text('This document is computer-generated from the COE Financial Transparency System. | Cor Jesu College — Digos City', 50, doc.page.height - 35, { align: 'center', width: pageWidth });

  doc.end();
});

// ── GET /api/reports/excel/:eventId ───────────────────────────────────────────
router.get('/excel/:eventId', requireAdmin, async (req, res) => {
  const { eventId } = req.params;

  const [{ data: event, error: evtErr }, { data: transactions, error: txErr }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('transactions').select('*').eq('event_id', eventId).order('transaction_date', { ascending: true })
    ]);

  if (evtErr) return res.status(404).json({ error: 'Event not found.' });
  if (txErr)  return res.status(500).json({ error: txErr.message });

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'COE Financial Transparency System';
  workbook.created  = new Date();

  const sheet = workbook.addWorksheet('Liquidation Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  // ── Column widths ──
  sheet.columns = [
    { key: 'date',    width: 18, header: 'Date' },
    { key: 'type',    width: 14, header: 'Type' },
    { key: 'desc',    width: 40, header: 'Description' },
    { key: 'donor',   width: 20, header: 'Donor / Note' },
    { key: 'amount',  width: 18, header: 'Amount (₱)' },
    { key: 'receipt', width: 40, header: 'Receipt URL' },
  ];

  // ── Title block ──
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'COE FINANCIAL TRANSPARENCY SYSTEM — LIQUIDATION REPORT';
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1f35' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:F2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'College of Engineering — Cor Jesu College, Digos City';
  subCell.font  = { italic: true, size: 10, color: { argb: 'FF64748b' } };
  subCell.alignment = { horizontal: 'center' };

  // ── Event Info ──
  const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' }) : '—';

  let xlAllExp = 0, xlAllocExp = 0, xlInc = 0;
  (transactions || []).forEach(tx => {
    if (tx.type === 'expense') {
       xlAllExp += Number(tx.amount);
       if (tx.use_allocation) xlAllocExp += Number(tx.amount);
    }
    else xlInc += Number(tx.amount);
  });
  const trueRem = Number(event.allocated_budget) - xlAllocExp;

  const infoRows = [
    ['Event Name:', event.event_name, '', 'Event Date:', fmtDate(event.event_date), ''],
    ['Status:',    (event.status || '').toUpperCase(), '', 'Allocated Budget:', `₱${fmt(event.allocated_budget)}`, ''],
    ['Generated:', new Date().toLocaleString('en-PH'), '', 'Remaining Budget:', `₱${fmt(trueRem)}`, ''],
  ];

  infoRows.forEach((row, i) => {
    const r = sheet.addRow(row);
    r.getCell(1).font = { bold: true, color: { argb: 'FF64748b' } };
    r.getCell(4).font = { bold: true, color: { argb: 'FF64748b' } };
    r.getCell(2).font = { bold: true };
    r.getCell(5).font = { bold: true };
  });

  sheet.addRow([]); // spacer

  // ── Table header ──
  const headerRow = sheet.addRow(['Date', 'Type', 'Description', 'Donor / Note', 'Amount (₱)', 'Receipt URL']);
  headerRow.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1f35' } };
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FF6384ff' } } };
  });
  headerRow.height = 22;

  // ── Data rows ──
  let totalIncome = 0, totalExpense = 0;
  (transactions || []).forEach((tx, i) => {
    const isExpense = tx.type === 'expense';
    if (isExpense) totalExpense += Number(tx.amount);
    else           totalIncome  += Number(tx.amount);

    const row = sheet.addRow([
      fmtDate(tx.transaction_date),
      tx.type.toUpperCase(),
      tx.description || '',
      tx.donor_name || '',
      Number(tx.amount),
      tx.receipt_url || '',
    ]);

    // Amount column styling
    row.getCell(5).numFmt = '₱#,##0.00';
    row.getCell(5).font   = { bold: true, color: { argb: isExpense ? 'FFEF4444' : 'FF10B981' } };

    // Alternating row background
    if (i % 2 !== 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }

    // Receipt hyperlink
    if (tx.receipt_url) {
      row.getCell(6).value = { text: 'View Receipt', hyperlink: tx.receipt_url };
      row.getCell(6).font  = { color: { argb: 'FF6384ff' }, underline: true };
    }
  });

  // ── Summary row ──
  sheet.addRow([]);
  const sumRow = sheet.addRow(['', '', '', 'Total Income:', totalIncome, '']);
  sumRow.getCell(4).font = { bold: true };
  sumRow.getCell(5).numFmt = '₱#,##0.00';
  sumRow.getCell(5).font = { bold: true, color: { argb: 'FF10B981' } };

  const expRow = sheet.addRow(['', '', '', 'Total Expenses:', totalExpense, '']);
  expRow.getCell(4).font = { bold: true };
  expRow.getCell(5).numFmt = '₱#,##0.00';
  expRow.getCell(5).font = { bold: true, color: { argb: 'FFEF4444' } };

  const balRow = sheet.addRow(['', '', '', 'Net Balance:', totalIncome - totalExpense, '']);
  balRow.getCell(4).font = { bold: true, size: 12, color: { argb: 'FF1a1f35' } };
  balRow.getCell(5).numFmt = '₱#,##0.00';
  balRow.getCell(5).font = { bold: true, size: 12, color: { argb: 'FF6384ff' } };
  balRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };

  // Stream response
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="LGU-Report-${event.event_name.replace(/\s+/g,'-')}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
