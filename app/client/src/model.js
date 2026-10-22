// Consolidation côté navigateur : les volumes (quelques dizaines de projets) le permettent.

export const PERIODS = [
  { id: "realise", label: "Réalisé" },
  { id: "annee", label: "Année complète" },
];

// Objectifs de taux de marge réglés dans les Paramètres (base CA net) :
// `defaut` pour un projet sans trajectoire initiale, `mode` auto (pondéré par le CA) ou fixe (`global`).
let objectiveSettings = { defaut: 0.25, mode: "auto", global: 0.25 };
export function setObjectiveSettings(o) {
  if (o && o.defaut > 0 && o.defaut < 1) objectiveSettings = { defaut: o.defaut, mode: o.mode === "fixe" ? "fixe" : "auto", global: o.global > 0 && o.global < 1 ? o.global : o.defaut };
}

// Budget : trajectoire initiale (onglet Projection) avant `budgetRefYear`, référence figée de l'onglet CEP ensuite.
let budgetRefYear = 2027;
export function setBudgetRefYear(y) {
  if (Number.isInteger(y)) budgetRefYear = y;
}
export const usesReference = (year) => year >= budgetRefYear;
export const budgetLabel = (year) => (usesReference(year) ? "budget de référence" : "trajectoire initiale");

/** Budget d'un projet pour une année : { caNet, couts, conso } mois par mois, `source`, et pour la référence `frozenAt` / `pending`. */
export function budgetOf(p, year) {
  if (usesReference(year)) {
    const r = p?.budgetRef?.[year];
    return r ? { ...r, source: "reference" } : { caNet: {}, couts: {}, conso: {}, source: "reference", missing: true };
  }
  return { caNet: p?.budget?.caNet || {}, couts: p?.budget?.couts || {}, conso: p?.budget?.conso || {}, dateEnreg: p?.budget?.dateEnreg, source: "trajectoire" };
}

// Projets sans DP renseigné dans le Sommaire : regroupés sous ce libellé.
export const NO_DP = "DP non renseigné";
export const dpOf = (p) => p.dp || NO_DP;

export const yearMonths = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

export function availableYears(projects) {
  const ys = new Set();
  for (const p of projects) for (const m of p.cep?.months || []) ys.add(Number(m.slice(0, 4)));
  return [...ys].sort();
}

export function defaultYear(projects) {
  const refs = projects.map((p) => p.moisRef).filter(Boolean).sort();
  const last = refs[refs.length - 1];
  return last ? Number(last.slice(0, 4)) : new Date().getFullYear();
}

// Mois de référence du portefeuille : le plus récent des CEP sélectionnés.
export function portfolioRef(projects) {
  const refs = projects.map((p) => p.moisRef).filter(Boolean).sort();
  return refs[refs.length - 1] || null;
}

/** Mois retenus pour un projet selon la période ; `report` indique s'il faut ajouter le « Report avant ». */
export function periodMonths(p, period, year) {
  const all = p.cep?.months || [];
  const inYear = all.filter((m) => m.startsWith(`${year}-`));
  if (period === "annee") return { months: inYear, report: false };
  return { months: inYear.filter((m) => !p.moisRef || m <= p.moisRef), report: false };
}

export function sumRow(p, key, sel) {
  const row = p.cep?.rows?.[key] || {};
  let s = sel.report ? p.cep?.report?.[key] || 0 : 0;
  for (const m of sel.months) s += row[m] || 0;
  return s;
}

/**
 * Objectif de taux de marge d'un projet : taux de la trajectoire initiale (onglet Projection, CA net − coûts)
 * sur l'année, ou sur toute la trajectoire si l'année n'y figure pas ; à défaut, l'objectif par défaut.
 */
