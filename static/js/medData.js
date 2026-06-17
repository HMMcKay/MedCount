// Local medication reference dataset — covers the medications most commonly
// tracked by this app's users. Used by medParser.js to power natural-language
// quick-add autofill without any network request. Every field here is only
// ever used to pre-fill a form the user can review and edit; none of it is
// medical advice.
//
// Shape of each entry:
//   name            display / brand name shown in the UI
//   genericName     generic ingredient name (null if `name` already is generic)
//   aliases         lowercase strings (brand names, abbreviations, misspellings)
//                    that should also resolve to this entry
//   category        suggested default for the Category select
//   defaultForm     suggested default for the Form select
//   commonStrengths typical strength options, most-common first
//   typicalUnit     default unit word for the quantity-on-hand field
//   freqHint        well-established default schedule keyword, or null if
//                    there isn't one common enough to assume safely
//   isControlled    true for controlled substances — any guessed (not
//                    explicitly typed) quantity/schedule for these is always
//                    treated as a sensitive, confirmation-required inference
export const MED_DATASET = [
  // ── Cardiovascular ──────────────────────────────────────────────────────
  { name: 'Lisinopril', genericName: null, aliases: ['prinivil','zestril'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['2.5mg','5mg','10mg','20mg','40mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Atorvastatin', genericName: null, aliases: ['lipitor'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['10mg','20mg','40mg','80mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Metoprolol', genericName: null, aliases: ['lopressor','toprol','toprol xl'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg','200mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Amlodipine', genericName: null, aliases: ['norvasc'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['2.5mg','5mg','10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Losartan', genericName: null, aliases: ['cozaar'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Hydrochlorothiazide', genericName: null, aliases: ['hctz','microzide'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['12.5mg','25mg','50mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Furosemide', genericName: null, aliases: ['lasix'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['20mg','40mg','80mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Carvedilol', genericName: null, aliases: ['coreg'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['3.125mg','6.25mg','12.5mg','25mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Simvastatin', genericName: null, aliases: ['zocor'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg','20mg','40mg','80mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Rosuvastatin', genericName: null, aliases: ['crestor'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg','20mg','40mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Warfarin', genericName: null, aliases: ['coumadin'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['1mg','2mg','2.5mg','5mg','10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Rivaroxaban', genericName: null, aliases: ['xarelto'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['10mg','15mg','20mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Apixaban', genericName: null, aliases: ['eliquis'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['2.5mg','5mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Clopidogrel', genericName: null, aliases: ['plavix'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['75mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },

  // ── Pain / inflammation ─────────────────────────────────────────────────
  { name: 'Ibuprofen', genericName: null, aliases: ['advil','motrin'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['200mg','400mg','600mg','800mg'], typicalUnit: 'tablets', freqHint: null, isControlled: false },
  { name: 'Naproxen', genericName: null, aliases: ['aleve','naprosyn'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['220mg','250mg','375mg','500mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Acetaminophen', genericName: null, aliases: ['tylenol','paracetamol'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['325mg','500mg','650mg'], typicalUnit: 'tablets', freqHint: null, isControlled: false },
  { name: 'Aspirin', genericName: null, aliases: ['bayer'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['81mg','325mg','500mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Celecoxib', genericName: null, aliases: ['celebrex'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['100mg','200mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Tramadol', genericName: null, aliases: ['ultram'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['50mg','100mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Gabapentin', genericName: null, aliases: ['neurontin'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['100mg','300mg','400mg','600mg','800mg'], typicalUnit: 'capsules', freqHint: 'three-times-daily', isControlled: false },
  { name: 'Pregabalin', genericName: null, aliases: ['lyrica'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['25mg','50mg','75mg','100mg','150mg'], typicalUnit: 'capsules', freqHint: 'twice-daily', isControlled: false },
  { name: 'Colchicine', genericName: null, aliases: ['colcrys'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['0.6mg'], typicalUnit: 'tablets', freqHint: null, isControlled: false },
  { name: 'Allopurinol', genericName: null, aliases: ['zyloprim'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['100mg','200mg','300mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },

  // ── Opioids (controlled) ────────────────────────────────────────────────
  { name: 'Hydrocodone', genericName: null, aliases: ['norco','vicodin','lortab'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['5mg','7.5mg','10mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Oxycodone', genericName: null, aliases: ['oxycontin','roxicodone'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg','15mg','20mg','30mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Codeine', genericName: null, aliases: [], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['15mg','30mg','60mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Morphine', genericName: null, aliases: ['ms contin'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['15mg','30mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Buprenorphine', genericName: null, aliases: ['suboxone','subutex'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['2mg','8mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: true },

  // ── Antibiotics ──────────────────────────────────────────────────────────
  { name: 'Amoxicillin', genericName: null, aliases: ['amoxil'], category: 'Other', defaultForm: 'Capsule', commonStrengths: ['250mg','500mg','875mg'], typicalUnit: 'capsules', freqHint: 'three-times-daily', isControlled: false },
  { name: 'Azithromycin', genericName: null, aliases: ['zithromax','z-pack'], category: 'Other', defaultForm: 'Tablet', commonStrengths: ['250mg','500mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Ciprofloxacin', genericName: null, aliases: ['cipro'], category: 'Other', defaultForm: 'Tablet', commonStrengths: ['250mg','500mg','750mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Doxycycline', genericName: null, aliases: ['vibramycin'], category: 'Other', defaultForm: 'Capsule', commonStrengths: ['50mg','100mg'], typicalUnit: 'capsules', freqHint: 'twice-daily', isControlled: false },
  { name: 'Metronidazole', genericName: null, aliases: ['flagyl'], category: 'Other', defaultForm: 'Tablet', commonStrengths: ['250mg','500mg'], typicalUnit: 'tablets', freqHint: 'three-times-daily', isControlled: false },
  { name: 'Trimethoprim', genericName: null, aliases: ['bactrim','sulfamethoxazole'], category: 'Other', defaultForm: 'Tablet', commonStrengths: ['160mg','800mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Cephalexin', genericName: null, aliases: ['keflex'], category: 'Other', defaultForm: 'Capsule', commonStrengths: ['250mg','500mg'], typicalUnit: 'capsules', freqHint: 'four-times-daily', isControlled: false },
  { name: 'Clindamycin', genericName: null, aliases: ['cleocin'], category: 'Other', defaultForm: 'Capsule', commonStrengths: ['150mg','300mg'], typicalUnit: 'capsules', freqHint: 'four-times-daily', isControlled: false },

  // ── Mental health / sleep ───────────────────────────────────────────────
  { name: 'Sertraline', genericName: null, aliases: ['zoloft'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Escitalopram', genericName: null, aliases: ['lexapro'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg','20mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Fluoxetine', genericName: null, aliases: ['prozac'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['10mg','20mg','40mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Paroxetine', genericName: null, aliases: ['paxil'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['10mg','20mg','30mg','40mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Venlafaxine', genericName: null, aliases: ['effexor','effexor xr'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['37.5mg','75mg','150mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Duloxetine', genericName: null, aliases: ['cymbalta'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['20mg','30mg','60mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Bupropion', genericName: null, aliases: ['wellbutrin'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['75mg','100mg','150mg','300mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Aripiprazole', genericName: null, aliases: ['abilify'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['2mg','5mg','10mg','15mg','20mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Quetiapine', genericName: null, aliases: ['seroquel','seroquel xr'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg','150mg','200mg','300mg','400mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Alprazolam', genericName: null, aliases: ['xanax'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['0.25mg','0.5mg','1mg','2mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Lorazepam', genericName: null, aliases: ['ativan'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['0.5mg','1mg','2mg'], typicalUnit: 'tablets', freqHint: null, isControlled: true },
  { name: 'Clonazepam', genericName: null, aliases: ['klonopin'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['0.5mg','1mg','2mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: true },
  { name: 'Zolpidem', genericName: null, aliases: ['ambien'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: true },
  { name: 'Trazodone', genericName: null, aliases: ['desyrel'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['50mg','100mg','150mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Buspirone', genericName: null, aliases: ['buspar'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg','15mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Mirtazapine', genericName: null, aliases: ['remeron'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['7.5mg','15mg','30mg','45mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },

  // ── Diabetes / endocrine ────────────────────────────────────────────────
  { name: 'Metformin', genericName: null, aliases: ['glucophage'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['500mg','850mg','1000mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Glipizide', genericName: null, aliases: ['glucotrol'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Glimepiride', genericName: null, aliases: ['amaryl'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['1mg','2mg','4mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Sitagliptin', genericName: null, aliases: ['januvia'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Empagliflozin', genericName: null, aliases: ['jardiance'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['10mg','25mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Insulin Glargine', genericName: null, aliases: ['lantus','basaglar','toujeo'], category: 'Chronic', defaultForm: 'Injection', commonStrengths: [], typicalUnit: 'units', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Insulin Aspart', genericName: null, aliases: ['novolog'], category: 'Chronic', defaultForm: 'Injection', commonStrengths: [], typicalUnit: 'units', freqHint: null, isControlled: false },
  { name: 'Levothyroxine', genericName: null, aliases: ['synthroid'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mcg','50mcg','75mcg','88mcg','100mcg','125mcg','150mcg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Liothyronine', genericName: null, aliases: ['cytomel'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mcg','25mcg','50mcg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Estradiol', genericName: null, aliases: ['estrace'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['0.5mg','1mg','2mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Progesterone', genericName: null, aliases: ['prometrium'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['100mg','200mg'], typicalUnit: 'capsules', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Testosterone', genericName: null, aliases: ['androgel'], category: 'Chronic', defaultForm: 'Topical', commonStrengths: [], typicalUnit: 'applications', freqHint: 'once-daily-morning', isControlled: true },

  // ── Respiratory ──────────────────────────────────────────────────────────
  { name: 'Albuterol', genericName: null, aliases: ['proair','ventolin','proventil'], category: 'PRN', defaultForm: 'Inhaler', commonStrengths: [], typicalUnit: 'puffs', freqHint: null, isControlled: false },
  { name: 'Fluticasone', genericName: null, aliases: ['flonase','flovent'], category: 'Chronic', defaultForm: 'Inhaler', commonStrengths: [], typicalUnit: 'sprays', freqHint: 'twice-daily', isControlled: false },
  { name: 'Montelukast', genericName: null, aliases: ['singulair'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Tiotropium', genericName: null, aliases: ['spiriva'], category: 'Chronic', defaultForm: 'Inhaler', commonStrengths: [], typicalUnit: 'puffs', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Budesonide', genericName: null, aliases: ['pulmicort'], category: 'Chronic', defaultForm: 'Inhaler', commonStrengths: [], typicalUnit: 'puffs', freqHint: 'twice-daily', isControlled: false },
  { name: 'Ipratropium', genericName: null, aliases: ['atrovent'], category: 'Chronic', defaultForm: 'Inhaler', commonStrengths: [], typicalUnit: 'puffs', freqHint: 'four-times-daily', isControlled: false },
  { name: 'Prednisone', genericName: null, aliases: ['deltasone'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['1mg','2.5mg','5mg','10mg','20mg','50mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Methylprednisolone', genericName: null, aliases: ['medrol'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['4mg','8mg','16mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },

  // ── GI ───────────────────────────────────────────────────────────────────
  { name: 'Omeprazole', genericName: null, aliases: ['prilosec'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['10mg','20mg','40mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Pantoprazole', genericName: null, aliases: ['protonix'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['20mg','40mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Esomeprazole', genericName: null, aliases: ['nexium'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['20mg','40mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Famotidine', genericName: null, aliases: ['pepcid'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['10mg','20mg','40mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Ondansetron', genericName: null, aliases: ['zofran'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['4mg','8mg'], typicalUnit: 'tablets', freqHint: null, isControlled: false },
  { name: 'Loperamide', genericName: null, aliases: ['imodium'], category: 'OTC', defaultForm: 'Capsule', commonStrengths: ['2mg'], typicalUnit: 'capsules', freqHint: null, isControlled: false },
  { name: 'Bisacodyl', genericName: null, aliases: ['dulcolax'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['5mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Docusate', genericName: null, aliases: ['colace'], category: 'OTC', defaultForm: 'Capsule', commonStrengths: ['100mg'], typicalUnit: 'capsules', freqHint: 'twice-daily', isControlled: false },
  { name: 'Polyethylene Glycol 3350', genericName: null, aliases: ['miralax'], category: 'OTC', defaultForm: 'Other', commonStrengths: [], typicalUnit: 'mL', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Calcium Carbonate', genericName: null, aliases: ['tums'], category: 'Supplement', defaultForm: 'Tablet', commonStrengths: ['500mg','750mg','1000mg'], typicalUnit: 'tablets', freqHint: null, isControlled: false },

  // ── Neuro ────────────────────────────────────────────────────────────────
  { name: 'Topiramate', genericName: null, aliases: ['topamax'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg','200mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Lamotrigine', genericName: null, aliases: ['lamictal'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg','100mg','200mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Levetiracetam', genericName: null, aliases: ['keppra'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['250mg','500mg','750mg','1000mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Valproic Acid', genericName: null, aliases: ['depakote','divalproex'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['125mg','250mg','500mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Donepezil', genericName: null, aliases: ['aricept'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg','23mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Memantine', genericName: null, aliases: ['namenda'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Carbidopa-Levodopa', genericName: null, aliases: ['sinemet'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['10/100mg','25/100mg','25/250mg'], typicalUnit: 'tablets', freqHint: 'three-times-daily', isControlled: false },

  // ── Urology / misc chronic ──────────────────────────────────────────────
  { name: 'Tamsulosin', genericName: null, aliases: ['flomax'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['0.4mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Finasteride', genericName: null, aliases: ['proscar','propecia'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['1mg','5mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Oxybutynin', genericName: null, aliases: ['ditropan'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Hydroxychloroquine', genericName: null, aliases: ['plaquenil'], category: 'Chronic', defaultForm: 'Tablet', commonStrengths: ['200mg'], typicalUnit: 'tablets', freqHint: 'twice-daily', isControlled: false },
  { name: 'Tacrolimus', genericName: null, aliases: ['prograf'], category: 'Chronic', defaultForm: 'Capsule', commonStrengths: ['0.5mg','1mg','5mg'], typicalUnit: 'capsules', freqHint: 'twice-daily', isControlled: false },

  // ── Antihistamines ───────────────────────────────────────────────────────
  { name: 'Cetirizine', genericName: null, aliases: ['zyrtec'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['5mg','10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Loratadine', genericName: null, aliases: ['claritin'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['10mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Fexofenadine', genericName: null, aliases: ['allegra'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['60mg','120mg','180mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Diphenhydramine', genericName: null, aliases: ['benadryl'], category: 'OTC', defaultForm: 'Tablet', commonStrengths: ['25mg','50mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Hydroxyzine', genericName: null, aliases: ['vistaril','atarax'], category: 'PRN', defaultForm: 'Tablet', commonStrengths: ['10mg','25mg','50mg'], typicalUnit: 'tablets', freqHint: null, isControlled: false },

  // ── Ophthalmic / dermatologic ───────────────────────────────────────────
  { name: 'Latanoprost', genericName: null, aliases: ['xalatan'], category: 'Chronic', defaultForm: 'Drops', commonStrengths: [], typicalUnit: 'drops', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Timolol', genericName: null, aliases: ['timoptic'], category: 'Chronic', defaultForm: 'Drops', commonStrengths: [], typicalUnit: 'drops', freqHint: 'twice-daily', isControlled: false },
  { name: 'Triamcinolone', genericName: null, aliases: ['kenalog'], category: 'PRN', defaultForm: 'Topical', commonStrengths: [], typicalUnit: 'applications', freqHint: 'twice-daily', isControlled: false },
  { name: 'Hydrocortisone', genericName: null, aliases: ['cortaid'], category: 'OTC', defaultForm: 'Topical', commonStrengths: ['1%'], typicalUnit: 'applications', freqHint: null, isControlled: false },
  { name: 'Tretinoin', genericName: null, aliases: ['retin-a'], category: 'Other', defaultForm: 'Topical', commonStrengths: ['0.025%','0.05%','0.1%'], typicalUnit: 'applications', freqHint: 'once-daily-bedtime', isControlled: false },

  // ── Vitamins / supplements ──────────────────────────────────────────────
  { name: 'Vitamin D', genericName: null, aliases: ['vitamin d3','cholecalciferol'], category: 'Vitamin', defaultForm: 'Tablet', commonStrengths: ['1000IU','2000IU','5000IU'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Vitamin B12', genericName: null, aliases: ['cyanocobalamin'], category: 'Vitamin', defaultForm: 'Tablet', commonStrengths: ['500mcg','1000mcg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Folic Acid', genericName: null, aliases: ['folate'], category: 'Vitamin', defaultForm: 'Tablet', commonStrengths: ['400mcg','800mcg','1mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Iron Sulfate', genericName: null, aliases: ['ferrous sulfate'], category: 'Supplement', defaultForm: 'Tablet', commonStrengths: ['325mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Omega-3 Fish Oil', genericName: null, aliases: ['fish oil'], category: 'Supplement', defaultForm: 'Capsule', commonStrengths: ['1000mg'], typicalUnit: 'capsules', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Magnesium', genericName: null, aliases: ['magnesium oxide','magnesium citrate'], category: 'Supplement', defaultForm: 'Tablet', commonStrengths: ['250mg','400mg','500mg'], typicalUnit: 'tablets', freqHint: 'once-daily-bedtime', isControlled: false },
  { name: 'Zinc', genericName: null, aliases: ['zinc gluconate'], category: 'Supplement', defaultForm: 'Tablet', commonStrengths: ['15mg','30mg','50mg'], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
  { name: 'Multivitamin', genericName: null, aliases: ['centrum','one a day'], category: 'Vitamin', defaultForm: 'Tablet', commonStrengths: [], typicalUnit: 'tablets', freqHint: 'once-daily-morning', isControlled: false },
];

// Quick lookup of every brand → generic relationship the dataset knows about,
// kept separate from MED_DATASET so callers that only need the mapping don't
// have to scan the whole array.
export const GENERIC_NAME_MAP = MED_DATASET.reduce((map, d) => {
  if (d.genericName) map[d.name.toLowerCase()] = d.genericName;
  return map;
}, {});
