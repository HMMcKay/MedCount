import { getAllDoses, getDosesToday } from './db.js';

function esc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
}

function estimateDosesPerDay(med) {
  if (med.reminders?.doseAlerts?.length) {
    return med.reminders.doseAlerts.reduce((s, a) => s + (a.days?.length ?? 7) / 7, 0);
  }
  const sig = (med.sig || '').toLowerCase();
  if (sig.includes('four') || sig.includes('qid'))  return 4;
  if (sig.includes('three') || sig.includes('tid')) return 3;
  if (sig.includes('twice') || sig.includes('bid')) return 2;
  if (sig.includes('weekly'))                        return 1 / 7;
  if (sig.includes('every other'))                   return 0.5;
  if (med.daysSupply && med.fillQuantity && med.quantityPerDose) {
    const q = med.fillQuantity / med.daysSupply / med.quantityPerDose;
    if (q > 0 && q <= 6) return q;
  }
  return 1;
}

export async function renderStats(container, meds) {
  if (!container) return;
  container.innerHTML = '<div class="stats-loading"><md-circular-progress indeterminate></md-circular-progress></div>';

  const [allDoses, todayDoses] = await Promise.all([getAllDoses(), getDosesToday()]);
  const now = new Date();

  // ── Summary tiles ──────────────────────────────────────────────────────────
  const takesToday = todayDoses.filter(d => d.action === 'take').length;
  const lowStock   = meds.filter(m => (m.lowStockThreshold > 0) && (m.quantity ?? 0) <= m.lowStockThreshold).length;
  const refillSoon = meds.filter(m => {
    if (!m.refillDate) return false;
    const d = Math.ceil((new Date(m.refillDate) - now) / 86_400_000);
    return d >= 0 && d <= 7;
  }).length;
  const expired = meds.filter(m => m.expirationDate && new Date(m.expirationDate) < now).length;

  // ── 7-day chart ────────────────────────────────────────────────────────────
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const dosesByDay = days7.map(dk => ({
    date: dk,
    count: allDoses.filter(d => d.action === 'take' &&
      new Date(d.timestamp).toISOString().split('T')[0] === dk).length,
  }));

  // ── Per-med adherence ──────────────────────────────────────────────────────
  const medAdherence = [];
  for (const med of meds) {
    if (!med.fillDate) continue;
    const fillDate  = new Date(med.fillDate + 'T12:00:00');
    const daysSince = Math.max(0, Math.floor((now - fillDate) / 86_400_000));
    const dpd       = estimateDosesPerDay(med);
    const expected  = Math.round(daysSince * dpd);
    if (expected === 0) continue;
    const taken = allDoses.filter(d => d.medicationId === med.id && d.action === 'take').length;
    const pct   = Math.min(100, Math.round((taken / expected) * 100));
    medAdherence.push({ name: med.name, color: med.color ?? '#006B5E', pct, taken, expected });
  }
  medAdherence.sort((a, b) => a.pct - b.pct);

  const overallAdh = medAdherence.length
    ? Math.round(medAdherence.reduce((s, m) => s + m.pct, 0) / medAdherence.length)
    : null;

  // ── Total streak ──────────────────────────────────────────────────────────
  let streak = 0;
  if (allDoses.length > 0) {
    const check = new Date(now);
    check.setHours(23, 59, 59, 999);
    while (true) {
      const dk = check.toISOString().split('T')[0];
      const hasDose = allDoses.some(d => d.action === 'take' && new Date(d.timestamp).toISOString().split('T')[0] === dk);
      if (!hasDose) break;
      streak++;
      check.setDate(check.getDate() - 1);
    }
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  container.innerHTML = `
  <div class="stats-content">

    <div class="stat-tiles">
      <div class="stat-tile">
        <md-icon class="stat-tile-icon">medication</md-icon>
        <div class="stat-tile-value">${meds.length}</div>
        <div class="stat-tile-label">Medications</div>
      </div>
      <div class="stat-tile ${takesToday > 0 ? 'stat-tile-good' : ''}">
        <md-icon class="stat-tile-icon">check_circle</md-icon>
        <div class="stat-tile-value ${takesToday > 0 ? 'stat-val-good' : ''}">${takesToday}</div>
        <div class="stat-tile-label">Taken today</div>
      </div>
      <div class="stat-tile ${lowStock > 0 ? 'stat-tile-warn' : ''}">
        <md-icon class="stat-tile-icon">inventory</md-icon>
        <div class="stat-tile-value ${lowStock > 0 ? 'stat-val-warn' : ''}">${lowStock}</div>
        <div class="stat-tile-label">Low stock</div>
      </div>
      <div class="stat-tile ${refillSoon > 0 ? 'stat-tile-warn' : ''}">
        <md-icon class="stat-tile-icon">local_pharmacy</md-icon>
        <div class="stat-tile-value ${refillSoon > 0 ? 'stat-val-warn' : ''}">${refillSoon}</div>
        <div class="stat-tile-label">Refill soon</div>
      </div>
    </div>

    ${streak > 1 ? `
    <div class="stat-card streak-card">
      <div class="streak-flame">🔥</div>
      <div class="streak-text">
        <div class="streak-num">${streak}-day streak</div>
        <div class="streak-sub">Consecutive days with at least one dose logged</div>
      </div>
    </div>` : ''}

    ${overallAdh !== null ? `
    <div class="stat-card">
      <h3 class="stat-card-title">Overall Adherence</h3>
      <div class="adh-ring-row">
        <div class="adh-ring-wrap">
          ${buildDonutChart(overallAdh)}
          <div class="adh-ring-center">
            <div class="adh-pct-big" style="color:${adhColor(overallAdh)}">${overallAdh}%</div>
            <div class="adh-pct-lbl">adherence</div>
          </div>
        </div>
        <div class="adh-ring-legend">
          <div class="adh-legend-row"><span class="adh-legend-dot" style="background:#386A1F"></span>≥ 80% On track</div>
          <div class="adh-legend-row"><span class="adh-legend-dot" style="background:#C25B00"></span>≥ 60% Needs attention</div>
          <div class="adh-legend-row"><span class="adh-legend-dot" style="background:#B3261E"></span>&lt; 60% Low adherence</div>
        </div>
      </div>
    </div>` : ''}

    <div class="stat-card">
      <h3 class="stat-card-title">7-Day Activity</h3>
      <div class="chart-scroll">
        ${build7DayChart(dosesByDay)}
      </div>
    </div>

    ${medAdherence.length > 0 ? `
    <div class="stat-card">
      <h3 class="stat-card-title">Per-Medication Adherence</h3>
      <div class="med-adh-list">
        ${medAdherence.map(m => {
          const c = adhColor(m.pct);
          return `<div class="med-adh-row">
            <div class="med-adh-name">${esc(m.name)}</div>
            <div class="med-adh-track">
              <div class="med-adh-bar" style="width:${m.pct}%;background:${c}"></div>
            </div>
            <div class="med-adh-pct" style="color:${c}">${m.pct}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${expired > 0 ? `
    <div class="stat-card stat-card-error">
      <div class="stat-alert-row">
        <md-icon>warning</md-icon>
        <span>${expired} medication${expired !== 1 ? 's' : ''} expired — check your medications</span>
      </div>
    </div>` : ''}

  </div>`;
}

function adhColor(pct) {
  return pct >= 80 ? '#386A1F' : pct >= 60 ? '#C25B00' : '#B3261E';
}

function buildDonutChart(pct) {
  const r    = 46;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  const c    = adhColor(pct);
  return `<svg class="adh-donut" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--md-sys-color-outline-variant)" stroke-width="10"/>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="${c}" stroke-width="10"
      stroke-dasharray="${fill.toFixed(2)} ${circ.toFixed(2)}"
      stroke-dashoffset="${(circ / 4).toFixed(2)}"
      stroke-linecap="round"/>
  </svg>`;
}

function build7DayChart(days) {
  const max  = Math.max(1, ...days.map(d => d.count));
  const W    = 280;
  const H    = 100;
  const padX = 8;
  const padY = 12;
  const barW = Math.floor((W - padX * 2 - (days.length - 1) * 6) / days.length);
  const gap  = Math.floor((W - padX * 2 - barW * days.length) / (days.length - 1));
  const today = new Date().toISOString().split('T')[0];

  const bars = days.map((d, i) => {
    const barH  = d.count === 0 ? 4 : Math.max(6, Math.round((d.count / max) * (H - padY * 2)));
    const x     = padX + i * (barW + gap);
    const y     = padY + (H - padY * 2) - barH;
    const isToday = d.date === today;
    const fill  = isToday ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-primary-container)';
    const dt    = new Date(d.date + 'T12:00:00');
    const dayLbl = dt.toLocaleDateString(undefined, { weekday: 'short' });
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${fill}" opacity="${d.count === 0 ? '0.4' : '1'}"/>
      ${d.count > 0 ? `<text x="${x + barW / 2}" y="${y - 3}" text-anchor="middle" font-size="9" font-weight="600" fill="var(--md-sys-color-on-surface)" font-family="Roboto,sans-serif">${d.count}</text>` : ''}
      <text x="${x + barW / 2}" y="${H + 4}" text-anchor="middle" font-size="9" fill="${isToday ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)'}" font-weight="${isToday ? '700' : '400'}" font-family="Roboto,sans-serif">${dayLbl}</text>
    </g>`;
  }).join('');

  return `<svg class="bar-chart" viewBox="0 0 ${W} ${H + 14}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;overflow:visible">${bars}</svg>`;
}