export function objectiveInfo(p, year) {
  const b = year != null ? budgetOf(p, year) : p?.budget || {};
  const rate = (months) => {
    let ca = 0, co = 0;
    for (const m of months) {
      ca += b.caNet?.[m] || 0;
      co += b.couts?.[m] || 0;
    }
    return ca > 0 ? (ca - co) / ca : null;
  };
  const y = year != null ? rate(yearMonths(year)) : null;
  if (y != null) return { value: y, source: b.source || "trajectoire" };
  const t = p?.budget || {};
  let ca = 0, co = 0;
  for (const m of Object.keys(t.caNet || {})) {
    ca += t.caNet[m] || 0;
    co += t.couts?.[m] || 0;
  }
  if (ca > 0) return { value: (ca - co) / ca, source: "trajectoire" };
  return { value: objectiveSettings.defaut, source: "defaut" };
}

export const objective = (p, year) => objectiveInfo(p, year).value;

/** Chiffres d'un projet sur la période. */
export function figures(p, period, year) {
  const sel = periodMonths(p, period, year);
  const ca = sumRow(p, "caBrut", sel);
  const caNet = sumRow(p, "caNet", sel);
  const couts = sumRow(p, "totalCharges", sel);
  const marge = ca - couts;
  return {
    obj: objective(p, year),
    ca,
    caNet,
    couts,
    marge,
    margeNette: caNet - couts,
    taux: ca ? marge / ca : 0,
    tauxNet: caNet ? (caNet - couts) / caNet : 0,
    salaires: sumRow(p, "salaires", sel),
    achats: sumRow(p, "achats", sel),
    sttExt: sumRow(p, "sttExtCout", sel),
    sttInt: sumRow(p, "sttIntCout", sel),
    caPresta: sumRow(p, "caPresta", sel),
    caRevente: sumRow(p, "caRevente", sel),
    caStt: sumRow(p, "caSttExt", sel) + sumRow(p, "caSttInt", sel),
    rfa: sumRow(p, "rfa", sel),
  };
}

export function totalFigures(projects, period, year) {
  const t = { ca: 0, caNet: 0, couts: 0, salaires: 0, achats: 0, sttExt: 0, sttInt: 0 };
  for (const p of projects) {
    const f = figures(p, period, year);
    for (const k of Object.keys(t)) t[k] += f[k];
  }
  t.marge = t.ca - t.couts;
  t.taux = t.ca ? t.marge / t.ca : 0;
  return t;
}

/**
 * Objectif global des vues consolidées : fixé dans les Paramètres, ou (auto) moyenne des objectifs
 * des projets pondérée par leur CA net de l'année.
 */
export function portfolioObjective(projects, year) {
  if (objectiveSettings.mode === "fixe") return { value: objectiveSettings.global, mode: "fixe" };
  let w = 0;
  let s = 0;
  for (const p of projects) {
    const ca = Math.max(0, figures(p, "annee", year).caNet);
    w += ca;
    s += ca * objective(p, year);
  }
  return { value: w ? s / w : objectiveSettings.defaut, mode: "auto" };
}

/** Série mensuelle consolidée sur l'année : { ym: valeur }. */
export function monthly(projects, getter, year) {
  const out = {};
  for (const ym of yearMonths(year)) out[ym] = projects.reduce((a, p) => a + (getter(p)?.[ym] || 0), 0);
  return out;
}

export const cumulate = (values) => {
  let s = 0;
  return values.map((v) => (v == null ? null : (s += v)));
};

/** État d'un projet : taux de marge (base CA net) comparé à son objectif — ok / warn / crit / none, avec le motif. */
export function status(p, f) {
  if (!f.caNet) return { level: "none", label: "Sans CA", reason: "Aucun CA sur la période" };
  const obj = f.obj;
  const t = `Marge ${(f.tauxNet * 100).toFixed(1)} % pour un objectif de ${(obj * 100).toFixed(1)} %`;
  if (f.tauxNet < obj / 2) return { level: "crit", label: "Marge critique", reason: t };
  if (f.tauxNet < obj - 0.0005) return { level: "warn", label: "À surveiller", reason: t };
  return { level: "ok", label: "Conforme", reason: "" };
}

