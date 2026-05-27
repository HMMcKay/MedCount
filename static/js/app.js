import { getMedications, getMedication, saveMedication, deleteMedication, getLastTakeDose, getSetting, setSetting } from './db.js';
import { setupEncryption, unlockWithPin } from './crypto.js';
import { recordTake, recordAddOne, recordRefill, getHistory, exportAllData, importData, printHistory } from './history.js';
import { initReminders, stopReminders, requestNotificationPermission, notificationsGranted, checkAndFireReminders } from './reminders.js';

// ── State ────────────────────────────────────────────────────────────────────
let medications  = [];
let filterCat    = null;   // null = All
let sortBy       = 'name';
let encKey       = null;
let editingId    = null;   // null = adding
let swReg        = null;
let _pendingDeleteId = null;
let _doseReminderCount = 0; // tracks current reminder time entries in form

// ── Constants ────────────────────────────────────────────────────────────────
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

const DRUG_NAMES = [
  'Lisinopril','Atorvastatin','Metoprolol','Amlodipine','Losartan','Metformin',
  'Hydrochlorothiazide','Furosemide','Carvedilol','Simvastatin','Rosuvastatin',
  'Ibuprofen','Naproxen','Acetaminophen','Aspirin','Celecoxib','Tramadol',
  'Gabapentin','Pregabalin','Amoxicillin','Azithromycin','Ciprofloxacin',
  'Doxycycline','Metronidazole','Trimethoprim','Cephalexin','Clindamycin',
  'Sertraline','Escitalopram','Fluoxetine','Paroxetine','Venlafaxine',
  'Duloxetine','Bupropion','Aripiprazole','Quetiapine','Alprazolam',
  'Lorazepam','Clonazepam','Zolpidem','Trazodone','Buspirone','Mirtazapine',
  'Glipizide','Glimepiride','Sitagliptin','Empagliflozin','Insulin',
  'Insulin Glargine','Insulin Aspart','Levothyroxine','Liothyronine',
  'Albuterol','Fluticasone','Montelukast','Tiotropium','Budesonide',
  'Ipratropium','Prednisone','Methylprednisolone','Omeprazole','Pantoprazole',
  'Esomeprazole','Famotidine','Ondansetron','Loperamide','Bisacodyl','Docusate',
  'Topiramate','Lamotrigine','Levetiracetam','Valproic Acid','Donepezil',
  'Memantine','Carbidopa-Levodopa','Estradiol','Progesterone','Testosterone',
  'Warfarin','Rivaroxaban','Apixaban','Clopidogrel','Tamsulosin','Finasteride',
  'Oxybutynin','Colchicine','Allopurinol','Hydroxychloroquine','Tacrolimus',
  'Cetirizine','Loratadine','Fexofenadine','Diphenhydramine','Hydroxyzine',
  'Latanoprost','Timolol','Triamcinolone','Hydrocortisone','Tretinoin',
  'Hydrocodone','Oxycodone','Codeine','Morphine','Buprenorphine',
  'Vitamin D','Vitamin B12','Folic Acid','Iron Sulfate','Calcium Carbonate',
  'Omega-3 Fish Oil','Magnesium','Zinc','Multivitamin',
  'Tylenol','Advil','Aleve','Benadryl','Claritin','Zyrtec',
  'Pepcid','Prilosec','Nexium','Tums','MiraLax','Dulcolax','Imodium',
];

const STRENGTHS = ['1mg','2mg','2.5mg','5mg','10mg','12.5mg','20mg','25mg',
  '40mg','50mg','75mg','100mg','150mg','200mg','250mg','300mg','400mg',
  '500mg','600mg','750mg','1000mg','5mcg','10mcg','25mcg','50mcg','100mcg',
  '1mL','2mL','5mL','10mL','15mL','20mL','30mL',
  '0.5%','1%','2%','5%','10%'];

const UNITS = ['tablets','capsules','pills','mL','mg','mcg','drops','patches',
  'puffs','units','IU','sprays','suppositories','lozenges'];

// ── Bootstrap ────────────────────────────────────────────────────────────────
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
  // Attach last-taken timestamps
  for (const med of medications) {
    const last = await getLastTakeDose(med.id);
    med._lastTaken = last ? last.timestamp : null;
  }
  renderGrid();
  hideElement('pin-screen');
  showElement('app');
  bindEvents();
}

// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  if (theme === 'dark')  root.setAttribute('data-theme', 'dark');
}

