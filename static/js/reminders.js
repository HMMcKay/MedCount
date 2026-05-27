import { getMedications, getSetting, setSetting } from './db.js';

let _checkInterval = null;
let _swReg = null;

export async function initReminders(swReg) {
  _swReg = swReg;
  await checkAndFireReminders();
  _checkInterval = setInterval(checkAndFireReminders, 60_000);
}

export function stopReminders() {
  clearInterval(_checkInterval);
  _checkInterval = null;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationsGranted() {
  return 'Notification' in window && Notification.permission === 'granted';
}

export async function checkAndFireReminders() {
  if (!notificationsGranted()) return;

  const meds    = await getMedications();
  const now     = new Date();
  const dayKey  = now.toISOString().split('T')[0];
  const firedRaw = await getSetting(`fired_${dayKey}`, '{}');
  const fired   = JSON.parse(firedRaw);
  let changed   = false;

  for (const med of meds) {
    const rem = med.reminders;
    if (!rem) continue;

    // ── 1. Dose reminders ──────────────────────────────────────────
    for (const alert of (rem.doseAlerts || [])) {
      const key  = `dose_${med.id}_${alert.time}`;
      if (fired[key]) continue;

      const days = alert.days ?? [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(now.getDay())) continue;

      const [h, m]   = alert.time.split(':').map(Number);
      const alertAt  = new Date(now); alertAt.setHours(h, m, 0, 0);
      const diffMs   = now - alertAt;

      if (diffMs >= 0 && diffMs < 30 * 60_000) {
        await _notify(`Time for ${med.name}`, `Scheduled dose reminder (${alert.time})`, `dose-${med.id}-${alert.time}`, { medicationId: med.id });
        fired[key] = true; changed = true;
      }
    }

    // ── 2. Refill reminder ─────────────────────────────────────────
    if (rem.refillAlertDays != null && med.refillDate) {
      const key        = `refill_${med.id}_${dayKey}`;
      const daysUntil  = Math.ceil((new Date(med.refillDate) - now) / 86_400_000);
      if (!fired[key] && daysUntil >= 0 && daysUntil <= rem.refillAlertDays) {
        const body = daysUntil === 0
          ? `${med.name} refill is due today!`
          : `${med.name} refill due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        await _notify(`Refill ${med.name} soon`, body, `refill-${med.id}-${dayKey}`, { medicationId: med.id });
        fired[key] = true; changed = true;
      }
    }

    // ── 3. Smart tracking reminder ─────────────────────────────────
    if (rem.trackingAlert?.enabled && (rem.doseAlerts?.length > 0)) {
      const key       = `track_${med.id}_${dayKey}`;
      const maxH      = rem.trackingAlert.maxHoursSinceDose ?? 12;
      const sinceH    = (Date.now() - (med.updatedAt ?? 0)) / 3_600_000;
      if (!fired[key] && sinceH >= maxH) {
        await _notify(
          `${med.name} — did you log your dose?`,
          `No dose logged in ${Math.round(sinceH)} hours`,
          `track-${med.id}-${dayKey}`,
          { medicationId: med.id }
        );
        fired[key] = true; changed = true;
      }
    }
  }

  if (changed) await setSetting(`fired_${dayKey}`, JSON.stringify(fired));
}

async function _notify(title, body, tag, data) {
  if (_swReg?.showNotification) {
    return _swReg.showNotification(title, {
      body, tag, icon: '/static/icon-192.png', badge: '/static/icon-192.png',
      data, vibrate: [200, 100, 200],
    });
  }
  new Notification(title, { body, tag, icon: '/static/icon-192.png' });
}
