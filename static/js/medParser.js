// Natural-language quick-add parser.
//
// Turns free text like "Seroquel 200mg tab nightly" into a set of form-field
// values. Every value comes back tagged with a confidence tier:
//   tier 1 ("inferred")       low-stakes, shown greyed-out until the user
//                              touches the field — e.g. name/strength/form
//                              read directly off what was typed.
//   tier 2 ("needs confirm")  a guess rather than a direct read — e.g. an
//                              assumed fill quantity, an ambiguous weekly
//                              schedule, or anything involving a controlled
//                              substance — and must be explicitly confirmed
//                              in the save-time review dialog before saving.
import { MED_DATASET } from './medData.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const FORM_KEYWORDS = {
  tab: 'Tablet', tabs: 'Tablet', tablet: 'Tablet', tablets: 'Tablet',
  cap: 'Capsule', caps: 'Capsule', capsule: 'Capsule', capsules: 'Capsule',
  patch: 'Patch', patches: 'Patch',
  inhaler: 'Inhaler', puff: 'Inhaler', puffs: 'Inhaler',
  injection: 'Injection', inject: 'Injection', shot: 'Injection', shots: 'Injection',
  drop: 'Drops', drops: 'Drops',
  cream: 'Topical', ointment: 'Topical', gel: 'Topical', topical: 'Topical', lotion: 'Topical',
  liquid: 'Liquid', solution: 'Liquid', suspension: 'Liquid', syrup: 'Liquid', elixir: 'Liquid',
  spray: 'Inhaler', sprays: 'Inhaler',
};

const UNIT_BY_FORM = {
  Tablet: 'tablets', Capsule: 'capsules', Patch: 'patches', Inhaler: 'puffs',
  Injection: 'units', Drops: 'drops', Topical: 'applications', Liquid: 'mL', Other: 'pills',
};

