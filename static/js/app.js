import { getMedications, getMedication, saveMedication, deleteMedication,
         getLastTakeDose, getDosesForMedication, getSetting, setSetting } from './db.js';
import { setupEncryption, unlockWithPin } from './crypto.js';
import { recordTake, recordAddOne, recordRefill, getHistory,
         exportAllData, importData, printHistory } from './history.js';
import { initReminders, stopReminders, requestNotificationPermission,
         notificationsGranted, checkAndFireReminders } from './reminders.js';
import { renderStats } from './stats.js';
import { renderToday } from './today.js';
import { ic } from './icons.js';
import { parseQuickAdd, getAllDisplayNames, lookupByNameOrAlias,
         searchOnline, mapRxNormResultToParsedFields } from './medParser.js';

// ── State ─────────────────────────────────────────────────────────────────────
let medications       = [];
let filterCat         = null;
let sortBy            = 'name';
let encKey            = null;
let editingId         = null;
let swReg             = null;
let currentTab        = 'home';
let searchQuery       = '';
let _pendingDeleteId  = null;
let _pendingRefillId  = null;
let _doseReminderCount = 0;
let _historyMedId     = null;
let _inferredFields   = new Map(); // fieldKey -> { tier, label, el, onTouch }
let _quickAddTimer    = null;
let _pendingSaveData  = null;

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_COLORS = {
  'Chronic':    '#0061A4',
  'PRN':        '#7D5260',
  'OTC':        '#386A1F',
  'Supplement': '#C25B00',
  'Vitamin':    '#B1416B',
  'Other':      '#616161',
};

const ACCENT_COLORS = [
  { value: '#006B5E', label: 'Teal'   },
  { value: '#0061A4', label: 'Blue'   },
  { value: '#6B4EAA', label: 'Purple' },
  { value: '#B1416B', label: 'Pink'   },
  { value: '#C25B00', label: 'Amber'  },
  { value: '#386A1F', label: 'Green'  },
  { value: '#8B1A1A', label: 'Red'    },
  { value: '#5A5A5A', label: 'Slate'  },
];

// Drug name suggestions (autocomplete + quick-add matching) come from the
// local medication dataset in medData.js, not a hardcoded list — see medParser.js.
const DRUG_NAMES = getAllDisplayNames();

const STRENGTHS = ['1mg','2mg','2.5mg','5mg','10mg','12.5mg','20mg','25mg',
  '40mg','50mg','75mg','100mg','150mg','200mg','250mg','300mg','400mg',
  '500mg','600mg','750mg','1000mg','5mcg','10mcg','25mcg','50mcg','100mcg',
  '1mL','2mL','5mL','10mL','15mL','20mL','30mL',
  '0.5%','1%','2%','5%','10%'];

const UNITS = ['tablets','capsules','pills','mL','mg','mcg','drops','patches',
  'puffs','units','IU','sprays','suppositories','lozenges'];

const FREQ_OPTIONS = ['Once daily','Twice daily','Three times daily','Four times daily',
  'Every other day','Weekly','As needed (PRN)','Other'];

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  customElements.whenDefined('md-fab').then(init);
});

async function init() {
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('/static/sw.js');
      await initReminders(swReg);
    } catch (e) { console.warn('SW:', e); }
  }

  const theme = await getSetting('theme', 'auto');
  applyTheme(theme);
  document.querySelector('#settings-theme-select')?.setAttribute('value', theme);

  const encEnabled = await getSetting('encryptionEnabled', false);
  if (encEnabled) {
    showElement('pin-screen');
    hideElement('app');
    setupPinScreen();
    return;
  }

  await loadAndRender();
  bindEvents();
}

async function loadAndRender() {
  medications = await getMedications();
  for (const med of medications) {
    const last = await getLastTakeDose(med.id);
    med._lastTaken = last ? last.timestamp : null;
  }
  renderGrid();
  hideElement('pin-screen');
  showElement('app');
  bindEvents();
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  if (theme === 'dark')  root.setAttribute('data-theme', 'dark');
}