/** Points d'attention du portefeuille, du plus grave au moins grave. */
export function alerts(projects, errors, period, year, staleDays) {
  const out = [];
  for (const p of projects) {
    const f = figures(p, period, year);
    const s = status(p, f);
    if (s.level === "crit" || s.level === "warn") out.push({ level: s.level, tag: s.label, text: `${p.key} : ${s.reason}`, key: p.key });
    const c = updateControl(p, controlMonth());
    if (c.level === "late") out.push({ level: "crit", tag: "Mise à jour", text: `${p.key} : CEP non mis à jour pour ${c.monthLabel} (mois de référence ${p.moisRef || "absent"})`, key: p.key });
    else if (c.level === "partial") out.push({ level: "warn", tag: "Mise à jour", text: `${p.key} : mise à jour de ${c.monthLabel} incomplète (${c.failed.map((x) => x.label.toLowerCase()).join(", ")})`, key: p.key });
    const age = (Date.now() - p.fileMtime) / 86400000;
    if (age > staleDays) out.push({ level: "warn", tag: "Fraîcheur", text: `${p.key} : fichier non modifié depuis ${Math.floor(age)} jours`, key: p.key });
    const bud = budgetOf(p, year);
    if (bud.pending) out.push({ level: "warn", tag: "Budget", text: `${p.key} : le CEP ${year} a changé depuis le budget de référence du ${bud.frozenAt.slice(0, 10).split("-").reverse().join("/")} (à valider dans les paramètres)`, key: p.key });
    if (p.duplicates?.length)
      out.push({ level: "warn", tag: "Doublon", text: `${p.key} : ${p.duplicates.length + 1} fichiers pour ce code, le plus récent est utilisé`, key: p.key });
  }
  for (const e of errors) out.push({ level: "crit", tag: "Lecture", text: `${e.name} : ${e.message}` });
  const rank = { crit: 0, warn: 1 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function sumObj(o) {
  return Object.values(o || {}).reduce((a, b) => a + (b || 0), 0);
}

export function sumUpTo(o, upto, year) {
  let s = 0;
  for (const [k, v] of Object.entries(o || {})) if (k.startsWith(`${year}-`) && (!upto || k <= upto)) s += v || 0;
  return s;
}

// ---------------------------------------------------------------------------
// Réel contre budget. Le budget est la trajectoire initiale de l'onglet Projection (CA net et coûts) :
// la comparaison se fait donc sur la même base, CA net et marge = CA net − coûts.
// « Réel » = réalisé jusqu'au mois de référence du projet, prévisionnel du CEP ensuite.
// ---------------------------------------------------------------------------

export const hasBudget = (p, year) => {
  const b = budgetOf(p, year);
  return Object.values(b.caNet || {}).some(Boolean) || Object.values(b.couts || {}).some(Boolean);
};

/** Séries mensuelles d'un projet sur l'année : { ca, marge, budCa, budMarge, real[] } (12 valeurs chacune). */
export function projectTrack(p, year) {
  const months = yearMonths(year);
  const r = p.cep?.rows || {};
  const b = budgetOf(p, year);
  return {
    ca: months.map((m) => r.caNet?.[m] || 0),
    marge: months.map((m) => (r.caNet?.[m] || 0) - (r.totalCharges?.[m] || 0)),
    budCa: months.map((m) => b.caNet?.[m] || 0),
    budMarge: months.map((m) => (b.caNet?.[m] || 0) - (b.couts?.[m] || 0)),
    real: months.map((m) => !p.moisRef || m <= p.moisRef),
  };
}

/** Réel contre budget d'un projet : à date (jusqu'à son mois de référence) et sur l'année (atterrissage). */
export function budgetFigures(p, year) {
  const t = projectTrack(p, year);
  const upto = (arr) => arr.reduce((a, v, i) => a + (t.real[i] ? v : 0), 0);
  const all = (arr) => arr.reduce((a, v) => a + v, 0);
  return {
    hasBudget: hasBudget(p, year),
    ca: upto(t.ca), budCa: upto(t.budCa), marge: upto(t.marge), budMarge: upto(t.budMarge),
    caAn: all(t.ca), budCaAn: all(t.budCa), margeAn: all(t.marge), budMargeAn: all(t.budMarge),
  };
}

/** Somme de budgetFigures sur plusieurs projets. */
export function totalBudgetFigures(projects, year) {
  const t = { ca: 0, budCa: 0, marge: 0, budMarge: 0, caAn: 0, budCaAn: 0, margeAn: 0, budMargeAn: 0, withBudget: 0 };
  for (const p of projects) {
    const f = budgetFigures(p, year);
    for (const k of Object.keys(t)) if (k !== "withBudget") t[k] += f[k];
    if (f.hasBudget) t.withBudget += 1;
  }
  return t;
}

/** Séries mensuelles consolidées (12 valeurs) : CA net et marge réels / prévisionnels, budget. */
export function portfolioTrack(projects, year) {
  const out = { ca: Array(12).fill(0), marge: Array(12).fill(0), budCa: Array(12).fill(0), budMarge: Array(12).fill(0) };
  for (const p of projects) {
    const t = projectTrack(p, year);
    for (const k of Object.keys(out)) t[k].forEach((v, i) => (out[k][i] += v));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Activité : reste à faire et gain IA, lus dans l'onglet Activité.
// ---------------------------------------------------------------------------

export const isReal = (p, m) => !p.moisRef || m <= p.moisRef;

/** Reste à faire (jours) de l'exercice : prévisionnel de l'onglet Activité sur les mois de `year` après le mois de référence. */
export function raf(p, year) {
  const prev = p.activite?.joursPrev || {};
  const from = p.moisRef || currentMonth();
  return yearMonths(year).reduce((a, m) => a + (m > from ? prev[m] || 0 : 0), 0);
}

/** Jours Pilot consommés sur l'année, jusqu'au mois de référence. */
export function joursAnnee(p, year) {
  return yearMonths(year).reduce((a, m) => a + (isReal(p, m) ? p.activite?.joursPilot?.[m] || 0 : 0), 0);
}

/** Jours prévus sur l'année (onglet Activité, prévisionnel) : `aDate` jusqu'au mois de référence. */
export function joursPrevus(p, year, aDate = false) {
  return yearMonths(year).reduce((a, m) => a + (!aDate || isReal(p, m) ? p.activite?.joursPrev?.[m] || 0 : 0), 0);
}

/** Jours de la trajectoire initiale (onglet Projection, « Conso mois ») sur l'année : `aDate` jusqu'au mois de référence. */
export function joursBudget(p, year, aDate = false) {
  return yearMonths(year).reduce((a, m) => a + (!aDate || isReal(p, m) ? budgetOf(p, year).conso?.[m] || 0 : 0), 0);
}

/** Atterrissage des jours sur l'année : Pilot réalisé jusqu'au mois de référence, prévisionnel de l'onglet Activité ensuite. */
export function joursAtterrissage(p, year) {
  return yearMonths(year).reduce((a, m) => a + (isReal(p, m) ? p.activite?.joursPilot?.[m] || 0 : p.activite?.joursPrev?.[m] || 0), 0);
}

/** Gain IA du mois (profil ZZZ_GAIN_IA) : saisie du réalisé jusqu'au mois de référence (ou du prévisionnel si vide), prévisionnel ensuite. */
export function gainIaAt(p, m) {
  const real = p.activite?.gainIaPilot?.[m] || 0;
  const prev = p.activite?.gainIaPrev?.[m] || 0;
  return isReal(p, m) ? real || prev : prev;
}

/** Gain IA d'un projet : réalisé et prévu sur l'année, total sur toute la durée du CEP. */
export function gainIa(p, year) {
  const months = yearMonths(year);
  const realise = months.reduce((a, m) => a + (isReal(p, m) ? gainIaAt(p, m) : 0), 0);
  const annee = months.reduce((a, m) => a + gainIaAt(p, m), 0);
  const all = new Set([...Object.keys(p.activite?.gainIaPilot || {}), ...Object.keys(p.activite?.gainIaPrev || {})]);
  return { realise, prevu: annee - realise, annee, projet: [...all].reduce((a, m) => a + gainIaAt(p, m), 0) };
}

// ---------------------------------------------------------------------------
// Contrôle de la mise à jour mensuelle : la présence du fichier ne suffit pas, on vérifie
// que le mois contrôlé est bien saisi dans le CEP.
// ---------------------------------------------------------------------------

export function currentMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Mois à contrôler par défaut : le mois précédent (le CEP du mois M est mis à jour début M+1). */
export function controlMonth(d = new Date()) {
  return currentMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

export const addMonths = (ym, n) => currentMonth(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));

// Date à partir de laquelle la date de MAJ du Sommaire est acceptée : 7 jours avant la fin du mois contrôlé.
export function controlMajFrom(month) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Points de contrôle d'un projet pour le mois `month`. Chaque point : { id, label, ok (true / false / null si sans objet), detail }.
 * level : ok (tout est saisi), partial (mois de référence à jour mais saisie incomplète), late (mois de référence antérieur), off (projet hors période).
 */
export function updateControl(p, month) {
  const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const lbl = (ym) => `${MONTHS_FR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const start = p.dateDebut?.slice(0, 7);
  const end = p.dateFin?.slice(0, 7);
  const active = (!start || start <= month) && (!end || end >= month);
  const r = p.cep?.rows || {};
  const th = p.facturation?.theorique?.[month] || 0;
  const re = p.facturation?.reel?.[month] || 0;
  const majFrom = controlMajFrom(month);
  const after = Object.entries(p.activite?.joursPrev || {}).reduce((a, [m, v]) => a + (m > month ? v || 0 : 0), 0);
  const fn = (v, d = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(v);
  const checks = [
    {
      id: "ref",
      label: "Mois de référence",
      ok: Boolean(p.moisRef && p.moisRef >= month),
      detail: p.moisRef ? `Date de référence du Sommaire : ${lbl(p.moisRef)}` : "Date de référence du Sommaire non renseignée",
    },
    {
      id: "maj",
      label: "Date de MAJ",
      ok: Boolean(p.dateMaj && p.dateMaj >= majFrom),
      detail: p.dateMaj ? `Date de MAJ du Sommaire : ${p.dateMaj.split("-").reverse().join("/")} (attendue à partir du ${majFrom.split("-").reverse().join("/")})` : "Date de MAJ du Sommaire non renseignée",
    },
    {
      id: "pilot",
      label: "Conso Pilot",
      // Valeur négative = régularisation saisie : la consommation du mois est bien renseignée.
      ok: active ? (p.activite?.joursPilot?.[month] || 0) !== 0 : null,
      detail: active
        ? `${fn(p.activite?.joursPilot?.[month] || 0, 1)} j consommés en ${lbl(month)} (onglet Activité)${(p.activite?.joursPilot?.[month] || 0) < 0 ? " · régularisation" : ""}`
        : "Projet hors période",
    },
    {
      id: "cep",
      label: "Réel du CEP",
      ok: active ? (r.totalCharges?.[month] || 0) !== 0 || (r.caNet?.[month] || 0) !== 0 : null,
      detail: active ? `CA net ${fn(Math.round((r.caNet?.[month] || 0) / 1000))} k€ · coûts ${fn(Math.round((r.totalCharges?.[month] || 0) / 1000))} k€ en ${lbl(month)}` : "Projet hors période",
    },
    {
      id: "fact",
      label: "Facturation réelle",
      ok: th > 0 ? re !== 0 : null,
      detail: th > 0 ? `Facturé ${fn(Math.round(re / 1000))} k€ pour ${fn(Math.round(th / 1000))} k€ prévus en ${lbl(month)}` : "Aucune facturation prévue ce mois",
    },
    {
      id: "prev",
      label: "Prévisionnel",
      ok: end && end > month ? after > 0 : null,
      detail: end && end > month ? `${fn(after)} j prévus après ${lbl(month)}, fin du projet ${lbl(end)}` : "Projet terminé à ce mois",
    },
    {
      id: "traj",
      label: "Budget",
      ok: hasBudget(p, Number(month.slice(0, 4))),
      detail: (() => {
        const y = Number(month.slice(0, 4));
        const b = budgetOf(p, y);
        if (!hasBudget(p, y)) return usesReference(y) ? `Aucun chiffre ${y} dans l'onglet CEP : pas de budget de référence` : "Trajectoire initiale non enregistrée (onglet Projection)";
        if (b.source === "reference") return `Budget de référence ${y} figé le ${b.frozenAt.slice(0, 10).split("-").reverse().join("/")}${b.pending ? " · nouvelle version du CEP à valider" : ""}`;
        return `Trajectoire initiale enregistrée${b.dateEnreg ? ` le ${b.dateEnreg.split("-").reverse().join("/")}` : ""}`;
      })(),
    },
  ];
  const failed = checks.filter((c) => c.ok === false);
  const level = !active ? "off" : !checks[0].ok ? "late" : failed.length ? "partial" : "ok";
  return { month, monthLabel: lbl(month), checks, failed, level };
}