const QTY_PER_DOSE_RE = /\b(\d+)\s*(tabs?|tablets?|caps?|capsules?|pills?|puffs?|sprays?|drops?|patches?)\b/i;
const STRENGTH_RE = /\b(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(mg|mcg|milligrams?|micrograms?|iu|units?|%|ml)\b/i;
const EXPLICIT_QTY_RE = /(?:#\s*(\d+)\b)|(?:\bqty:?\s*(\d+)\b)|(?:\b(\d+)\s*(?:on hand|in stock|remaining|left)\b)/i;
const LEADING_FILLER_RE = /^\s*(i\s+take|i'm taking|taking|take|patient takes|on)\s+/i;

const FREQ_PHRASES = [
  { re: /\b(as needed|prn|when needed)\b/i,
    build: () => ({ label: 'As needed (PRN)', doseAlerts: [], dosesPerDay: null, isPRN: true }) },
  { re: /\b(four times( a day| daily)?|qid)\b/i,
    build: () => ({ label: 'Four times daily', doseAlerts: ['06:00', '12:00', '18:00', '22:00'].map(t => ({ time: t, days: ALL_DAYS })), dosesPerDay: 4 }) },
  { re: /\b(three times( a day| daily)?|tid)\b/i,
    build: () => ({ label: 'Three times daily', doseAlerts: ['08:00', '14:00', '20:00'].map(t => ({ time: t, days: ALL_DAYS })), dosesPerDay: 3 }) },
  { re: /\b(twice( a day| daily)?|bid)\b/i,
    build: () => ({ label: 'Twice daily', doseAlerts: ['08:00', '20:00'].map(t => ({ time: t, days: ALL_DAYS })), dosesPerDay: 2 }) },
  { re: /\b(once( a|every)? week(ly)?|weekly|every week)\b/i,
    build: () => ({ label: 'Weekly', doseAlerts: [{ time: '08:00', days: [new Date().getDay()] }], dosesPerDay: 1 / 7, ambiguousSchedule: true }) },
  { re: /\bevery other day\b|\bqod\b/i,
    build: () => ({ label: 'Every other day', doseAlerts: [], dosesPerDay: 0.5, ambiguousSchedule: true }) },
  { re: /\b(at night|nightly|qhs|before bed(time)?|at bedtime)\b/i,
    build: () => ({ label: 'Once daily (bedtime)', doseAlerts: [{ time: '21:00', days: ALL_DAYS }], dosesPerDay: 1 }) },
  { re: /\b(in the morning|qam|every morning)\b/i,
    build: () => ({ label: 'Once daily (morning)', doseAlerts: [{ time: '08:00', days: ALL_DAYS }], dosesPerDay: 1 }) },
  { re: /\b(once( a| every)? day|once daily|qd|daily)\b/i,
    build: () => ({ label: 'Once daily', doseAlerts: [{ time: '08:00', days: ALL_DAYS }], dosesPerDay: 1 }) },
];

const FREQ_HINTS = {
  'once-daily-morning': () => ({ label: 'Once daily (morning)', doseAlerts: [{ time: '08:00', days: ALL_DAYS }], dosesPerDay: 1, fromHint: true }),
  'once-daily-bedtime':  () => ({ label: 'Once daily (bedtime)', doseAlerts: [{ time: '21:00', days: ALL_DAYS }], dosesPerDay: 1, fromHint: true }),
  'twice-daily':         () => ({ label: 'Twice daily', doseAlerts: ['08:00', '20:00'].map(t => ({ time: t, days: ALL_DAYS })), dosesPerDay: 2, fromHint: true }),
  'three-times-daily':   () => ({ label: 'Three times daily', doseAlerts: ['08:00', '14:00', '20:00'].map(t => ({ time: t, days: ALL_DAYS })), dosesPerDay: 3, fromHint: true }),
  'four-times-daily':    () => ({ label: 'Four times daily', doseAlerts: ['06:00', '12:00', '18:00', '22:00'].map(t => ({ time: t, days: ALL_DAYS })), dosesPerDay: 4, fromHint: true }),
  'as-needed':           () => ({ label: 'As needed (PRN)', doseAlerts: [], dosesPerDay: null, isPRN: true, fromHint: true }),
  'weekly':              () => ({ label: 'Weekly', doseAlerts: [{ time: '08:00', days: [new Date().getDay()] }], dosesPerDay: 1 / 7, ambiguousSchedule: true, fromHint: true }),
};

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }

function levenshtein1(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return 2;
    if (a.length === b.length)      { i++; j++; }
    else if (a.length > b.length)   { i++; }
    else                             { j++; }
  }
  edits += (a.length - i) + (b.length - j);
  return edits;
}

// ── Drug name matching ─────────────────────────────────────────────────────
export function lookupByNameOrAlias(typed, dataset = MED_DATASET) {
  const q = (typed || '').trim().toLowerCase();
  if (!q) return null;
  for (const entry of dataset) {
    if (entry.name.toLowerCase() === q) return entry;
    if ((entry.aliases || []).some(a => a === q)) return entry;
  }
  return null;
}

export function matchDrugName(text, dataset = MED_DATASET) {
  const cleaned = text.replace(LEADING_FILLER_RE, '');
  const lower = cleaned.toLowerCase();

  const candidates = [];
  for (const entry of dataset) {
    candidates.push({ str: entry.name.toLowerCase(), entry, isAlias: false });
    for (const alias of entry.aliases || []) candidates.push({ str: alias, entry, isAlias: true });
  }
  candidates.sort((a, b) => b.str.length - a.str.length);

  // Prefer a match anchored at the very start of the (filler-stripped) text.
  for (const c of candidates) {
    const re = new RegExp('^' + escapeRegex(c.str) + '\\b', 'i');
    const m = lower.match(re);
    if (m) return { entry: c.entry, matchedText: c.str, endIndex: m[0].length, anchored: true };
  }
  // Fall back to a match anywhere in the text.
  for (const c of candidates) {
    const re = new RegExp('\\b' + escapeRegex(c.str) + '\\b', 'i');
    const m = lower.match(re);
    if (m) return { entry: c.entry, matchedText: c.str, endIndex: m.index + m[0].length, anchored: false };
  }
  // Fuzzy fallback: first word, off by at most one character (catches typos).
  const firstWord = lower.match(/^[a-z]+/)?.[0];
  if (firstWord && firstWord.length >= 5) {
    for (const c of candidates) {
      const candWord = c.str.split(' ')[0];
      if (Math.abs(candWord.length - firstWord.length) <= 1 && levenshtein1(firstWord, candWord) <= 1) {
        return { entry: c.entry, matchedText: c.str, endIndex: firstWord.length, anchored: true, fuzzy: true };
      }
    }
  }
  return null;
}

function guessNameFromLeadingWords(text) {
  const cleaned = text.replace(LEADING_FILLER_RE, '').trim();
  const words = cleaned.split(/\s+/);
  const nameWords = [];
  for (const w of words) {
    if (STRENGTH_RE.test(w) || FORM_KEYWORDS[w.toLowerCase().replace(/[^a-z]/g, '')]) break;
    nameWords.push(w);
    if (nameWords.length >= 3) break;
  }
  return nameWords.length ? titleCase(nameWords.join(' ')) : null;
}

// ── Strength ─────────────────────────────────────────────────────────────
export function extractStrength(text) {
  const m = text.match(STRENGTH_RE);
  if (!m) return null;
  const unit = m[3].toLowerCase().replace(/^milligrams?$/, 'mg').replace(/^micrograms?$/, 'mcg').replace(/^units?$/, 'units');
  const normalized = m[2] ? `${m[1]}/${m[2]}${unit}` : `${m[1]}${unit}`;
  return { normalized, raw: m[0] };
}

// ── Form / unit ──────────────────────────────────────────────────────────
export function extractFormAndUnit(text) {
  const words = text.toLowerCase().split(/[^a-z]+/);
  for (const w of words) {
    if (FORM_KEYWORDS[w]) {
      const form = FORM_KEYWORDS[w];
      return { form, unit: UNIT_BY_FORM[form], matchedWord: w };
    }
  }
  return null;
}

// ── Quantity per dose ───────────────────────────────────────────────────
export function extractQuantityPerDose(text) {
  const m = text.match(QTY_PER_DOSE_RE);
  if (m) return { value: Number(m[1]), explicit: true };
  return { value: 1, explicit: false };
}

// ── Explicit on-hand quantity ("#30", "qty 30", "30 remaining") ──────────
export function extractExplicitQuantity(text) {
  const m = text.match(EXPLICIT_QTY_RE);
  if (!m) return null;
  const n = Number(m[1] ?? m[2] ?? m[3]);
  return Number.isFinite(n) ? n : null;
}

// ── Frequency / schedule ───────────────────────────────────────────────
export function extractFrequency(text) {
  for (const { re, build } of FREQ_PHRASES) {
    if (re.test(text)) return build();
  }
  return null;
}

function freqFromHint(hint) {
  return FREQ_HINTS[hint] ? FREQ_HINTS[hint]() : null;
}

// ── Quantity-on-hand guess from an implied "full bottle" ──────────────────
export function guessQuantity(dosesPerDay, quantityPerDose, daysSupply = 30) {
  if (!dosesPerDay || dosesPerDay <= 0) return null;
  const qty = Math.round(dosesPerDay * quantityPerDose * daysSupply);
  return qty > 0 ? qty : null;
}

// ── Top-level orchestration ────────────────────────────────────────────
export function parseQuickAdd(text, dataset = MED_DATASET) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  const result = { raw: trimmed, fields: {}, tiers: {}, matchedDrug: null, unmatchedName: false, freq: null };

  const drugMatch = matchDrugName(trimmed, dataset);
  if (drugMatch) {
    result.matchedDrug = drugMatch.entry;
    result.fields.name = drugMatch.entry.name;
    result.tiers.name = 1;
    if (drugMatch.entry.genericName) {
      result.fields['generic-name'] = drugMatch.entry.genericName;
      result.tiers['generic-name'] = 1;
    }
    if (drugMatch.entry.category) {
      result.fields.category = drugMatch.entry.category;
      result.tiers.category = 1;
    }
  } else {
    const guessedName = guessNameFromLeadingWords(trimmed);
    if (guessedName) {
      result.fields.name = guessedName;
      result.tiers.name = 1;
      result.unmatchedName = true;
    }
  }

  const strengthMatch = extractStrength(trimmed);
  if (strengthMatch) {
    result.fields.strength = strengthMatch.normalized;
    result.tiers.strength = 1;
  } else if (drugMatch?.entry.commonStrengths?.length === 1) {
    result.fields.strength = drugMatch.entry.commonStrengths[0];
    result.tiers.strength = 2; // not in the text at all — a dataset-derived guess
  }

  const formMatch = extractFormAndUnit(trimmed);
  const formValue = formMatch?.form || drugMatch?.entry.defaultForm || null;
  if (formValue) {
    result.fields.form = formValue;
    result.tiers.form = formMatch ? 1 : 2;
  }

  const qpd = extractQuantityPerDose(trimmed);
  result.fields['qty-per-dose'] = qpd.value;
  result.tiers['qty-per-dose'] = 1; // explicit count, or a safe default of 1 — never sensitive

  const unit = formMatch?.unit || UNIT_BY_FORM[formValue] || drugMatch?.entry.typicalUnit || 'pills';
  result.fields.unit = unit;
  result.tiers.unit = 1;

  let freq = extractFrequency(trimmed);
  if (!freq && drugMatch?.entry.freqHint) freq = freqFromHint(drugMatch.entry.freqHint);
  if (freq) {
    result.freq = freq;
    result.tiers.schedule = (freq.ambiguousSchedule || freq.fromHint) ? 2 : 1;
    if (freq.isPRN) { result.fields.category = 'PRN'; result.tiers.category = 1; }
  }

  const explicitQty = extractExplicitQuantity(trimmed);
  if (explicitQty != null) {
    result.fields.quantity = explicitQty;
    result.tiers.quantity = 1;
  } else if (freq && !freq.isPRN && freq.dosesPerDay) {
    const guess = guessQuantity(freq.dosesPerDay, qpd.value, 30);
    if (guess != null) {
      result.fields.quantity = guess;
      result.fields['days-supply'] = 30;
      result.tiers.quantity = 2;
      result.tiers['days-supply'] = 2;
      result.quantityGuessed = true;
    }
  }

  // Controlled substances: an inferred dosing schedule is always sensitive,
  // even when the text itself was unambiguous (a guessed quantity is already
  // tier 2; an explicitly typed quantity is a literal read, not a guess).
  if (drugMatch?.entry.isControlled && result.tiers.schedule) {
    result.tiers.schedule = 2;
  }

  return result;
}

