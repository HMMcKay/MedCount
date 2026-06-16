import { db, addDose, getDosesForMedication, getAllDoses, getMedications } from './db.js';

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function recordTake(med) {
  const before = med.quantity;
  const after  = Math.max(0, before - (med.quantityPerDose || 1));
  await addDose(med.id, 'take', before, after);
  return after;
}

export async function recordAddOne(med) {
  const before = med.quantity;
  const after  = before + 1;
  await addDose(med.id, 'add', before, after);
  return after;
}

export async function recordRefill(med, newQty) {
  await addDose(med.id, 'refill', med.quantity, newQty, 'Prescription refilled');
  return newQty;
}

export async function getHistory(medicationId, { limit = 200, since = 0 } = {}) {
  const doses = await getDosesForMedication(medicationId, limit);
  return since ? doses.filter(d => d.timestamp >= since) : doses;
}

export async function exportAllData() {
  const [medications, doses] = await Promise.all([getMedications(), getAllDoses()]);
  const payload = JSON.stringify({ exportDate: new Date().toISOString(), version: '1', medications, doses }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `medcount-export-${new Date().toISOString().split('T')[0]}.json`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export async function importData(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed.medications)) throw new Error('Invalid export file');
  await db.transaction('rw', db.medications, db.doses, async () => {
    await db.medications.clear();
    await db.doses.clear();
    for (const m of parsed.medications) await db.medications.put(m);
    for (const d of (parsed.doses || [])) await db.doses.put(d);
  });
}

export async function printHistory(medicationId, medName) {
  const doses = await getDosesForMedication(medicationId, 1000);
  const rows = doses.map(d => {
    const dt     = new Date(d.timestamp);
    const label  = { take: 'Took dose', add: 'Added back', refill: 'Refill', edit: 'Edited' }[d.action] ?? d.action;
    const change = d.quantityAfter - d.quantityBefore;
    return `<tr>
      <td>${dt.toLocaleDateString()}</td>
      <td>${dt.toLocaleTimeString()}</td>
      <td>${label}</td>
      <td style="color:${change < 0 ? '#B3261E' : '#386A1F'}">${change > 0 ? '+' : ''}${change}</td>
      <td>${d.quantityAfter}</td>
      <td>${esc(d.note) || ''}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Dose History – ${esc(medName)}</title>
    <style>
      body{font-family:Roboto,Arial,sans-serif;padding:24px;color:#191C1B}
      h1{color:#006B5E;margin:0 0 4px}
      p{margin:0 0 16px;color:#6F7977;font-size:14px}
      table{width:100%;border-collapse:collapse}
      th{background:#006B5E;color:#fff;padding:8px 12px;text-align:left;font-weight:500}
      td{padding:8px 12px;border-bottom:1px solid #E2E9E7;font-size:14px}
      tr:nth-child(even) td{background:#F4FAF8}
      .print-btn{margin-bottom:16px;padding:8px 20px;background:#006B5E;color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:14px}
      @media print{.print-btn{display:none}}
    </style>
  </head><body>
    <button class="print-btn" onclick="window.print()">Print</button>
    <h1>Dose History</h1>
    <p>${esc(medName)} &nbsp;·&nbsp; Generated ${new Date().toLocaleString()}</p>
    <table>
      <thead><tr><th>Date</th><th>Time</th><th>Action</th><th>Change</th><th>Remaining</th><th>Note</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#6F7977">No history recorded</td></tr>'}</tbody>
    </table>
  </body></html>`);
  win.document.close();
}