// ---------------------------------------------------------------------------
// Run et Build : jours Pilot par ligne de contrat (onglet Activité) classés selon le regroupement
// (« Regrp. ») du bon de commande. Le prévisionnel n'existe pas par ligne : le reste à faire de
// l'exercice est réparti au prorata du réalisé.
// ---------------------------------------------------------------------------

const foldTxt = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Type d'un regroupement : run, build ou null (non classé). */
export function rbType(label) {
  const f = foldTxt(label);
  if (/\brun\b/.test(f)) return "run";
  if (/\bbuild\b/.test(f)) return "build";
  return null;
}

/** Type d'un bon de commande, d'après son regroupement. */
export const bcType = (bc) => rbType(bc?.regroupement);

/**
 * Jours Run / Build d'un projet sur l'année et marge estimée :
 * CA = jours × TJM vendu des BC du type (hors achats et frais), coût = jours × PRJ moyen du projet.
 */
export function runBuild(p, year) {
  const months = yearMonths(year);
  const bons = p.bons || [];
  const lines = p.activite?.consoBc || [];
  const out = { run: { reel: 0 }, build: { reel: 0 }, autre: { reel: 0 } };
  const allTime = { run: 0, build: 0, autre: 0 };
  for (const l of lines) {
    const bc = (l.id && bons.find((b) => b.id === l.id)) || bons.find((b) => b.ligne === l.ligne);
    const t = rbType(l.regroupement || bc?.regroupement) || "autre";
    out[t].reel += months.reduce((a, m) => a + (isReal(p, m) ? l.jours[m] || 0 : 0), 0);
    allTime[t] += Object.entries(l.jours).reduce((a, [m, v]) => a + (isReal(p, m) ? v || 0 : 0), l.report || 0);
  }
  // Prorata du réalisé de l'année, ou de tout le projet si rien n'est encore réalisé cette année.
  const base = out.run.reel + out.build.reel ? { run: out.run.reel, build: out.build.reel } : allTime;
  const classe = base.run + base.build;
  const reste = classe ? raf(p, year) : 0;
  const days = months.reduce((a, m) => a + (isReal(p, m) ? p.activite?.joursPilot?.[m] || 0 : 0), 0);
  const salaires = months.reduce((a, m) => a + (isReal(p, m) ? p.cep?.rows?.salaires?.[m] || 0 : 0), 0);
  const prj = p.kpi?.prj?.cumul || (days ? salaires / days : 0);
  for (const t of ["run", "build"]) {
    const o = out[t];
    o.prevu = classe ? (reste * base[t]) / classe : 0;
    o.total = o.reel + o.prevu;
    const bs = bons.filter((b) => bcType(b) === t);
    const jv = bs.reduce((a, b) => a + b.joursVendus, 0);
    o.tjm = jv ? bs.reduce((a, b) => a + b.caVendu - b.achatsFrais, 0) / jv : p.kpi?.tjm?.cumul || 0;
    o.ca = o.total * o.tjm;
    o.cout = o.total * prj;
    o.marge = o.ca - o.cout;
    o.taux = o.ca ? o.marge / o.ca : null;
  }
  out.prj = prj;
  out.hasData = lines.length > 0;
  out.classe = classe > 0;
  return out;
}