// ── Tab navigation ────────────────────────────────────────────────────────────
function switchTab(tab) {
  if (currentTab === tab) return;
  currentTab = tab;

  ['home','today','stats'].forEach(t => {
    const page = document.getElementById(`tab-${t}`);
    if (page) page.hidden = t !== tab;
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const sortAnchor = document.getElementById('sort-anchor');
  const fabContainer = document.getElementById('fab-container');
  const searchBtn = document.getElementById('btn-search');

  if (sortAnchor)  sortAnchor.style.display = tab === 'home' ? '' : 'none';
  if (fabContainer) fabContainer.hidden = tab !== 'home';
  if (searchBtn)   searchBtn.style.display = tab === 'home' ? '' : 'none';

  if (tab === 'today') {
    const container = document.getElementById('today-content');
    renderToday(container, medications, handleTakeFromToday);
  }
  if (tab === 'stats') {
    const container = document.getElementById('stats-content');
    renderStats(container, medications);
  }
}

// ── Grid ──────────────────────────────────────────────────────────────────────
function renderGrid() {
  const grid  = document.getElementById('med-grid');
  const empty = document.getElementById('empty-state');

  let list = [...medications];
  if (filterCat)    list = list.filter(m => m.category === filterCat);
  if (searchQuery)  list = list.filter(m => (m.name || '').toLowerCase().includes(searchQuery.toLowerCase())
                                          || (m.genericName || '').toLowerCase().includes(searchQuery.toLowerCase()));

  list.sort((a, b) => {
    if (sortBy === 'quantity')   return (a.quantity ?? 0) - (b.quantity ?? 0);
    if (sortBy === 'supply') {
      const sa = supplyDays(a) ?? Infinity;
      const sb = supplyDays(b) ?? Infinity;
      return sa - sb;
    }
    if (sortBy === 'refillDate') {
      if (!a.refillDate) return 1;
      if (!b.refillDate) return -1;
      return new Date(a.refillDate) - new Date(b.refillDate);
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  if (list.length === 0) {
    grid.innerHTML = '';
    showElement('empty-state');
  } else {
    hideElement('empty-state');
    grid.innerHTML = list.map(cardHTML).join('');
    grid.querySelectorAll('[data-med-id]').forEach(el => attachCardEvents(el));
  }

  renderFilterChips();
}

function supplyDays(med) {
  const qty  = med.quantity ?? 0;
  const dpd  = estimateDosesPerDay(med) * (med.quantityPerDose ?? 1);
  if (dpd <= 0 || qty <= 0) return null;
  return Math.floor(qty / dpd);
}

function cardHTML(med) {
  const fillQty    = med.fillQuantity > 0 ? med.fillQuantity : (med.quantity || 1);
  const progress   = Math.max(0, Math.min(1, (med.quantity ?? 0) / fillQty));
  const isLow      = (med.quantity ?? 0) <= (med.lowStockThreshold ?? 0) && (med.lowStockThreshold ?? 0) > 0;
  const isExpired  = med.expirationDate && new Date(med.expirationDate) < new Date();
  const daysRefill = daysUntilRefill(med);
  const catColor   = CAT_COLORS[med.category] ?? CAT_COLORS['Other'];
  const accentHex  = med.color ?? '#006B5E';
  const supplyD    = supplyDays(med);

  let refillBadge = '';
  if (daysRefill !== null) {
    if (daysRefill < 0)    refillBadge = `<span class="badge badge-error">Refill overdue</span>`;
    else if (daysRefill <= 7) refillBadge = `<span class="badge badge-warn">Refill in ${daysRefill}d</span>`;
    else               refillBadge = `<span class="badge badge-ok">Refill ${formatDate(med.refillDate)}</span>`;
  }
  if (isExpired)  refillBadge += `<span class="badge badge-error">Expired</span>`;

  const lastTakenStr = med._lastTaken ? timeAgo(med._lastTaken) : null;
  const unit = med.unit || 'left';

  return `
  <article class="med-card" data-med-id="${med.id}" style="--card-accent: ${accentHex}">
    <div class="card-top">
      <div class="card-title-row">
        <span class="cat-dot" style="background:${catColor}" title="${esc(med.category)}"></span>
        <div class="card-name-area">
          <h2 class="card-name">${esc(med.name)}</h2>
          ${(med.strength || med.form) ? `<p class="card-sub">${[esc(med.strength), esc(med.form)].filter(Boolean).join(' · ')}</p>` : ''}
        </div>
      </div>
      <div class="card-menu-anchor">
        <button type="button" class="card-menu-btn" aria-label="Options" aria-haspopup="menu">
          ${ic('more_vert')}
        </button>
        <div class="card-menu" role="menu">
          <button type="button" class="card-menu-item" data-action="edit" role="menuitem">${ic('edit')}<span>Edit</span></button>
          <button type="button" class="card-menu-item" data-action="history" role="menuitem">${ic('history')}<span>History</span></button>
          <button type="button" class="card-menu-item" data-action="refill" role="menuitem">${ic('local_pharmacy')}<span>Refill</span></button>
          <button type="button" class="card-menu-item card-menu-item--danger" data-action="delete" role="menuitem">${ic('delete_outline')}<span>Delete</span></button>
        </div>
      </div>
    </div>

    <div class="card-qty-row">
      <div class="progress-bar ${isLow ? 'low' : ''}" style="--progress:${progress};--accent:${accentHex}">
        <div class="progress-fill"></div>
      </div>
      <span class="qty-label ${isLow ? 'qty-low' : ''}">${med.quantity ?? 0} ${esc(unit)}</span>
    </div>

    ${supplyD !== null ? `<p class="card-supply ${supplyD <= 7 ? 'supply-critical' : supplyD <= 14 ? 'supply-low' : ''}">
      <svg class="ic" aria-hidden="true"><use href="#i-hourglass_bottom"></use></svg> ~${supplyD} day${supplyD !== 1 ? 's' : ''} supply</p>` : ''}

    <div class="card-badges">${refillBadge}${isLow ? '<span class="badge badge-warn">Low stock</span>' : ''}</div>

    ${med.fillDate   ? `<p class="card-meta"><svg class="ic" aria-hidden="true"><use href="#i-calendar_today"></use></svg> Filled ${formatDate(med.fillDate)}</p>` : ''}
    ${lastTakenStr   ? `<p class="card-meta"><svg class="ic" aria-hidden="true"><use href="#i-schedule"></use></svg> Last taken ${lastTakenStr}</p>` : ''}
    ${med.sig        ? `<p class="card-meta card-sig"><svg class="ic" aria-hidden="true"><use href="#i-receipt"></use></svg> ${esc(med.sig)}</p>` : ''}

    <div class="card-actions">
      <md-filled-button class="btn-take" data-med-id="${med.id}" ?disabled="${(med.quantity ?? 0) <= 0}">
        <svg class="ic" slot="icon" aria-hidden="true"><use href="#i-remove"></use></svg>
        Take${med.quantityPerDose > 1 ? ` (${med.quantityPerDose})` : ''}
      </md-filled-button>
      <md-tonal-icon-button class="btn-add-one" data-med-id="${med.id}" aria-label="Add one back">
        <svg class="ic" aria-hidden="true"><use href="#i-add"></use></svg>
      </md-tonal-icon-button>
    </div>
  </article>`;
}

function attachCardEvents(el) {
  const medId = Number(el.dataset.medId);
  el.querySelector('.btn-take')?.addEventListener('click', () => handleTake(medId));
  el.querySelector('.btn-add-one')?.addEventListener('click', () => handleAddOne(medId));

  const menuBtn = el.querySelector('.card-menu-btn');
  const menu    = el.querySelector('.card-menu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      closeAllCardMenus();
      if (!wasOpen) menu.classList.add('open');
    });
    menu.querySelectorAll('.card-menu-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        closeAllCardMenus();
        const action = item.dataset.action;
        if (action === 'edit')    openMedDialog(medId);
        if (action === 'history') openHistoryPage(medId);
        if (action === 'refill')  openRefillDialog(medId);
        if (action === 'delete')  openDeleteDialog(medId);
      });
    });
  }
}

function closeAllCardMenus() {
  document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open'));
}

// ── Filter chips ──────────────────────────────────────────────────────────────
function renderFilterChips() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const cats = [...new Set(medications.map(m => m.category).filter(Boolean))].sort();
  bar.innerHTML = ['All', ...cats].map(cat => {
    const selected = (cat === 'All' && !filterCat) || cat === filterCat;
    return `<md-filter-chip label="${esc(cat)}" ${selected ? 'selected' : ''} data-cat="${esc(cat)}"></md-filter-chip>`;
  }).join('');

  bar.querySelectorAll('md-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filterCat = chip.dataset.cat === 'All' ? null : chip.dataset.cat;
      renderGrid();
    });
  });
}

// ── Take / Add one ────────────────────────────────────────────────────────────
async function handleTake(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med || (med.quantity ?? 0) <= 0) return;
  const newQty = await recordTake(med);
  await saveMedication({ ...med, quantity: newQty });
  med.quantity   = newQty;
  med._lastTaken = Date.now();
  updateCardQty(medId, newQty, med);
  showToast(`Took ${med.name} — ${newQty} ${med.unit || 'left'}`);
  checkAndFireReminders();
}

async function handleAddOne(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med) return;
  const newQty = await recordAddOne(med);
  await saveMedication({ ...med, quantity: newQty });
  med.quantity = newQty;
  updateCardQty(medId, newQty, med);
  showToast(`+1 added to ${med.name}`);
}

async function handleTakeFromToday(medId) {
  await handleTake(medId);
  const container = document.getElementById('today-content');
  renderToday(container, medications, handleTakeFromToday);
}