// ── Autocomplete support ───────────────────────────────────────────────
export function getAllDisplayNames(dataset = MED_DATASET) {
  const set = new Set();
  for (const d of dataset) {
    set.add(d.name);
    for (const a of d.aliases || []) set.add(titleCase(a));
  }
  return [...set].sort();
}

// ── Optional online fallback (NIH/NLM RxNorm RxNav API — public, free,
// no API key, CORS-enabled). Only ever called when the user has explicitly
// opted in via Settings; see app.js for the privacy-disclosure gate. ───────
export async function searchOnline(query) {
  const url = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const groups = json?.drugGroup?.conceptGroup ?? [];
  for (const g of groups) {
    if (g.conceptProperties?.length) {
      return { name: g.conceptProperties[0].name, tty: g.tty };
    }
  }
  return null;
}

// Re-runs the same local regex extractors against the string RxNorm returns
// (e.g. "quetiapine 200 MG Oral Tablet") so the result lands in the same
// {fields, tiers} shape as a local-dataset match. Always tier 2: it came
// from a guess about a network response, not directly from what was typed.
export function mapRxNormResultToParsedFields(onlineResult, originalQuery) {
  if (!onlineResult?.name) return null;
  const fields = {};
  const strength = extractStrength(onlineResult.name);
  if (strength) fields.strength = strength.normalized;
  const form = extractFormAndUnit(onlineResult.name);
  if (form) { fields.form = form.form; fields.unit = form.unit; }
  const namePart = onlineResult.name.replace(STRENGTH_RE, '').trim().split(/\s+/).slice(0, 2).join(' ');
  fields.name = titleCase(namePart || originalQuery);
  fields['generic-name'] = titleCase(namePart || originalQuery);
  const tiers = {};
  for (const k of Object.keys(fields)) tiers[k] = 2;
  return { fields, tiers, source: 'online' };
}