// ── Grid ─────────────────────────────────────────────────────────────────────
function renderGrid() {
  const grid  = document.getElementById('med-grid');
  const empty = document.getElementById('empty-state');

  let list = [...medications];
  if (filterCat) list = list.filter(m => m.category === filterCat);

  list.sort((a, b) => {
    if (sortBy === 'quantity')   return (a.quantity ?? 0) - (b.quantity ?? 0);
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

function cardHTML(med) {
  const fill       = med.fillQuantity > 0 ? med.fillQuantity : (med.quantity || 1);
  const progress   = Math.max(0, Math.min(1, (med.quantity ?? 0) / fill));
  const isLow      = (med.quantity ?? 0) <= (med.lowStockThreshold ?? 0);
  const isExpired  = med.expirationDate && new Date(med.expirationDate) < new Date();
  const daysRefill = daysUntilRefill(med);
  const catColor   = CAT_COLORS[med.category] ?? CAT_COLORS['Other'];
  const accentHex  = med.color ?? '#006B5E';

  const progressClass = isLow ? 'progress-bar low' : 'progress-bar';
  const progressStyle = `--progress: ${progress}; --accent: ${accentHex};`;

  let refillBadge = '';
  if (daysRefill !== null) {
    if (daysRefill < 0)  refillBadge = `<span class="badge badge-error">Refill overdue</span>`;
    else if (daysRefill <= 7) refillBadge = `<span class="badge badge-warn">Refill in ${daysRefill}d</span>`;
    else refillBadge = `<span class="badge badge-ok">Refill ${formatDate(med.refillDate)}</span>`;
  }
  if (isExpired) refillBadge += `<span class="badge badge-error">Expired</span>`;

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
        <md-icon-button class="card-menu-btn" aria-label="Options">
          <md-icon>more_vert</md-icon>
        </md-icon-button>
        <md-menu class="card-menu">
          <md-menu-item data-action="edit">
            <md-icon slot="start">edit</md-icon>
            <div slot="headline">Edit medication</div>
          </md-menu-item>
          <md-menu-item data-action="history">
            <md-icon slot="start">history</md-icon>
            <div slot="headline">Dose history</div>
          </md-menu-item>
          <md-menu-item data-action="refill">
            <md-icon slot="start">local_pharmacy</md-icon>
            <div slot="headline">Log refill</div>
          </md-menu-item>
          <md-divider></md-divider>
          <md-menu-item data-action="delete" class="danger-item">
            <md-icon slot="start">delete_outline</md-icon>
            <div slot="headline">Delete</div>
          </md-menu-item>
        </md-menu>
      </div>
    </div>

    <div class="card-qty">
      <div class="${progressClass}" style="${progressStyle}">
        <div class="progress-fill"></div>
      </div>
      <span class="qty-label ${isLow ? 'qty-low' : ''}">${med.quantity ?? 0} ${esc(unit)}</span>
    </div>

    <div class="card-badges">${refillBadge}${isLow ? '<span class="badge badge-warn">Low stock</span>' : ''}</div>

    ${med.fillDate ? `<p class="card-meta"><md-icon>calendar_today</md-icon> Filled ${formatDate(med.fillDate)}</p>` : ''}
    ${lastTakenStr  ? `<p class="card-meta"><md-icon>schedule</md-icon> Last taken ${lastTakenStr}</p>` : ''}

    <div class="card-actions">
      <md-filled-button class="btn-take" data-med-id="${med.id}" ?disabled="${(med.quantity ?? 0) <= 0}">
        <md-icon slot="icon">remove</md-icon>
        Take${med.quantityPerDose > 1 ? ` (${med.quantityPerDose})` : ''}
      </md-filled-button>
      <md-tonal-icon-button class="btn-add-one" data-med-id="${med.id}" aria-label="Add one back">
        <md-icon>add</md-icon>
      </md-tonal-icon-button>
    </div>
  </article>`;
}

function attachCardEvents(el) {
  const medId = Number(el.dataset.medId);

  el.querySelector('.btn-take')?.addEventListener('click', () => handleTake(medId));
  el.querySelector('.btn-add-one')?.addEventListener('click', () => handleAddOne(medId));

  const menuBtn  = el.querySelector('.card-menu-btn');
  const menu     = el.querySelector('.card-menu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.open = !menu.open; });
    menu.addEventListener('close-menu', () => {});
    menu.querySelectorAll('md-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'edit')    openMedDialog(medId);
        if (action === 'history') openHistoryDialog(medId);
        if (action === 'refill')  openRefillDialog(medId);
        if (action === 'delete')  openDeleteDialog(medId);
      });
    });
  }
}

// ── Filter chips ─────────────────────────────────────────────────────────────
function renderFilterChips() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const cats   = [...new Set(medications.map(m => m.category).filter(Boolean))].sort();
  const allCats = ['All', ...cats];

  bar.innerHTML = allCats.map(cat => {
    const selected = (cat === 'All' && !filterCat) || cat === filterCat;
    return `<md-filter-chip label="${esc(cat)}" ${selected ? 'selected' : ''} data-cat="${esc(cat)}"></md-filter-chip>`;
  }).join('');

  bar.querySelectorAll('md-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      filterCat = cat === 'All' ? null : cat;
      renderGrid();
    });
  });
}

// ── Take / Add one ───────────────────────────────────────────────────────────
async function handleTake(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med || (med.quantity ?? 0) <= 0) return;

  const newQty = await recordTake(med);
  await saveMedication({ ...med, quantity: newQty });
  med.quantity  = newQty;
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

function updateCardQty(medId, newQty, med) {
  const card = document.querySelector(`.med-card[data-med-id="${medId}"]`);
  if (!card) return;
  const fill    = med.fillQuantity > 0 ? med.fillQuantity : (newQty || 1);
  const progress = Math.max(0, Math.min(1, newQty / fill));
  const isLow   = newQty <= (med.lowStockThreshold ?? 0);

  const bar = card.querySelector('.progress-bar');
  if (bar) { bar.style.setProperty('--progress', progress); bar.classList.toggle('low', isLow); }

  const label = card.querySelector('.qty-label');
  if (label) {
    label.textContent = `${newQty} ${med.unit || 'left'}`;
    label.classList.toggle('qty-low', isLow);
  }

  const takeBtn = card.querySelector('.btn-take');
  if (takeBtn) takeBtn.disabled = newQty <= 0;

  const badgesEl = card.querySelector('.card-badges');
  if (badgesEl) {
    let html = '';
    const days = daysUntilRefill(med);
    if (days !== null) {
      if (days < 0)        html += `<span class="badge badge-error">Refill overdue</span>`;
      else if (days <= 7)  html += `<span class="badge badge-warn">Refill in ${days}d</span>`;
    }
    if (isLow) html += `<span class="badge badge-warn">Low stock</span>`;
    badgesEl.innerHTML = html;
  }

  const metaEl = card.querySelector('.card-meta');
  if (metaEl) {
    const ts = card.querySelector('p.card-meta md-icon');
    if (ts && ts.textContent.trim() === 'schedule') {
      metaEl.innerHTML = `<md-icon>schedule</md-icon> Last taken ${timeAgo(Date.now())}`;
    }
  }
}

// ── Add / Edit Medication dialog ─────────────────────────────────────────────
async function openMedDialog(medId = null) {
  editingId = medId;
  const dialog    = document.getElementById('med-dialog');
  const headline  = document.getElementById('med-dialog-headline');
  headline.textContent = medId ? 'Edit Medication' : 'Add Medication';

  resetMedForm();
  renderColorPicker();

  if (medId) {
    const med = medications.find(m => m.id === medId);
    if (med) populateMedForm(med);
  } else {
    // Default fill date to today
    setField('fill-date', today());
  }
  dialog.show();
}

function resetMedForm() {
  document.getElementById('med-form').reset();
  document.getElementById('dose-reminders-list').innerHTML = '';
  _doseReminderCount = 0;
  document.getElementById('tracking-options').hidden = true;
  document.getElementById('switch-tracking').selected = false;
}

function populateMedForm(med) {
  const set = (id, val) => { const el = document.getElementById(`field-${id}`); if (el && val != null) el.value = val; };
  set('name',         med.name);
  set('generic-name', med.genericName);
  set('strength',     med.strength);
  set('form',         med.form);
  set('category',     med.category);
  set('quantity',     med.quantity);
  set('qty-per-dose', med.quantityPerDose ?? 1);
  set('unit',         med.unit);
  set('days-supply',  med.daysSupply);
  set('low-stock',    med.lowStockThreshold);
  set('fill-date',    med.fillDate);
  set('refill-date',  med.refillDate);
  set('expiry-date',  med.expirationDate);
  set('prescriber',   med.prescriber);
  set('pharmacy',     med.pharmacy);
  set('rx',           med.rxNumber);
  set('sig',          med.sig);
  set('notes',        med.notes);
  set('refill-alert', med.reminders?.refillAlertDays ?? 7);

  // Color picker
  if (med.color) {
    const radio = document.querySelector(`input[name="med-color"][value="${med.color}"]`);
    if (radio) radio.checked = true;
  }

  // Reminders
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

async function saveMedHandler() {
  const form = document.getElementById('med-form');
  if (!form.reportValidity()) return;

  const get = id => {
    const el = document.getElementById(`field-${id}`);
    return el ? el.value.trim() : '';
  };

  const reminders = buildReminders();
  const data = {
    name:             get('name'),
    genericName:      get('generic-name'),
    strength:         get('strength'),
    form:             get('form'),
    category:         get('category') || 'Other',
    quantity:         parseNum(get('quantity'), 0),
    quantityPerDose:  parseNum(get('qty-per-dose'), 1),
    unit:             get('unit') || 'pills',
    daysSupply:       parseNum(get('days-supply'), null),
    lowStockThreshold: parseNum(get('low-stock'), 0),
    fillDate:         get('fill-date') || null,
    refillDate:       get('refill-date') || null,
    expirationDate:   get('expiry-date') || null,
    prescriber:       get('prescriber'),
    pharmacy:         get('pharmacy'),
    rxNumber:         get('rx'),
    sig:              get('sig'),
    notes:            get('notes'),
    color:            document.querySelector('input[name="med-color"]:checked')?.value ?? '#006B5E',
    reminders,
  };

  if (!data.name) { showToast('Medication name is required', 'error'); return; }

  if (editingId) {
    const existing = medications.find(m => m.id === editingId);
    if (existing && data.quantity > existing.quantity) {
      data.fillQuantity = data.quantity;
    }
    data.id = editingId;
  }

  await saveMedication(data);
  document.getElementById('med-dialog').close();
  medications = await getMedications();
  for (const med of medications) {
    const last = await getLastTakeDose(med.id);
    med._lastTaken = last ? last.timestamp : null;
  }
  renderGrid();
  showToast(editingId ? 'Medication updated' : `${data.name} added`);
  saveAutocompleteHistory(data.prescriber, data.pharmacy);
}

function buildReminders() {
  const refillDays = parseNum(document.getElementById('field-refill-alert')?.value, null);
  const trackOn    = document.getElementById('switch-tracking')?.selected ?? false;
  const trackH     = parseNum(document.getElementById('field-tracking-hours')?.value, 12);

  const doseRows = document.querySelectorAll('.reminder-row');
  const doseAlerts = [];
  doseRows.forEach(row => {
    const time = row.querySelector('.reminder-time')?.value;
    if (!time) return;
    const days = [];
    row.querySelectorAll('.day-chip input:checked').forEach(cb => days.push(Number(cb.value)));
    doseAlerts.push({ time, days: days.length === 7 ? [0,1,2,3,4,5,6] : days });
  });

  return {
    doseAlerts,
    refillAlertDays: refillDays,
    trackingAlert: { enabled: trackOn, maxHoursSinceDose: trackH },
  };
}

function addReminderRow(time = '08:00', days = [0,1,2,3,4,5,6]) {
  const list  = document.getElementById('dose-reminders-list');
  const idx   = _doseReminderCount++;
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const row = document.createElement('div');
  row.className = 'reminder-row';
  row.innerHTML = `
    <input type="time" class="reminder-time" value="${time}">
    <div class="day-chips">
      ${dayNames.map((d, i) => `
        <label class="day-chip">
          <input type="checkbox" value="${i}" ${days.includes(i) ? 'checked' : ''}>
          <span>${d}</span>
        </label>`).join('')}
    </div>
    <md-icon-button class="btn-remove-reminder" aria-label="Remove">
      <md-icon>close</md-icon>
    </md-icon-button>`;

  row.querySelector('.btn-remove-reminder').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

// ── Refill dialog ─────────────────────────────────────────────────────────────
async function openRefillDialog(medId) {
  const med   = medications.find(m => m.id === medId);
  if (!med) return;

  const qty = prompt(`Refill ${med.name}\nEnter new quantity:`, med.quantity ?? 0);
  if (qty === null) return;
  const newQty = parseNum(qty, null);
  if (newQty === null || newQty < 0) { showToast('Invalid quantity', 'error'); return; }

  const newFill = today();
  const refill  = med.daysSupply
    ? (() => { const d = new Date(newFill); d.setDate(d.getDate() + med.daysSupply); return d.toISOString().split('T')[0]; })()
    : med.refillDate;

  const updatedMed = { ...med, quantity: newQty, fillQuantity: newQty, fillDate: newFill, refillDate: refill };
  await recordRefill(med, newQty);
  await saveMedication(updatedMed);

  const idx = medications.findIndex(m => m.id === medId);
  medications[idx] = updatedMed;
  renderGrid();
  showToast(`${med.name} refilled — ${newQty} ${med.unit || 'pills'}`);
}

// ── History dialog ────────────────────────────────────────────────────────────
async function openHistoryDialog(medId) {
  const med = medications.find(m => m.id === medId);
  if (!med) return;

  const dialog  = document.getElementById('history-dialog');
  document.getElementById('history-title').textContent = med.name;

  const doses   = await getHistory(medId, { limit: 100 });
  const tbody   = document.getElementById('history-tbody');

  if (doses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No history recorded yet</td></tr>';
  } else {
    tbody.innerHTML = doses.map(d => {
      const dt     = new Date(d.timestamp);
      const label  = { take: 'Took dose', add: 'Added back', refill: 'Refill', edit: 'Edited' }[d.action] ?? d.action;
      const delta  = d.quantityAfter - d.quantityBefore;
      return `<tr>
        <td>${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${label}</td>
        <td class="${delta < 0 ? 'neg' : 'pos'}">${delta > 0 ? '+' : ''}${delta}</td>
        <td>${d.quantityAfter}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('btn-history-print').onclick  = () => printHistory(medId, med.name);
  document.getElementById('btn-history-export').onclick = () => exportAllData();
  dialog.show();
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
  const dialog = document.getElementById('settings-dialog');
  const theme  = await getSetting('theme', 'auto');
  const encOn  = await getSetting('encryptionEnabled', false);

  document.getElementById('settings-theme-select').value = theme;
  document.getElementById('settings-enc-switch').selected = encOn;
  dialog.show();
}

async function saveSettings() {
  const theme  = document.getElementById('settings-theme-select').value;
  const encOn  = document.getElementById('settings-enc-switch').selected;
  const curEnc = await getSetting('encryptionEnabled', false);

  await setSetting('theme', theme);
  applyTheme(theme);

  if (encOn && !curEnc) {
    const pin = prompt('Set a PIN for encryption (minimum 4 digits):');
    if (!pin || pin.length < 4) { showToast('PIN too short — encryption not enabled', 'error'); return; }
    const confirm = prompt('Confirm PIN:');
    if (pin !== confirm) { showToast('PINs do not match', 'error'); return; }

    const { key, saltHex, ivHex, verifyHex } = await setupEncryption(pin);
    encKey = key;
    await setSetting('encryptionEnabled', true);
    await setSetting('encSalt',  saltHex);
    await setSetting('encIv',    ivHex);
    await setSetting('encVerify', verifyHex);
    showToast('Encryption enabled');
  } else if (!encOn && curEnc) {
    await setSetting('encryptionEnabled', false);
    encKey = null;
    showToast('Encryption disabled');
  }

  if (notificationsGranted() === false && document.getElementById('settings-notif-switch')?.selected) {
    await requestNotificationPermission();
  }

  document.getElementById('settings-dialog').close();
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

  const key = await unlockWithPin(pin, saltHex, ivHex, verify);
  if (!key) {
    document.getElementById('pin-error').hidden = false;
    document.getElementById('pin-input').value = '';
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
    if (hits.length === 0) { list.hidden = true; return; }
    list.innerHTML = hits.map(h => `<li class="ac-item" tabindex="-1">${esc(h)}</li>`).join('');
    list.hidden = false;
    list.querySelectorAll('.ac-item').forEach(li => {
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = li.textContent;
        list.hidden = true;
        input.dispatchEvent(new Event('change'));
        if (inputId === 'field-name') autoFillGenericName(li.textContent);
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

function autoFillGenericName(brandName) {
  const brand2generic = { 'Tylenol': 'Acetaminophen', 'Advil': 'Ibuprofen', 'Motrin': 'Ibuprofen',
    'Aleve': 'Naproxen', 'Benadryl': 'Diphenhydramine', 'Claritin': 'Loratadine',
    'Zyrtec': 'Cetirizine', 'Prilosec': 'Omeprazole', 'Nexium': 'Esomeprazole',
    'Pepcid': 'Famotidine', 'MiraLax': 'Polyethylene Glycol 3350', 'Dulcolax': 'Bisacodyl', };
  const generic = brand2generic[brandName];
  if (generic) {
    const el = document.getElementById('field-generic-name');
    if (el && !el.value) el.value = generic;
  }
}

async function saveAutocompleteHistory(prescriber, pharmacy) {
  const saveToList = async (key, value) => {
    if (!value) return;
    const raw  = await getSetting(key, '[]');
    let list;
    try { list = JSON.parse(raw); } catch { list = []; }
    if (!list.includes(value)) { list.unshift(value); list = list.slice(0, 20); }
    await setSetting(key, JSON.stringify(list));
  };
  await saveToList('ac-prescribers', prescriber);
  await saveToList('ac-pharmacies',  pharmacy);
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

  // FAB
  document.getElementById('fab-add').addEventListener('click', () => openMedDialog());

  // Sort menu
  document.getElementById('btn-sort').addEventListener('click', () => {
    document.getElementById('sort-menu').open = true;
  });
  document.querySelectorAll('#sort-menu md-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      sortBy = item.dataset.sort;
      renderGrid();
    });
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettingsDialog);

  // Medication dialog actions
  document.getElementById('btn-med-save').addEventListener('click', saveMedHandler);
  document.getElementById('btn-med-cancel').addEventListener('click', () => {
    document.getElementById('med-dialog').close();
  });

  // Auto-fill refill date
  ['field-fill-date', 'field-days-supply'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const fillDate  = document.getElementById('field-fill-date')?.value;
      const days      = parseNum(document.getElementById('field-days-supply')?.value, null);
      if (fillDate && days) {
        const d = new Date(fillDate); d.setDate(d.getDate() + days);
        const el = document.getElementById('field-refill-date');
        if (el && !el.dataset.manualEdit) el.value = d.toISOString().split('T')[0];
      }
    });
  });
  document.getElementById('field-refill-date')?.addEventListener('input', e => {
    e.target.dataset.manualEdit = '1';
  });

  // Auto-fill low-stock threshold from qty per dose
  document.getElementById('field-qty-per-dose')?.addEventListener('change', () => {
    const perDose = parseNum(document.getElementById('field-qty-per-dose')?.value, 1);
    const el      = document.getElementById('field-low-stock');
    if (el && !el.value) el.value = perDose * 7;
  });

  // Add reminder button
  document.getElementById('btn-add-reminder').addEventListener('click', () => addReminderRow());

  // Tracking switch
  document.getElementById('switch-tracking').addEventListener('change', e => {
    document.getElementById('tracking-options').hidden = !e.target.selected;
  });

  // History dialog
  document.getElementById('btn-history-close').addEventListener('click', () => {
    document.getElementById('history-dialog').close();
  });

  // Delete dialog
  document.getElementById('btn-delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('btn-delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-dialog').close();
    _pendingDeleteId = null;
  });

  // Settings dialog
  document.getElementById('btn-settings-save').addEventListener('click', saveSettings);
  document.getElementById('btn-settings-close').addEventListener('click', () => {
    document.getElementById('settings-dialog').close();
  });

  // Export / import in settings
  document.getElementById('btn-export').addEventListener('click', exportAllData);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importData(text);
      medications = await getMedications();
      renderGrid();
      showToast('Data imported successfully');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
    e.target.value = '';
  });

  // Notification permission toggle
  document.getElementById('settings-notif-switch')?.addEventListener('change', async e => {
    if (e.target.selected) {
      const granted = await requestNotificationPermission();
      if (!granted) { e.target.selected = false; showToast('Notification permission denied', 'error'); }
    }
  });

  // Autocomplete setup (runs after dialog is present in DOM)
  setupAutocomplete('field-name', 'name-suggestions', DRUG_NAMES);
  setupAutocomplete('field-strength', 'strength-suggestions', STRENGTHS);
  setupAutocomplete('field-unit', 'unit-suggestions', UNITS);

  // Dynamic autocompletes loaded from history
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
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
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
  snack.className = `snackbar snackbar-${type} snackbar-visible`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { snack.className = 'snackbar'; }, 3500);
}
