import { getDosesToday } from './db.js';

function esc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
}

export async function renderToday(container, meds, onTake) {
  if (!container) return;

  const now        = new Date();
  const dayOfWeek  = now.getDay();
  const todayDoses = await getDosesToday();

  // Count take actions per medication today
  const takesByMed = {};
  for (const d of todayDoses) {
    if (d.action === 'take') takesByMed[d.medicationId] = (takesByMed[d.medicationId] || 0) + 1;
  }

  // Build scheduled slots: { time, hourNum, meds[] }
  const slots = [];
  const unscheduled = [];

  for (const med of meds) {
    const alerts = (med.reminders?.doseAlerts || []).filter(a => {
      const days = a.days ?? [0,1,2,3,4,5,6];
      return days.includes(dayOfWeek);
    });

    if (alerts.length > 0) {
      for (const alert of alerts) {
        const existing = slots.find(s => s.time === alert.time);
        if (existing) existing.meds.push(med);
        else slots.push({ time: alert.time, hourNum: Number(alert.time.split(':')[0]), meds: [med] });
      }
    } else {
      unscheduled.push(med);
    }
  }

  slots.sort((a, b) => a.time.localeCompare(b.time));

  // ── Build HTML ─────────────────────────────────────────────────────────────
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  let html = `<div class="today-date-header">
    <md-icon class="today-date-icon">today</md-icon>
    <span>${dateStr}</span>
  </div>`;

  if (meds.length === 0) {
    html += `<div class="today-empty">
      <md-icon>medication</md-icon>
      <p>No medications added yet.</p>
      <p>Tap + to add your first medication.</p>
    </div>`;
    container.innerHTML = html;
    return;
  }

  // Render scheduled time slots
  for (const slot of slots) {
    const [h, m] = slot.time.split(':').map(Number);
    const slotDate = new Date(now);
    slotDate.setHours(h, m, 0, 0);
    const timeLabel  = slotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isPast     = now > slotDate;
    const groupIcon  = h < 6 ? 'bedtime' : h < 12 ? 'wb_sunny' : h < 17 ? 'wb_cloudy' : h < 21 ? 'nights_stay' : 'bedtime';
    const groupLabel = h < 6 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';

    html += `<div class="today-slot">
      <div class="today-slot-header">
        <md-icon class="today-slot-icon">${groupIcon}</md-icon>
        <span class="today-slot-time">${timeLabel}</span>
        <span class="today-slot-period">${groupLabel}</span>
        ${isPast ? '<span class="today-slot-past">past</span>' : ''}
      </div>`;

    for (let idx = 0; idx < slot.meds.length; idx++) {
      const med    = slot.meds[idx];
      const taken  = (takesByMed[med.id] || 0) > idx;
      html += buildMedItem(med, taken, med.id);
    }

    html += `</div>`;
  }

  // Render unscheduled / PRN
  if (unscheduled.length > 0) {
    html += `<div class="today-slot">
      <div class="today-slot-header">
        <md-icon class="today-slot-icon">all_inclusive</md-icon>
        <span class="today-slot-time">As needed</span>
        <span class="today-slot-period">PRN / unscheduled</span>
      </div>`;

    for (const med of unscheduled) {
      const taken = (takesByMed[med.id] || 0) > 0;
      html += buildMedItem(med, taken, med.id);
    }

    html += `</div>`;
  }

  // Daily summary footer
  const totalScheduled = slots.reduce((s, sl) => s + sl.meds.length, 0);
  const totalTaken     = Object.values(takesByMed).reduce((s, n) => s + n, 0);

  if (totalScheduled > 0 || totalTaken > 0) {
    const pct = totalScheduled > 0 ? Math.min(100, Math.round((totalTaken / totalScheduled) * 100)) : 100;
    const color = pct >= 80 ? '#386A1F' : pct >= 50 ? '#C25B00' : '#B3261E';
    html += `<div class="today-summary">
      <div class="today-summary-label">${totalTaken} of ${totalScheduled} scheduled doses taken today</div>
      <div class="today-summary-bar-wrap">
        <div class="today-summary-bar" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
  }

  container.innerHTML = html;

  // Attach take events
  container.querySelectorAll('.today-take-btn').forEach(btn => {
    btn.addEventListener('click', () => onTake(Number(btn.dataset.medId)));
  });
}

function buildMedItem(med, taken, medId) {
  const accent = med.color ?? '#006B5E';
  const qty    = med.quantity ?? 0;
  const sub    = [med.strength, med.form].filter(Boolean).join(' · ');
  return `<div class="today-med-item ${taken ? 'today-taken' : qty <= 0 ? 'today-empty-qty' : ''}">
    <div class="today-check ${taken ? 'today-check--done' : ''}" style="${taken ? '' : `--check-color:${accent}`}">
      ${taken ? '<md-icon>check</md-icon>' : ''}
    </div>
    <div class="today-med-info">
      <div class="today-med-name">${esc(med.name)}</div>
      <div class="today-med-sub">${sub ? esc(sub) + ' · ' : ''}${qty} remaining</div>
    </div>
    ${taken
      ? `<span class="today-taken-label">Taken</span>`
      : `<md-filled-tonal-button class="today-take-btn" data-med-id="${medId}" ${qty <= 0 ? 'disabled' : ''}>
          <md-icon slot="icon">remove</md-icon>
          Take
        </md-filled-tonal-button>`
    }
  </div>`;
}