function updateCardQty(medId, newQty, med) {
  const card = document.querySelector(`.med-card[data-med-id="${medId}"]`);
  if (!card) return;

  const fill     = med.fillQuantity > 0 ? med.fillQuantity : Math.max(newQty, 1);
  const progress = Math.max(0, Math.min(1, newQty / fill));
  const isLow    = newQty <= (med.lowStockThreshold ?? 0) && (med.lowStockThreshold ?? 0) > 0;

  const bar = card.querySelector('.progress-bar');
  if (bar) { bar.style.setProperty('--progress', progress); bar.classList.toggle('low', isLow); }

  const label = card.querySelector('.qty-label');
  if (label) {
    label.textContent = `${newQty} ${med.unit || 'left'}`;
    label.classList.toggle('qty-low', isLow);
    label.classList.add('qty-flash');
    setTimeout(() => label.classList.remove('qty-flash'), 350);
  }

  const supplyEl = card.querySelector('.card-supply');
  if (supplyEl) {
    const sd = supplyDays({ ...med, quantity: newQty });
    if (sd !== null) {
      supplyEl.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-hourglass_bottom"></use></svg> ~${sd} day${sd !== 1 ? 's' : ''} supply`;
      supplyEl.className = `card-supply ${sd <= 7 ? 'supply-critical' : sd <= 14 ? 'supply-low' : ''}`;
    }
  }

  card.querySelector('.btn-take')?.toggleAttribute('disabled', newQty <= 0);

  const badgesEl = card.querySelector('.card-badges');
  if (badgesEl) {
    let html = '';
    const days = daysUntilRefill(med);
    if (days !== null) {
      if (days < 0)       html += `<span class="badge badge-error">Refill overdue</span>`;
      else if (days <= 7) html += `<span class="badge badge-warn">Refill in ${days}d</span>`;
    }
    if (isLow) html += `<span class="badge badge-warn">Low stock</span>`;
    badgesEl.innerHTML = html;
  }
}

// ── Add / Edit dialog ─────────────────────────────────────────────────────────
async function openMedDialog(medId = null) {
  editingId = medId;
  document.getElementById('med-dialog-headline').textContent = medId ? 'Edit Medication' : 'Add Medication';
  resetMedForm();
  renderColorPicker();
  if (medId) {
    const med = medications.find(m => m.id === medId);
    if (med) populateMedForm(med);
  } else {
    setField('fill-date', today());
  }
  document.getElementById('med-dialog').show();
}

function resetMedForm() {
  document.getElementById('med-form').reset();
  document.getElementById('field-quickadd').value = '';
  document.getElementById('quickadd-hint').hidden = true;
  document.getElementById('dose-reminders-list').innerHTML = '';
  _doseReminderCount = 0;
  document.getElementById('tracking-options').hidden = true;
  document.getElementById('switch-tracking').selected = false;
  clearAllInferred();
}

function populateMedForm(med) {
  const set = (id, val) => { const el = document.getElementById(`field-${id}`); if (el && val != null) el.value = val; };
  set('name',              med.name);
  set('generic-name',      med.genericName);
  set('strength',          med.strength);
  set('form',              med.form);
  set('category',          med.category);
  set('quantity',          med.quantity);
  set('qty-per-dose',      med.quantityPerDose ?? 1);
  set('unit',              med.unit);
  set('days-supply',       med.daysSupply);
  set('low-stock',         med.lowStockThreshold);
  set('fill-date',         med.fillDate);
  set('refill-date',       med.refillDate);
  set('expiry-date',       med.expirationDate);
  set('prescriber',        med.prescriber);
  set('prescriber-phone',  med.prescriberPhone);
  set('pharmacy',          med.pharmacy);
  set('pharmacy-phone',    med.pharmacyPhone);
  set('rx',                med.rxNumber);
  set('sig',               med.sig);
  set('notes',             med.notes);
  set('refill-alert',      med.reminders?.refillAlertDays ?? 7);

  if (med.color) {
    const radio = document.querySelector(`input[name="med-color"][value="${med.color}"]`);
    if (radio) radio.checked = true;
  }

  const rem = med.reminders;
  if (rem?.doseAlerts?.length) {
    for (const alert of rem.doseAlerts) addReminderRow(alert.time, alert.days);
  }
  if (rem?.trackingAlert?.enabled) {
    document.getElementById('switch-tracking').selected = true;
    document.getElementById('tracking-options').hidden = false;
    setField('tracking-hours', rem.trackingAlert.maxHoursSinceDose ?? 12);
  }
}

function collectMedFormData() {
  const get = id => { const el = document.getElementById(`field-${id}`); return el ? el.value.trim() : ''; };
  const reminders = buildReminders();

  const data = {
    name:              get('name'),
    genericName:       get('generic-name'),
    strength:          get('strength'),
    form:              get('form'),
    category:          get('category') || 'Other',
    quantity:          parseNum(get('quantity'), 0),
    quantityPerDose:   parseNum(get('qty-per-dose'), 1),
    unit:              get('unit') || 'pills',
    daysSupply:        parseNum(get('days-supply'), null),
    lowStockThreshold: parseNum(get('low-stock'), 0),
    fillDate:          get('fill-date') || null,
    refillDate:        get('refill-date') || null,
    expirationDate:    get('expiry-date') || null,
    prescriber:        get('prescriber'),
    prescriberPhone:   get('prescriber-phone'),
    pharmacy:          get('pharmacy'),
    pharmacyPhone:     get('pharmacy-phone'),
    rxNumber:          get('rx'),
    sig:               get('sig'),
    notes:             get('notes'),
    color:             document.querySelector('input[name="med-color"]:checked')?.value ?? '#006B5E',
    reminders,
  };

  if (editingId) {
    const existing = medications.find(m => m.id === editingId);
    if (existing && data.quantity > existing.quantity) data.fillQuantity = data.quantity;
    data.id = editingId;
  }

  return data;
}

async function saveMedHandler() {
  const form = document.getElementById('med-form');
  if (!form.reportValidity()) return;

  const data = collectMedFormData();
  if (!data.name) { showToast('Medication name is required', 'error'); return; }

  // Quick-add may have left sensitive guesses unreviewed (tier 2 — the user
  // never touched the field). Gate the save behind an explicit confirmation
  // listing exactly what's being guessed, per the privacy/accuracy agreement.
  const pending = buildPendingGuesses();
  if (pending.length) {
    _pendingSaveData = data;
    openConfirmGuessDialog(pending);
    return;
  }

  await performMedSave(data);
}

async function performMedSave(data) {
  await saveMedication(data);
  document.getElementById('confirm-guess-dialog').close();
  document.getElementById('med-dialog').close();
  medications = await getMedications();
  for (const med of medications) {
    const last = await getLastTakeDose(med.id);
    med._lastTaken = last ? last.timestamp : null;
  }
  renderGrid();
  showToast(editingId ? 'Medication updated' : `${data.name} added`);
  saveAutocompleteHistory(data.prescriber, data.pharmacy, data.prescriberPhone, data.pharmacyPhone);
  _pendingSaveData = null;
  clearAllInferred();
}

function buildReminders() {
  const refillDays = parseNum(document.getElementById('field-refill-alert')?.value, null);
  const trackOn    = document.getElementById('switch-tracking')?.selected ?? false;
  const trackH     = parseNum(document.getElementById('field-tracking-hours')?.value, 12);
  const doseAlerts = [];
  document.querySelectorAll('.reminder-row').forEach(row => {
    const time = row.querySelector('.reminder-time')?.value;
    if (!time) return;
    const days = [];
    row.querySelectorAll('.day-chip input:checked').forEach(cb => days.push(Number(cb.value)));
    doseAlerts.push({ time, days: days.length === 7 ? [0,1,2,3,4,5,6] : days });
  });
  return { doseAlerts, refillAlertDays: refillDays, trackingAlert: { enabled: trackOn, maxHoursSinceDose: trackH } };
}

