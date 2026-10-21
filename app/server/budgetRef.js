// Budget de référence figé, pour les exercices à partir de `budgetRefYear` (2027 par défaut) :
// photo des chiffres mensuels de l'onglet CEP (CA net, total charges) et des jours prévus de l'onglet
// Activité, prise la première fois que l'exercice est renseigné dans le CEP. La photo ne change plus
// ensuite, même si le CEP est modifié : l'application signale la nouvelle version, et l'utilisateur
// décide de la prendre en compte (acceptBudgetRefs). Les exercices antérieurs gardent la trajectoire
// initiale de l'onglet Projection.
import { getConfig } from "./config.js";
import { readJson, writeJson } from "./storage.js";

const FILE = "budgets.json";

// refs : { [clé projet]: { [année]: { caNet, couts, conso, frozenAt, fileName, fileMtime } } }
let refs = readJson(FILE, {});

function yearMonths(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

const round = (v, d = 2) => Math.round((v || 0) * 10 ** d) / 10 ** d;

/** Chiffres actuels du CEP pour une année : { caNet, couts, conso } mois par mois. */
function currentYear(p, year) {
  const r = p.cep?.rows || {};
  const out = { caNet: {}, couts: {}, conso: {} };
  for (const m of yearMonths(year)) {
    out.caNet[m] = round(r.caNet?.[m]);
    out.couts[m] = round(r.totalCharges?.[m]);
    out.conso[m] = round(p.activite?.joursPrev?.[m], 1);
  }
  return out;
}

const total = (o) => Object.values(o || {}).reduce((a, v) => a + (v || 0), 0);
const hasData = (c) => Object.values(c.caNet).some(Boolean) || Object.values(c.couts).some(Boolean);

function differs(ref, cur) {
  return Object.keys(cur.caNet).some(
    (m) => Math.abs((ref.caNet?.[m] || 0) - cur.caNet[m]) >= 1 || Math.abs((ref.couts?.[m] || 0) - cur.couts[m]) >= 1 || Math.abs((ref.conso?.[m] || 0) - cur.conso[m]) >= 0.5,
  );
}

function years(p, from) {
  return [...new Set((p.cep?.months || []).map((m) => Number(m.slice(0, 4))))].filter((y) => y >= from).sort();
}

function snapshot(p, cur) {
  return { ...cur, frozenAt: new Date().toISOString(), fileName: p.fileName, fileMtime: p.fileMtime };
}

/**
 * Ajoute `budgetRef` à chaque projet : { [année]: { caNet, couts, conso, frozenAt, pending } }.
 * Fige la référence d'une année la première fois qu'elle a des chiffres. `pending` résume la version
 * actuelle du CEP quand elle diffère de la référence (null sinon).
 */
export function applyBudgetRefs(projects) {
  const from = getConfig().budgetRefYear;
  let changed = false;
  for (const p of projects) {
    p.budgetRef = {};
    for (const y of years(p, from)) {
      const cur = currentYear(p, y);
      let ref = refs[p.key]?.[y];
      if (!ref) {
        if (!hasData(cur)) continue;
        ref = snapshot(p, cur);
        (refs[p.key] ||= {})[y] = ref;
        changed = true;
      }
      p.budgetRef[y] = {
        caNet: ref.caNet,
        couts: ref.couts,
        conso: ref.conso,
        frozenAt: ref.frozenAt,
        fileName: ref.fileName,
        pending: differs(ref, cur)
          ? { caNet: total(cur.caNet), couts: total(cur.couts), conso: total(cur.conso), fileName: p.fileName, fileMtime: p.fileMtime }
          : null,
      };
    }
  }
  if (changed) writeJson(FILE, refs);
  return projects;
}

/** Prend en compte la version actuelle du CEP comme nouvelle référence. `keys` / `year` absents = tous. */
export function acceptBudgetRefs(projects, { keys, year } = {}) {
  const from = getConfig().budgetRefYear;
  const wanted = Array.isArray(keys) ? new Set(keys.map(String)) : null;
  let count = 0;
  for (const p of projects) {
    if (wanted && !wanted.has(p.key)) continue;
    for (const y of years(p, from)) {
      if (year && Number(year) !== y) continue;
      const cur = currentYear(p, y);
      const ref = refs[p.key]?.[y];
      if (ref ? !differs(ref, cur) : !hasData(cur)) continue;
      (refs[p.key] ||= {})[y] = snapshot(p, cur);
      count += 1;
    }
  }
  if (count) writeJson(FILE, refs);
  return { accepted: count };
}
