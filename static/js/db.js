import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.mjs';

export const db = new Dexie('MedCount');

db.version(1).stores({
  medications: '++id, name, category, refillDate, updatedAt',
  doses:       '++id, medicationId, timestamp, [medicationId+timestamp]',
  settings:    'key',
});

// ── Medications ──────────────────────────────────────────────────────────────

export async function getMedications() {
  return db.medications.toArray();
}

export async function getMedication(id) {
  return db.medications.get(id);
}

export async function saveMedication(data) {
  const now = Date.now();
  if (data.id) {
    const { id, ...fields } = data;
    await db.medications.update(id, { ...fields, updatedAt: now });
    return id;
  }
  return db.medications.add({
    ...data,
    fillQuantity: data.quantity,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteMedication(id) {
  await db.doses.where('medicationId').equals(id).delete();
  await db.medications.delete(id);
}

// ── Doses ────────────────────────────────────────────────────────────────────

export async function addDose(medicationId, action, quantityBefore, quantityAfter, note = '') {
  return db.doses.add({ medicationId, timestamp: Date.now(), action, quantityBefore, quantityAfter, note });
}

export async function getDosesForMedication(medicationId, limit = 200) {
  return db.doses
    .where('medicationId').equals(medicationId)
    .reverse()
    .limit(limit)
    .toArray();
}

export async function getLastTakeDose(medicationId) {
  return db.doses
    .where('medicationId').equals(medicationId)
    .filter(d => d.action === 'take')
    .last();
}

export async function getAllDoses() {
  return db.doses.orderBy('timestamp').reverse().toArray();
}

export async function getDosesToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.doses.where('timestamp').aboveOrEqual(start.getTime()).toArray();
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row !== undefined ? row.value : fallback;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}