function addReminderRow(time = '08:00', days = [0,1,2,3,4,5,6]) {
  const list     = document.getElementById('dose-reminders-list');
  _doseReminderCount++;
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const row      = document.createElement('div');
  row.className  = 'reminder-row';
  row.innerHTML  = `
    <input type="time" class="reminder-time" value="${esc(time)}">
    <div class="day-chips">
      ${dayNames.map((d, i) => `
        <label class="day-chip">
          <input type="checkbox" value="${i}" ${days.includes(i) ? 'checked' : ''}>
          <span>${d}</span>
        </label>`).join('')}
    </div>
    <md-icon-button class="btn-remove-reminder" aria-label="Remove">
      <svg class="ic" aria-hidden="true"><use href="#i-close"></use></svg>
    </md-icon-button>`;
  row.querySelector('.btn-remove-reminder').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

// ── Quick add (natural-language autofill) ───────────────────────────────────
const QUICKADD_LABELS = {
  name: 'Medication name', 'generic-name': 'Generic name', category: 'Category',
  strength: 'Strength', form: 'Form', 'qty-per-dose': 'Qty per dose', unit: 'Unit',
  quantity: 'Current qty', 'days-supply': 'Days supply', schedule: 'Schedule',
};

// Flags a field (or, for the dose-schedule guess, a whole container) as
// quick-add-derived. Tier 1 ("inferred") fields just look greyed-out; tier 2
// ("needs confirm") fields additionally block save until reviewed — see
// buildPendingGuesses(). Either tier clears itself the moment the user
// touches/edits the field, since that counts as having reviewed it.
function markInferred(key, tier, label, opts = {}) {
  clearInferred(key);
  const el = opts.container || document.getElementById(`field-${key}`);
  if (!el) return;

  el.classList.add(tier === 2 ? 'field-needs-confirm' : 'field-inferred');

  const onTouch = () => clearInferred(key);
  el.addEventListener('focusin', onTouch, { once: true });
  el.addEventListener('input',   onTouch, { once: true });
  el.addEventListener('change',  onTouch, { once: true });

  _inferredFields.set(key, { tier, label, el, onTouch });
}

function clearInferred(key) {
  const entry = _inferredFields.get(key);
  if (!entry) return;
  entry.el.classList.remove('field-inferred', 'field-needs-confirm');
  entry.el.removeEventListener('focusin', entry.onTouch);
  entry.el.removeEventListener('input',   entry.onTouch);
  entry.el.removeEventListener('change',  entry.onTouch);
  _inferredFields.delete(key);
}

function clearAllInferred() {
  for (const key of Array.from(_inferredFields.keys())) clearInferred(key);
}

function applyParsedResult(parsed) {
  clearAllInferred();
  if (!parsed) return;

  if (!document.getElementById('field-fill-date').value) setField('fill-date', today());

  // Set values first, before any touch-listeners exist — otherwise the
  // synthetic change events dispatched below would immediately fire the
  // not-yet-attached markInferred() listeners out from under themselves.
  for (const [key, value] of Object.entries(parsed.fields)) {
    const el = document.getElementById(`field-${key}`);
    if (el) el.value = value;
  }

  // Let the existing change-handlers (refill-date math, low-stock default)
  // run now that quick-add has finished populating the fields they read.
  document.getElementById('field-days-supply')?.dispatchEvent(new Event('change'));
  document.getElementById('field-qty-per-dose')?.dispatchEvent(new Event('change'));

  for (const key of Object.keys(parsed.fields)) {
    if (!document.getElementById(`field-${key}`)) continue;
    markInferred(key, parsed.tiers[key] || 1, QUICKADD_LABELS[key] || key);
  }

  if (parsed.freq) {
    document.getElementById('dose-reminders-list').innerHTML = '';
    _doseReminderCount = 0;
    for (const alert of (parsed.freq.doseAlerts || [])) addReminderRow(alert.time, alert.days);
    const remindersDetails = document.getElementById('dose-reminders-list').closest('details.collapsible');
    if (remindersDetails) remindersDetails.open = true;
    const scheduleContainer = document.getElementById('dose-reminders-list').closest('.reminder-subsection');
    if (scheduleContainer) markInferred('schedule', parsed.tiers.schedule || 1, 'Schedule', { container: scheduleContainer });
  }
}

function showQuickAddHint(parsed, usedOnline) {
  const hint = document.getElementById('quickadd-hint');
  const text = document.getElementById('quickadd-hint-text');
  if (!parsed || !Object.keys(parsed.fields).length) { hint.hidden = true; return; }

  const parts = [];
  if (parsed.matchedDrug)    parts.push(`Matched "${parsed.matchedDrug.name}" in the local database`);
  else if (usedOnline)       parts.push(`No local match — looked up "${parsed.raw}" online`);
  else                       parts.push(`Couldn't find "${parsed.raw}" — guessed from what you typed`);

  const needsConfirm = Object.values(parsed.tiers).filter(t => t === 2).length;
  if (needsConfirm > 0) {
    parts.push(`${needsConfirm} value${needsConfirm > 1 ? 's' : ''} flagged for confirmation before saving`);
  }
  text.textContent = parts.join(' · ');
  hint.hidden = false;
}

async function handleQuickAddParse() {
  const input = document.getElementById('field-quickadd');
  const text  = input?.value.trim();
  if (!text) { document.getElementById('quickadd-hint').hidden = true; clearAllInferred(); return; }

  let parsed = parseQuickAdd(text);
  let usedOnline = false;

  if (!parsed?.matchedDrug) {
    const onlineOn = await getSetting('onlineLookupEnabled', false);
    if (onlineOn) {
      try {
        // RxNorm matches on a bare drug name, not a full free-text phrase —
        // use the name quick-add already guessed locally (e.g. "Zorbtive"
        // out of "Zorbtive 8.8mg injection"), falling back to the raw text.
        const queryName    = parsed?.fields?.name || text;
        const onlineResult = await searchOnline(queryName);
        const mapped = mapRxNormResultToParsedFields(onlineResult, queryName);
        if (mapped) {
          parsed = parsed || { raw: text, fields: {}, tiers: {}, matchedDrug: null, unmatchedName: true, freq: null };
          // Fill gaps only — a value already read directly from the typed
          // text (tier 1) is more trustworthy than RxNorm's parsed product
          // name and shouldn't be clobbered by it.
          for (const [k, v] of Object.entries(mapped.fields)) {
            if (parsed.fields[k] == null) {
              parsed.fields[k] = v;
              parsed.tiers[k]  = mapped.tiers[k];
            }
          }
          usedOnline = true;
        }
      } catch (e) { console.warn('Online lookup failed:', e); }
    }
  }

  if (!parsed) { document.getElementById('quickadd-hint').hidden = true; return; }

  applyParsedResult(parsed);
  showQuickAddHint(parsed, usedOnline);
}

function buildPendingGuesses() {
  return [..._inferredFields.entries()].filter(([, entry]) => entry.tier === 2);
}

function currentFieldDisplay(key) {
  if (key === 'schedule') {
    const times = [...document.querySelectorAll('.reminder-row .reminder-time')].map(t => t.value).filter(Boolean);
    return times.length ? times.join(', ') : '(no time set)';
  }
  const el = document.getElementById(`field-${key}`);
  return el ? el.value : '';
}

function openConfirmGuessDialog(pending) {
  const list = document.getElementById('confirm-guess-list');
  list.innerHTML = pending.map(([key, entry]) => `
    <li class="confirm-guess-item">
      <span class="confirm-guess-item-label">${esc(entry.label)}</span>
      <span class="confirm-guess-item-value">${esc(currentFieldDisplay(key))}</span>
    </li>`).join('');
  document.getElementById('confirm-guess-dialog').show();
}

// ── Refill dialog ─────────────────────────────────────────────────────────────
function openRefillDialog(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med) return;
  _pendingRefillId = medId;

  document.getElementById('refill-med-name-text').textContent = med.name;
  document.getElementById('refill-qty-field').value   = med.quantity ?? 0;
  document.getElementById('refill-date-field').value  = today();
  document.getElementById('refill-days-field').value  = med.daysSupply ?? '';
  document.getElementById('refill-dialog').show();
}

