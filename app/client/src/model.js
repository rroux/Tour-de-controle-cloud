// Consolidation côté navigateur : les volumes (quelques dizaines de projets) le permettent.

export const PERIODS = [
  { id: "realise", label: "Réalisé" },
  { id: "annee", label: "Année complète" },
  { id: "affaire", label: "Fin d'affaire" },
];

// Objectif de taux de marge réglé dans les Paramètres (valeur unique, ou marge minimum de chaque CEP).
let objectiveSettings = { value: 0.25, useCep: false };
export function setObjectiveSettings(o) {
  if (o && o.value > 0 && o.value < 1) objectiveSettings = { value: o.value, useCep: Boolean(o.useCep) };
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
  if (period === "affaire") return { months: all, report: true };
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

export function objective(p) {
  const o = p?.parametres?.margeMinimum;
  return objectiveSettings.useCep && o > 0 && o < 1 ? o : objectiveSettings.value;
}

/** Chiffres d'un projet sur la période. */
export function figures(p, period, year) {
  const sel = periodMonths(p, period, year);
  const ca = sumRow(p, "caBrut", sel);
  const caNet = sumRow(p, "caNet", sel);
  const couts = sumRow(p, "totalCharges", sel);
  const marge = ca - couts;
  return {
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

// Objectif du portefeuille : moyenne des objectifs pondérée par le CA.
export function portfolioObjective(projects, period, year) {
  let w = 0;
  let s = 0;
  for (const p of projects) {
    const ca = figures(p, period, year).ca;
    w += ca;
    s += ca * objective(p);
  }
  return w ? s / w : objective(null);
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

/** État d'un projet : ok / warn / crit / none, avec le motif. */
export function status(p, f) {
  if (!f.ca) return { level: "none", label: "Sans CA", reason: "Aucun CA sur la période" };
  const obj = objective(p);
  if (f.taux < obj / 2) return { level: "crit", label: "Marge critique", reason: `Marge ${(f.taux * 100).toFixed(1)} % pour un objectif de ${(obj * 100).toFixed(0)} %` };
  const derive = p.kpi?.pctDeriveObjectif || 0;
  if (f.taux < obj) return { level: "warn", label: "À surveiller", reason: `Marge sous l'objectif de ${(obj * 100).toFixed(0)} %` };
  if (derive > 0.05) return { level: "warn", label: "À surveiller", reason: `Dérive de ${(derive * 100).toFixed(1)} % sur l'objectif de jours` };
  return { level: "ok", label: "Conforme", reason: "" };
}

const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Points d'attention du portefeuille, du plus grave au moins grave. */
export function alerts(projects, errors, period, year, staleDays) {
  const out = [];
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const p of projects) {
    const f = figures(p, period, year);
    const s = status(p, f);
    if (s.level === "crit" || s.level === "warn") out.push({ level: s.level, tag: s.label, text: `${p.key} : ${s.reason}`, key: p.key });
    if (p.moisRef && monthsBetween(p.moisRef, thisMonth) > 1)
      out.push({ level: "warn", tag: "Historisation", text: `${p.key} : mois de référence ${p.moisRef}, CEP non historisé depuis`, key: p.key });
    const age = (Date.now() - p.fileMtime) / 86400000;
    if (age > staleDays) out.push({ level: "warn", tag: "Fraîcheur", text: `${p.key} : fichier non modifié depuis ${Math.floor(age)} jours`, key: p.key });
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

export const hasBudget = (p) => Object.values(p.budget?.caNet || {}).some(Boolean) || Object.values(p.budget?.couts || {}).some(Boolean);

/** Séries mensuelles d'un projet sur l'année : { ca, marge, budCa, budMarge, real[] } (12 valeurs chacune). */
export function projectTrack(p, year) {
  const months = yearMonths(year);
  const r = p.cep?.rows || {};
  const b = p.budget || {};
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
    hasBudget: hasBudget(p),
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