async function confirmRefill() {
  if (!_pendingRefillId) return;
  const med   = medications.find(m => m.id === _pendingRefillId);
  if (!med) return;

  const newQty = parseNum(document.getElementById('refill-qty-field').value, null);
  if (newQty === null || newQty < 0) { showToast('Invalid quantity', 'error'); return; }

  const fillDate = document.getElementById('refill-date-field').value || today();
  const days     = parseNum(document.getElementById('refill-days-field').value, null) ?? med.daysSupply;
  const refillDate = days
    ? (() => { const d = new Date(fillDate); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; })()
    : med.refillDate;

  const updatedMed = { ...med, quantity: newQty, fillQuantity: newQty, fillDate, refillDate, daysSupply: days ?? med.daysSupply };
  await recordRefill(med, newQty);
  await saveMedication(updatedMed);

  const idx = medications.findIndex(m => m.id === _pendingRefillId);
  if (idx !== -1) medications[idx] = updatedMed;
  _pendingRefillId = null;
  document.getElementById('refill-dialog').close();
  renderGrid();
  showToast(`${med.name} refilled — ${newQty} ${med.unit || 'pills'}`);
}

// ── History page ──────────────────────────────────────────────────────────────
async function openHistoryPage(medId) {
  _historyMedId = medId;
  const med = medications.find(m => m.id === medId);
  if (!med) return;

  document.getElementById('hist-page-title').textContent = med.name;
  document.getElementById('hist-page-sub').textContent =
    [med.strength, med.form, med.category].filter(Boolean).join(' · ');

  hideElement('app');
  showElement('history-page');

  const doses = await getDosesForMedication(medId, 500);

  document.getElementById('hist-chart-card').innerHTML  = buildQuantityChart(doses, med);
  document.getElementById('hist-adherence-card').innerHTML = buildAdherenceHTML(med, doses);

  const listEl = document.getElementById('hist-dose-list');
  if (doses.length === 0) {
    listEl.innerHTML = '<p class="hist-empty">No doses logged yet. Tap Take on the medication card to start tracking.</p>';
  } else {
    listEl.innerHTML = doses.map(d => buildDoseCardHTML(med, d, doses)).join('');
    listEl.querySelectorAll('.dose-card-header').forEach(header => {
      header.addEventListener('click', () => header.closest('.dose-card').classList.toggle('dose-card--open'));
    });
  }

  document.getElementById('btn-hist-print').onclick  = () => printHistory(medId, med.name);
  document.getElementById('btn-hist-export').onclick = exportAllData;
}

function closeHistoryPage() {
  hideElement('history-page');
  showElement('app');
  _historyMedId = null;
}

function buildQuantityChart(doses, med) {
  if (doses.length < 2) return '';
  const sorted = [...doses].reverse();
  const times  = sorted.map(d => d.timestamp);
  const vals   = sorted.map(d => d.quantityAfter);
  const minT   = times[0];
  const maxT   = times[times.length - 1];
  if (minT === maxT) return '';
  const maxQ   = Math.max(...vals, med.fillQuantity ?? 0, 1);

  const W = 320, H = 72, padX = 12, padY = 8;
  const mx = t => padX + ((t - minT) / (maxT - minT)) * (W - padX * 2);
  const my = q => padY + (H - padY * 2) * (1 - q / maxQ);

  const pts  = sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${mx(d.timestamp).toFixed(1)},${my(d.quantityAfter).toFixed(1)}`).join(' ');
  const area = `${pts} L${mx(maxT).toFixed(1)},${H} L${mx(minT).toFixed(1)},${H} Z`;

  const dots = sorted.filter(d => d.action === 'refill').map(d =>
    `<circle cx="${mx(d.timestamp).toFixed(1)}" cy="${my(d.quantityAfter).toFixed(1)}" r="4" fill="#386A1F" stroke="white" stroke-width="1.5"/>`
  ).join('');

  return `<div class="hist-chart-wrap">
    <div class="hist-chart-title">Quantity over time</div>
    <svg class="qty-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
      <defs>
        <linearGradient id="qg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--md-sys-color-primary)" stop-opacity=".25"/>
          <stop offset="100%" stop-color="var(--md-sys-color-primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#qg)"/>
      <path d="${pts}" fill="none" stroke="var(--md-sys-color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>
    <div class="qty-chart-legend">
      <span><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#386A1F"/></svg> Refill event</span>
    </div>
  </div>`;
}

function buildAdherenceHTML(med, doses) {
  const takeDoses  = doses.filter(d => d.action === 'take');
  const takenCount = takeDoses.length;
  const fillQty    = med.fillQuantity ?? med.quantity ?? 0;
  const curQty     = med.quantity ?? 0;
  const consumed   = fillQty - curQty;

  if (!med.fillDate) {
    return `<div class="hist-adherence">
      <div class="hist-adh-row"><span>Doses logged:</span><strong>${takenCount}</strong></div>
      <div class="hist-adh-row"><span>Currently remaining:</span><strong>${curQty} ${esc(med.unit || 'pills')}</strong></div>
    </div>`;
  }

  const fillDate  = new Date(med.fillDate + 'T12:00:00');
  const daysSince = Math.max(0, Math.floor((new Date() - fillDate) / 86_400_000));
  const dpd       = estimateDosesPerDay(med);
  const expected  = Math.round(daysSince * dpd);
  const pct       = expected > 0 ? Math.min(100, Math.round((takenCount / expected) * 100)) : null;
  const pctColor  = pct == null ? '#006B5E' : pct >= 80 ? '#386A1F' : pct >= 60 ? '#C25B00' : '#B3261E';
  const sd        = supplyDays(med);

  return `
  <div class="hist-adherence">
    <div class="hist-adh-row"><span>Fill date:</span><strong>${formatDate(med.fillDate)}</strong></div>
    <div class="hist-adh-row"><span>Starting qty:</span><strong>${fillQty} ${esc(med.unit || 'pills')}</strong></div>
    <div class="hist-adh-row"><span>Remaining:</span><strong>${curQty} ${esc(med.unit || 'pills')}</strong></div>
    <div class="hist-adh-row"><span>Consumed:</span><strong>${consumed >= 0 ? consumed : '—'} ${esc(med.unit || 'pills')}</strong></div>
    ${sd !== null ? `<div class="hist-adh-row"><span>Est. supply left:</span><strong>~${sd} day${sd !== 1 ? 's' : ''}</strong></div>` : ''}
    ${expected > 0 ? `
    <div class="hist-adh-divider"></div>
    <div class="hist-adh-row"><span>Expected doses by now:</span><strong>${expected}</strong></div>
    <div class="hist-adh-row"><span>Doses taken:</span><strong>${takenCount}</strong></div>
    ${pct != null ? `
    <div class="hist-adh-bar-wrap">
      <div class="hist-adh-bar" style="width:${pct}%;background:${pctColor}"></div>
    </div>
    <div class="hist-adh-pct" style="color:${pctColor}">${pct}% adherence</div>` : ''}` : ''}
  </div>`;
}

export function estimateDosesPerDay(med) {
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

function buildDoseCardHTML(med, dose, allDoses) {
  const dt       = new Date(dose.timestamp);
  const delta    = dose.quantityAfter - dose.quantityBefore;
  const isPos    = delta >= 0;
  const deltaStr = `${isPos ? '+' : ''}${delta}`;
  const dColor   = isPos ? '#386A1F' : '#B3261E';
  const actLabel = { take: 'Took dose', add: 'Added back', refill: 'Refill', edit: 'Edited' }[dose.action] ?? dose.action;

  return `
  <div class="dose-card" role="listitem">
    <div class="dose-card-header">
      <div class="dose-indicators">
        <span class="dose-delta" style="color:${dColor}">${esc(deltaStr)}</span>
        <span class="dose-remaining">${dose.quantityAfter}</span>
      </div>
      <div class="dose-info-col">
        <span class="dose-primary">${esc(actLabel)}&thinsp;·&thinsp;${esc(med.name)}</span>
        <span class="dose-secondary">${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}&thinsp;·&thinsp;${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        ${(med.strength || med.form) ? `<span class="dose-tertiary">${[esc(med.strength), esc(med.form)].filter(Boolean).join(' · ')}</span>` : ''}
      </div>
      <svg class="ic dose-chevron" aria-hidden="true"><use href="#i-expand_more"></use></svg>
    </div>
    <div class="dose-card-body">
      ${buildExpandedBody(med, dose, deltaStr, dColor, allDoses)}
    </div>
  </div>`;
}

function buildExpandedBody(med, dose, deltaStr, dColor, allDoses) {
  const dt = new Date(dose.timestamp);
  const sigLower = (med.sig || '').toLowerCase();

  const histItems = allDoses.slice(0, 60).map(d => {
    const ddt = new Date(d.timestamp);
    const dd  = d.quantityAfter - d.quantityBefore;
    return `<div class="hist-mini-row${d.id === dose.id ? ' hist-mini-current' : ''}">
      <span class="hist-mini-delta" style="color:${dd >= 0 ? '#386A1F' : '#B3261E'}">${dd >= 0 ? '+' : ''}${dd}</span>
      <span class="hist-mini-remaining">${d.quantityAfter}</span>
      <span class="hist-mini-label">${esc({ take:'Took', add:'Added', refill:'Refill', edit:'Edit' }[d.action] ?? d.action)}</span>
      <span class="hist-mini-time">${ddt.toLocaleDateString(undefined,{month:'short',day:'numeric'})} ${ddt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
    </div>`;
  }).join('');

  return `
  <div class="dose-exp-grid">
    <div class="dose-exp-section">
      <h4 class="dose-exp-title">Medication Details</h4>
      ${expRow('Name', med.name)}
      ${expRow('Date Filled', formatDate(med.fillDate))}
      ${expRow('Original Qty', med.fillQuantity != null ? `${med.fillQuantity} ${med.unit || 'pills'}` : null)}
      <div class="exp-row">
        <span class="exp-lbl">Dosage</span>
        <div class="exp-dosage">
          <input type="number" class="exp-num" value="${med.quantityPerDose ?? 1}" min="1" readonly>
          <select class="exp-freq" disabled>
            ${FREQ_OPTIONS.map(f => `<option ${sigLower.includes(f.split(' ')[0].toLowerCase()) ? 'selected' : ''}>${esc(f)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${expRow('Prescription #', med.rxNumber)}
      ${expRow('Pharmacy', med.pharmacy)}
      ${expRow('Pharmacy Phone', med.pharmacyPhone)}
      ${expRow('Physician', med.prescriber)}
      ${expRow('Physician Phone', med.prescriberPhone)}
    </div>

    <div class="dose-exp-section">
      <h4 class="dose-exp-title">This Record</h4>
      ${expRow('Created', dt.toLocaleString())}
      <div class="exp-row">
        <span class="exp-lbl">Change</span>
        <span class="exp-val" style="color:${dColor};font-weight:700;font-size:20px;line-height:1">${esc(deltaStr)}</span>
      </div>
      ${expRow('Quantity after', String(dose.quantityAfter))}
      ${dose.note ? expRow('Note', dose.note) : ''}
    </div>

    <div class="dose-exp-section">
      <h4 class="dose-exp-title">Adherence Comparison</h4>
      ${buildAdherenceHTML(med, allDoses)}
    </div>

    <div class="dose-exp-section dose-exp-full-hist">
      <h4 class="dose-exp-title">All History&ensp;<span class="dose-hist-count">${allDoses.length > 60 ? `latest 60 of ${allDoses.length}` : `${allDoses.length} entries`}</span></h4>
      <div class="hist-mini-list">${histItems || '<p style="color:var(--md-sys-color-on-surface-variant);font-size:13px;margin:0">No entries</p>'}</div>
    </div>
  </div>`;
}

function expRow(label, value) {
  if (value == null || value === '') return '';
  return `<div class="exp-row">
    <span class="exp-lbl">${esc(label)}</span>
    <span class="exp-val">${esc(String(value))}</span>
  </div>`;
}

// ── Delete dialog ─────────────────────────────────────────────────────────────
function openDeleteDialog(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med) return;
  _pendingDeleteId = medId;
  document.getElementById('delete-med-name').textContent = med.name;
  document.getElementById('delete-dialog').show();
}

async function confirmDelete() {
  if (!_pendingDeleteId) return;
  await deleteMedication(_pendingDeleteId);
  medications = medications.filter(m => m.id !== _pendingDeleteId);
  _pendingDeleteId = null;
  document.getElementById('delete-dialog').close();
  renderGrid();
  showToast('Medication deleted');
}

// ── Settings dialog ───────────────────────────────────────────────────────────
async function openSettingsDialog() {
  const theme     = await getSetting('theme', 'auto');
  const encOn     = await getSetting('encryptionEnabled', false);
  const onlineOn  = await getSetting('onlineLookupEnabled', false);
  document.getElementById('settings-theme-select').value      = theme;
  document.getElementById('settings-enc-switch').selected     = encOn;
  document.getElementById('settings-notif-switch').selected   = notificationsGranted();
  const onlineSw = document.getElementById('settings-online-switch');
  if (onlineSw) onlineSw.selected = onlineOn;
  document.getElementById('settings-dialog').show();
}

async function saveSettings() {
  const theme     = document.getElementById('settings-theme-select').value;
  const encOn     = document.getElementById('settings-enc-switch').selected;
  const curEnc    = await getSetting('encryptionEnabled', false);
  const onlineOn  = document.getElementById('settings-online-switch')?.selected ?? false;
  const curOnline = await getSetting('onlineLookupEnabled', false);

  await setSetting('theme', theme);
  applyTheme(theme);

  if (document.getElementById('settings-notif-switch')?.selected && !notificationsGranted()) {
    await requestNotificationPermission();
  }

  if (onlineOn && !curOnline) {
    // Defer to the disclosure dialog — the setting isn't persisted until the
    // user explicitly confirms what may be sent to the online lookup.
    document.getElementById('settings-dialog').close();
    openOnlineLookupConfirmDialog();
    return;
  } else if (!onlineOn && curOnline) {
    await setSetting('onlineLookupEnabled', false);
    showToast('Online lookup disabled');
  }

  if (encOn && !curEnc) {
    // Defer to the PIN dialog to capture and confirm a PIN.
    document.getElementById('settings-dialog').close();
    openPinSetDialog();
    return;
  } else if (!encOn && curEnc) {
    await setSetting('encryptionEnabled', false);
    encKey = null;
    showToast('Encryption disabled');
  }

  document.getElementById('settings-dialog').close();
}

// ── Online lookup disclosure dialog ─────────────────────────────────────────
function openOnlineLookupConfirmDialog() {
  document.getElementById('online-lookup-confirm-dialog').show();
}

async function confirmOnlineLookup() {
  await setSetting('onlineLookupEnabled', true);
  document.getElementById('online-lookup-confirm-dialog').close();
  showToast('Online lookup enabled');
}

function cancelOnlineLookup() {
  document.getElementById('online-lookup-confirm-dialog').close();
  const sw = document.getElementById('settings-online-switch');
  if (sw) sw.selected = false;
  showToast('Online lookup not enabled', 'error');
}

// ── PIN setup dialog (replaces blocking prompt() calls) ─────────────────────────
function openPinSetDialog() {
  const dlg = document.getElementById('pin-set-dialog');
  document.getElementById('pin-set-input').value = '';
  document.getElementById('pin-set-confirm').value = '';
  document.getElementById('pin-set-error').hidden = true;
  dlg.show();
  setTimeout(() => document.getElementById('pin-set-input').focus(), 100);
}

async function confirmPinSet() {
  const pin     = document.getElementById('pin-set-input').value;
  const confirm = document.getElementById('pin-set-confirm').value;
  const errEl   = document.getElementById('pin-set-error');

  const fail = msg => { errEl.textContent = msg; errEl.hidden = false; };

  if (!pin || pin.length < 4) return fail('PIN must be at least 4 digits.');
  if (pin !== confirm)        return fail('PINs do not match.');

  const { key, saltHex, ivHex, verifyHex } = await setupEncryption(pin);
  encKey = key;
  await setSetting('encryptionEnabled', true);
  await setSetting('encSalt',   saltHex);
  await setSetting('encIv',     ivHex);
  await setSetting('encVerify', verifyHex);
  document.getElementById('pin-set-dialog').close();
  showToast('Encryption enabled');
}

function cancelPinSet() {
  document.getElementById('pin-set-dialog').close();
  const sw = document.getElementById('settings-enc-switch');
  if (sw) sw.selected = false;
  showToast('Encryption not enabled', 'error');
}

// ── PIN screen ────────────────────────────────────────────────────────────────
function setupPinScreen() {
  document.getElementById('btn-pin-submit').addEventListener('click', submitPin);
  document.getElementById('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });
}

async function submitPin() {
  const pin     = document.getElementById('pin-input').value;
  const saltHex = await getSetting('encSalt');
  const ivHex   = await getSetting('encIv');
  const verify  = await getSetting('encVerify');
  const key     = await unlockWithPin(pin, saltHex, ivHex, verify);
  if (!key) {
    document.getElementById('pin-error').hidden = false;
    document.getElementById('pin-input').value  = '';
    return;
  }
  encKey = key;
  document.getElementById('pin-error').hidden = true;
  await loadAndRender();
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
function setupAutocomplete(inputId, listId, items) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);
  if (!input || !list) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    if (q.length < 1) { list.hidden = true; return; }
    const hits = items.filter(s => s.toLowerCase().includes(q)).slice(0, 8);
    if (!hits.length) { list.hidden = true; return; }
    list.innerHTML = hits.map(h => `<li class="ac-item" tabindex="-1">${esc(h)}</li>`).join('');
    list.hidden = false;
    list.querySelectorAll('.ac-item').forEach(li => {
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = li.textContent;
        list.hidden = true;
        input.dispatchEvent(new Event('change'));
        if (inputId === 'field-name')       autoFillGenericName(li.textContent);
        if (inputId === 'field-prescriber') crossFillFromPrescriber(li.textContent);
        if (inputId === 'field-pharmacy')   crossFillFromPharmacy(li.textContent);
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 200));
}

async function setupDynamicAutocomplete(inputId, listId, settingKey) {
  const stored = await getSetting(settingKey, '[]');
  let items;
  try { items = JSON.parse(stored); } catch { items = []; }
  setupAutocomplete(inputId, listId, items);
}

function autoFillGenericName(typedName) {
  // The local dataset stores each entry under its generic name with brand
  // names as aliases, so the "generic" for a matched brand is entry.name.
  const entry = lookupByNameOrAlias(typedName);
  if (!entry) return;
  const generic = entry.genericName || entry.name;
  if (!generic || generic.toLowerCase() === typedName.trim().toLowerCase()) return;
  const el = document.getElementById('field-generic-name');
  if (el && !el.value) {
    el.value = generic;
    markInferred('generic-name', 1, 'Generic name');
  }
}

// Cross-fills phone numbers for a prescriber/pharmacy picked from autocomplete,
// using contact details remembered from past entries of the same name.
async function crossFillFromPrescriber(name) {
  const raw = await getSetting('ac-prescriber-details', '{}');
  let map; try { map = JSON.parse(raw); } catch { map = {}; }
  const detail = map[(name || '').toLowerCase()];
  const phoneEl = document.getElementById('field-prescriber-phone');
  if (detail?.phone && phoneEl && !phoneEl.value) {
    phoneEl.value = detail.phone;
    markInferred('prescriber-phone', 1, 'Physician phone');
  }
}

async function crossFillFromPharmacy(name) {
  const raw = await getSetting('ac-pharmacy-details', '{}');
  let map; try { map = JSON.parse(raw); } catch { map = {}; }
  const detail = map[(name || '').toLowerCase()];
  const phoneEl = document.getElementById('field-pharmacy-phone');
  if (detail?.phone && phoneEl && !phoneEl.value) {
    phoneEl.value = detail.phone;
    markInferred('pharmacy-phone', 1, 'Pharmacy phone');
  }
}

async function saveAutocompleteHistory(prescriber, pharmacy, prescriberPhone, pharmacyPhone) {
  const saveName = async (key, value) => {
    if (!value) return;
    const raw = await getSetting(key, '[]');
    let list;
    try { list = JSON.parse(raw); } catch { list = []; }
    if (!list.includes(value)) { list.unshift(value); list = list.slice(0, 20); }
    await setSetting(key, JSON.stringify(list));
  };
  const saveDetail = async (key, name, phone) => {
    if (!name || !phone) return;
    const raw = await getSetting(key, '{}');
    let map;
    try { map = JSON.parse(raw); } catch { map = {}; }
    map[name.toLowerCase()] = { phone };
    await setSetting(key, JSON.stringify(map));
  };
  await saveName('ac-prescribers', prescriber);
  await saveName('ac-pharmacies', pharmacy);
  await saveDetail('ac-prescriber-details', prescriber, prescriberPhone);
  await saveDetail('ac-pharmacy-details', pharmacy, pharmacyPhone);
}

// ── Color picker ──────────────────────────────────────────────────────────────
function renderColorPicker() {
  const container = document.getElementById('color-picker');
  if (!container) return;
  container.innerHTML = ACCENT_COLORS.map((c, i) => `
    <label class="color-swatch" title="${c.label}" style="--swatch-color: ${c.value}">
      <input type="radio" name="med-color" value="${c.value}" ${i === 0 ? 'checked' : ''}>
      <span class="swatch-circle"></span>
    </label>`).join('');
}

// ── Event bindings ────────────────────────────────────────────────────────────
let _eventsBound = false;

function bindEvents() {
  if (_eventsBound) return;
  _eventsBound = true;

  // Close any open card menu when clicking elsewhere
  document.addEventListener('click', closeAllCardMenus);

  // FAB
  document.getElementById('fab-add').addEventListener('click', () => openMedDialog());

  // Empty-state onboarding actions
  document.getElementById('btn-empty-add')?.addEventListener('click', () => openMedDialog());
  document.getElementById('btn-empty-pin')?.addEventListener('click', () => openPinSetDialog());

  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Sort menu
  document.getElementById('btn-sort').addEventListener('click', () => {
    document.getElementById('sort-menu').open = true;
  });
  document.querySelectorAll('#sort-menu md-menu-item').forEach(item => {
    item.addEventListener('click', () => { sortBy = item.dataset.sort; renderGrid(); });
  });

  // Search
  document.getElementById('btn-search').addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    bar.hidden = !bar.hidden;
    if (!bar.hidden) document.getElementById('search-input').focus();
    else { searchQuery = ''; document.getElementById('search-input').value = ''; renderGrid(); }
  });
  document.getElementById('btn-search-close').addEventListener('click', () => {
    document.getElementById('search-bar').hidden = true;
    searchQuery = '';
    document.getElementById('search-input').value = '';
    renderGrid();
  });
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderGrid();
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettingsDialog);

  // Med dialog
  document.getElementById('btn-med-save').addEventListener('click', saveMedHandler);
  document.getElementById('btn-med-cancel').addEventListener('click', () => document.getElementById('med-dialog').close());

  // Quick add (natural-language autofill)
  document.getElementById('field-quickadd')?.addEventListener('input', () => {
    clearTimeout(_quickAddTimer);
    _quickAddTimer = setTimeout(handleQuickAddParse, 500);
  });
  document.getElementById('field-quickadd')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(_quickAddTimer);
      handleQuickAddParse();
    }
  });

  // Confirm-guesses dialog (save-time gate for unreviewed quick-add guesses)
  document.getElementById('btn-confirm-guess-save')?.addEventListener('click', async () => {
    if (_pendingSaveData) await performMedSave(_pendingSaveData);
  });
  document.getElementById('btn-confirm-guess-edit')?.addEventListener('click', () => {
    document.getElementById('confirm-guess-dialog').close();
    _pendingSaveData = null;
  });

  // Auto-fill refill date
  ['field-fill-date','field-days-supply'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const fillDate = document.getElementById('field-fill-date')?.value;
      const days     = parseNum(document.getElementById('field-days-supply')?.value, null);
      if (fillDate && days) {
        const d = new Date(fillDate); d.setDate(d.getDate() + days);
        const el = document.getElementById('field-refill-date');
        if (el && !el.dataset.manualEdit) el.value = d.toISOString().split('T')[0];
      }
    });
  });
  document.getElementById('field-refill-date')?.addEventListener('input', e => { e.target.dataset.manualEdit = '1'; });

  document.getElementById('field-qty-per-dose')?.addEventListener('change', () => {
    const perDose = parseNum(document.getElementById('field-qty-per-dose')?.value, 1);
    const el = document.getElementById('field-low-stock');
    if (el && !el.value) el.value = perDose * 7;
  });

  // Reminders
  document.getElementById('btn-add-reminder').addEventListener('click', () => addReminderRow());
  document.getElementById('switch-tracking').addEventListener('change', e => {
    document.getElementById('tracking-options').hidden = !e.target.selected;
  });

  // Refill dialog
  document.getElementById('btn-refill-confirm').addEventListener('click', confirmRefill);
  document.getElementById('btn-refill-cancel').addEventListener('click', () => {
    document.getElementById('refill-dialog').close();
    _pendingRefillId = null;
  });

  // History page
  document.getElementById('btn-hist-back').addEventListener('click', closeHistoryPage);

  // Delete dialog
  document.getElementById('btn-delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('btn-delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-dialog').close();
    _pendingDeleteId = null;
  });

  // Settings dialog
  document.getElementById('btn-settings-save').addEventListener('click', saveSettings);
  document.getElementById('btn-settings-close').addEventListener('click', () => document.getElementById('settings-dialog').close());

  // Online-lookup disclosure dialog
  document.getElementById('btn-online-lookup-confirm')?.addEventListener('click', confirmOnlineLookup);
  document.getElementById('btn-online-lookup-cancel')?.addEventListener('click', cancelOnlineLookup);

  // PIN setup dialog
  document.getElementById('btn-pin-set-confirm').addEventListener('click', confirmPinSet);
  document.getElementById('btn-pin-set-cancel').addEventListener('click', cancelPinSet);
  document.getElementById('pin-set-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') confirmPinSet(); });

  // Export / import
  document.getElementById('btn-export').addEventListener('click', exportAllData);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importData(text);
      medications = await getMedications();
      renderGrid();
      showToast('Data imported successfully');
    } catch (err) { showToast('Import failed: ' + err.message, 'error'); }
    e.target.value = '';
  });

  // Notifications
  document.getElementById('settings-notif-switch')?.addEventListener('change', async e => {
    if (e.target.selected) {
      const granted = await requestNotificationPermission();
      if (!granted) { e.target.selected = false; showToast('Notification permission denied', 'error'); }
    }
  });

  // Autocomplete
  setupAutocomplete('field-name', 'name-suggestions', DRUG_NAMES);
  setupAutocomplete('field-strength', 'strength-suggestions', STRENGTHS);
  setupAutocomplete('field-unit', 'unit-suggestions', UNITS);
  setupDynamicAutocomplete('field-prescriber', 'prescriber-suggestions', 'ac-prescribers');
  setupDynamicAutocomplete('field-pharmacy',   'pharmacy-suggestions',   'ac-pharmacies');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showElement(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hideElement(id) { const el = document.getElementById(id); if (el) el.hidden = true; }
function setField(id, val) { const el = document.getElementById(`field-${id}`); if (el && val != null) el.value = val; }
function parseNum(str, fallback) { const n = Number(str); return Number.isFinite(n) ? n : fallback; }
function today() { return new Date().toISOString().split('T')[0]; }

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function daysUntilRefill(med) {
  if (!med.refillDate) return null;
  return Math.ceil((new Date(med.refillDate) - new Date()) / 86_400_000);
}

let _toastTimer = null;
function showToast(msg, type = 'info') {
  let snack = document.getElementById('snackbar');
  if (!snack) {
    snack = document.createElement('div');
    snack.id = 'snackbar';
    document.body.appendChild(snack);
  }
  snack.textContent = msg;
  snack.className   = `snackbar snackbar-${type} snackbar-visible`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { snack.className = 'snackbar'; }, 3500);
}
