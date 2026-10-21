// Onglet Analyses : constats calculés à partir des données des CEP, sans service externe.
// Chaque constat : { theme, level (crit / warn / info), key (projet, ou null pour le portefeuille), title, text, score }.
// Les seuils sont regroupés ici pour pouvoir les ajuster facilement.
import { fr, keur, monthLabel, pct, signed } from "./format.js";
import { budgetFigures, budgetOf, controlMonth, currentMonth, dpOf, isReal, raf, updateControl, yearMonths } from "./model.js";

export const THEMES = [
  { id: "marge", label: "Marge" },
  { id: "charge", label: "Charge et jours" },
  { id: "facturation", label: "Facturation" },
  { id: "pam", label: "PAM" },
  { id: "portefeuille", label: "Portefeuille" },
  { id: "qualite", label: "Qualité des CEP" },
];

const T = {
  glissementMois: 3, // baisses consécutives du taux de marge
  ecartMargeWarn: -0.03, // écart de taux réel − budget (à date ou fin d'année)
  ecartMargeCrit: -0.08,
  prevOptimiste: 0.05, // taux des mois prévisionnels − taux des mois réalisés
  deriveJoursWarn: 0.1, // consommé / budget à date − 1
  deriveJoursCrit: 0.2,
  joursMoisMax: 21, // jours par personne et par mois
  retardFactWarn: -0.1, // facturé / théorique − 1, cumul à date
  retardFactCrit: -0.25,
  retardFactMin: 10000,
  nonFactureShare: 0.15, // CA reconnu non facturé, en part du CA
  nonFactureMin: 20000,
  concentrationTop3: 0.6,
  concentrationClient: 0.4,
  finContratMois: 6,
  ecartDp: -0.05,
  tjmEcart: 0.15,
};

const pt = (v) => `${signed(v * 100, (x) => fr(x, 1))} pt`;
const rate = (m, c) => (c ? m / c : null);
const sumM = (o, months) => months.reduce((a, m) => a + (o?.[m] || 0), 0);
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const name = (p) => `${p.client || p.key} · ${p.projet || p.fileName}`;

function marge(p, year, out) {
  const months = yearMonths(year);
  const r = p.cep?.rows || {};
  const real = months.filter((m) => isReal(p, m) && (r.caNet?.[m] || 0) > 0);
  const rates = real.map((m) => (r.caNet[m] - (r.totalCharges?.[m] || 0)) / r.caNet[m]);
  // Glissement : baisses consécutives sur les derniers mois réalisés.
  let n = 0;
  for (let i = rates.length - 1; i > 0 && rates[i] < rates[i - 1]; i--) n++;
  if (n >= T.glissementMois) {
    const from = rates[rates.length - 1 - n], to = rates[rates.length - 1];
    out.push({ theme: "marge", level: to - from <= T.ecartMargeCrit ? "crit" : "warn", key: p.key, title: `Marge en baisse depuis ${n} mois`, text: `Taux de marge ${pct(from)} en ${monthLabel(real[real.length - 1 - n])} → ${pct(to)} en ${monthLabel(real[real.length - 1])} (${pt(to - from)}).`, score: to - from });
  }
  const b = budgetFigures(p, year);
  if (b.hasBudget) {
    const t = rate(b.marge, b.ca), bt = rate(b.budMarge, b.budCa);
    if (t != null && bt != null && t - bt <= T.ecartMargeWarn)
      out.push({ theme: "marge", level: t - bt <= T.ecartMargeCrit ? "crit" : "warn", key: p.key, title: "Marge à date sous le budget", text: `${pct(t)} réalisé contre ${pct(bt)} budgété à date (${pt(t - bt)}), soit ${keur(b.marge - b.budMarge)} de marge.`, score: t - bt });
    const ta = rate(b.margeAn, b.caAn), ba = rate(b.budMargeAn, b.budCaAn);
    if (ta != null && ba != null && ta - ba <= T.ecartMargeWarn)
      out.push({ theme: "marge", level: ta - ba <= T.ecartMargeCrit ? "crit" : "warn", key: p.key, title: `Atterrissage ${year} sous le budget`, text: `Fin d'année projetée à ${pct(ta)} contre ${pct(ba)} budgété (${pt(ta - ba)}), soit ${keur(b.margeAn - b.budMargeAn)}.`, score: ta - ba });
  }
  // Prévisionnel nettement plus rentable que le réalisé : CEP sans doute pas assez actualisé.
  const fc = months.filter((m) => !isReal(p, m) && (r.caNet?.[m] || 0) > 0);
  if (real.length >= 3 && fc.length) {
    const tr = rate(sumM(r.caNet, real) - sumM(r.totalCharges, real), sumM(r.caNet, real));
    const tf = rate(sumM(r.caNet, fc) - sumM(r.totalCharges, fc), sumM(r.caNet, fc));
    if (tr != null && tf != null && tf - tr >= T.prevOptimiste)
      out.push({ theme: "marge", level: "warn", key: p.key, title: "Prévisionnel optimiste", text: `Les mois prévisionnels ${year} affichent ${pct(tf)} de marge contre ${pct(tr)} sur les mois réalisés (${pt(tf - tr)}) : à vérifier avec le DP.`, score: -(tf - tr) });
  }
}

function charge(p, year, out) {
  const months = yearMonths(year);
  const realMonths = months.filter((m) => isReal(p, m));
  const conso = sumM(p.activite?.joursPilot, realMonths);
  const bud = budgetOf(p, year);
  const budADate = sumM(bud.conso, realMonths), budAn = sumM(bud.conso, months);
  if (budADate > 0) {
    const d = conso / budADate - 1;
    if (d >= T.deriveJoursWarn) {
      const rythme = realMonths.length ? (conso / realMonths.length) * 12 : 0;
      out.push({ theme: "charge", level: d >= T.deriveJoursCrit ? "crit" : "warn", key: p.key, title: "Jours consommés au-dessus du budget", text: `${fr(Math.round(conso))} j consommés contre ${fr(Math.round(budADate))} j budgétés à date (${signed(d, (v) => pct(v, 0))}). Au rythme actuel : ${fr(Math.round(rythme))} j sur l'année pour ${fr(Math.round(budAn))} j budgétés.`, score: -d });
    }
  }
  // Reste à faire vide ou impossible à absorber par l'équipe prévue.
  const end = p.dateFin?.slice(0, 7);
  if (end && p.moisRef && end > p.moisRef) {
    const reste = raf(p);
    const restants = Math.max(1, monthsBetween(p.moisRef, end));
    if (reste <= 0) out.push({ theme: "charge", level: "crit", key: p.key, title: "Prévisionnel vide", text: `Aucun jour prévu après ${monthLabel(p.moisRef)} alors que le projet se termine en ${monthLabel(end)}.`, score: -1 });
    else {
      const team = (p.activite?.equipePrev || []).filter((e) => Object.entries(e.jours).some(([m, v]) => m > p.moisRef && v > 0)).length || 1;
      const parPers = reste / restants / team;
      if (parPers > T.joursMoisMax)
        out.push({ theme: "charge", level: "warn", key: p.key, title: "Reste à faire difficile à absorber", text: `${fr(Math.round(reste))} j à faire en ${restants} mois avec ${team} personne${team > 1 ? "s" : ""} prévue${team > 1 ? "s" : ""}, soit ${fr(parPers, 1)} j par personne et par mois.`, score: -parPers / 100 });
    }
  }
}

// Collaborateurs prévus à plus de 21 jours par mois en cumulant tous les projets.
function surcharge(projects, year, out) {
  const months = yearMonths(year);
  const people = new Map();
  for (const p of projects) {
    const realBy = new Map((p.activite?.equipe || []).map((e) => [e.trigramme || e.nom, e]));
    const prevBy = new Map((p.activite?.equipePrev || []).map((e) => [e.trigramme || e.nom, e]));
    for (const k of new Set([...realBy.keys(), ...prevBy.keys()])) {
      const e = realBy.get(k) || prevBy.get(k);
      const cur = people.get(k) || { nom: e.nom, trig: e.trigramme, days: {}, projects: new Set() };
      for (const m of months) {
        const v = isReal(p, m) ? realBy.get(k)?.jours[m] || 0 : prevBy.get(k)?.jours[m] || 0;
        if (v) {
          cur.days[m] = (cur.days[m] || 0) + v;
          cur.projects.add(p.key);
        }
      }
      people.set(k, cur);
    }
  }
  for (const pe of people.values()) {
    const over = months.filter((m) => (pe.days[m] || 0) > T.joursMoisMax);
    if (!over.length) continue;
    const worst = Math.max(...over.map((m) => pe.days[m]));
    out.push({ theme: "charge", level: worst > T.joursMoisMax * 1.2 ? "crit" : "warn", key: null, title: `${pe.nom || pe.trig} surchargé${over.length > 1 ? ` sur ${over.length} mois` : ""}`, text: `Jusqu'à ${fr(worst, 1)} j en un mois (${over.length > 4 ? `${over.length} mois entre ${monthLabel(over[0])} et ${monthLabel(over[over.length - 1])}` : over.map(monthLabel).join(", ")}), sur ${[...pe.projects].join(", ")}.`, score: -worst / 100 });
  }
}

function facturation(p, year, out) {
  const real = yearMonths(year).filter((m) => isReal(p, m));
  const th = p.facturation?.theorique || {}, re = p.facturation?.reel || {};
  const sTh = sumM(th, real), sRe = sumM(re, real);
  if (sTh > 0) {
    const d = sRe / sTh - 1;
    if (d <= T.retardFactWarn && sTh - sRe >= T.retardFactMin)
      out.push({ theme: "facturation", level: d <= T.retardFactCrit ? "crit" : "warn", key: p.key, title: "Retard de facturation", text: `${keur(sRe)} facturés contre ${keur(sTh)} prévus à date en ${year} (${signed(d, (v) => pct(v, 0))}, ${keur(sTh - sRe)} de retard).`, score: d });
  }
  const ca = sumM(p.cep?.rows?.caBrut, real);
  if (ca > 0 && ca - sRe >= T.nonFactureMin && (ca - sRe) / ca >= T.nonFactureShare)
    out.push({ theme: "facturation", level: "warn", key: p.key, title: "CA produit non facturé", text: `${keur(ca)} de CA reconnu à date pour ${keur(sRe)} facturés : ${keur(ca - sRe)} (${pct((ca - sRe) / ca, 0)}) restent à facturer, risque de trésorerie.`, score: -(ca - sRe) / ca });
  const sans = real.filter((m) => (th[m] || 0) > 0 && !re[m]);
  if (sans.length >= 2)
    out.push({ theme: "facturation", level: "warn", key: p.key, title: `${sans.length} mois sans facturation`, text: `Facturation prévue mais non saisie en ${sans.map(monthLabel).join(", ")}.`, score: -sans.length / 10 });
}

function pam(p, out) {
  const today = new Date().toISOString().slice(0, 10);
  const done = (s) => /termin|realis|clos|abandon|annul/.test(fold(s));
  const open = (p.pam || []).filter((a) => !done(a.statut));
  const nonIntegres = open.filter((a) => !/^oui/i.test(a.integre || "") && (a.margePrevue || 0) > 0);
  if (nonIntegres.length) {
    const tot = nonIntegres.reduce((a, x) => a + x.margePrevue, 0);
    out.push({ theme: "pam", level: "info", key: p.key, title: `${nonIntegres.length} levier${nonIntegres.length > 1 ? "s" : ""} PAM non intégré${nonIntegres.length > 1 ? "s" : ""} au CEP`, text: `${fr(tot)} k€ de marge potentielle : ${nonIntegres.map((a) => a.description || a.levier).slice(0, 3).join(" ; ")}${nonIntegres.length > 3 ? "…" : ""}.`, score: -tot / 1e4 });
  }
  const late = open.filter((a) => a.fin && a.fin < today);
  if (late.length)
    out.push({ theme: "pam", level: "warn", key: p.key, title: `${late.length} levier${late.length > 1 ? "s" : ""} PAM en retard`, text: late.slice(0, 3).map((a) => `${a.description || a.levier} (fin prévue le ${a.fin.split("-").reverse().join("/")}, ${a.statut || "sans statut"})`).join(" ; ") + (late.length > 3 ? "…" : "."), score: -late.length / 10 });
}

function portefeuille(projects, year, out) {
  const months = yearMonths(year);
  const caOf = (p) => sumM(p.cep?.rows?.caNet, months);
  const total = projects.reduce((a, p) => a + caOf(p), 0);
  if (total > 0 && projects.length > 3) {
    const top = [...projects].sort((a, b) => caOf(b) - caOf(a)).slice(0, 3);
    const share = top.reduce((a, p) => a + caOf(p), 0) / total;
    if (share >= T.concentrationTop3)
      out.push({ theme: "portefeuille", level: "warn", key: null, title: "CA concentré sur 3 projets", text: `${top.map((p) => p.key).join(", ")} portent ${pct(share, 0)} du CA net ${year}.`, score: -share });
    const byClient = new Map();
    for (const p of projects) byClient.set(p.client || p.key, (byClient.get(p.client || p.key) || 0) + caOf(p));
    const [client, ca] = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0];
    if (byClient.size > 1 && ca / total >= T.concentrationClient)
      out.push({ theme: "portefeuille", level: "warn", key: null, title: `Dépendance au client ${client}`, text: `${client} représente ${pct(ca / total, 0)} du CA net ${year} (${keur(ca)}).`, score: -ca / total });
  }
  // Fins de contrat dans les prochains mois : CA mensuel qui disparaît.
  const now = currentMonth();
  for (const p of projects) {
    const end = p.dateFin?.slice(0, 7);
    if (!end || end < now) continue;
    const dans = monthsBetween(now, end);
    if (dans > T.finContratMois) continue;
    const last = (p.cep?.months || []).filter((m) => isReal(p, m) && (p.cep.rows.caNet?.[m] || 0) > 0).slice(-3);
    const moy = last.length ? sumM(p.cep.rows.caNet, last) / last.length : 0;
    out.push({ theme: "portefeuille", level: dans <= 3 ? "warn" : "info", key: p.key, title: `Fin de contrat en ${monthLabel(end)}`, text: `${dans <= 0 ? "Ce mois-ci" : `Dans ${dans} mois`}${moy ? ` : environ ${keur(moy)} de CA net mensuel à remplacer` : ""}. Renouvellement ou réaffectation de l'équipe à anticiper.`, score: -1 / (dans + 1) });
  }
  // Écart CA net réel / budget à date par DP.
  const byDp = new Map();
  for (const p of projects) {
    const b = budgetFigures(p, year);
    if (!b.hasBudget) continue;
    const cur = byDp.get(dpOf(p)) || { ca: 0, bud: 0, n: 0 };
    cur.ca += b.ca;
    cur.bud += b.budCa;
    cur.n += 1;
    byDp.set(dpOf(p), cur);
  }
  for (const [dp, v] of byDp) {
    if (!v.bud) continue;
    const d = v.ca / v.bud - 1;
    if (d <= T.ecartDp)
      out.push({ theme: "portefeuille", level: d <= 2 * T.ecartDp ? "crit" : "warn", key: null, dp, title: `Portefeuille ${dp} sous le budget de CA`, text: `${keur(v.ca)} de CA net à date contre ${keur(v.bud)} budgétés (${signed(d, (x) => pct(x, 0))}) sur ${v.n} projet${v.n > 1 ? "s" : ""}.`, score: d });
  }
}

function qualite(p, year, out) {
  const months = yearMonths(year);
  const r = p.cep?.rows || {};
  const start = p.dateDebut?.slice(0, 7) || "0000-00";
  const end = p.dateFin?.slice(0, 7) || "9999-99";
  const last = [p.moisRef || "0000-00", controlMonth()].sort()[0];
  const checked = months.filter((m) => m >= start && m <= end && m <= last);
  // Mois de l'année dont la saisie est incomplète (conso Pilot, réel du CEP, facturation réelle).
  const incomplets = checked.filter((m) => {
    const c = updateControl(p, m).checks;
    return ["pilot", "cep", "fact"].some((id) => c.find((x) => x.id === id)?.ok === false);
  });
  if (incomplets.length)
    out.push({ theme: "qualite", level: incomplets.length >= 3 ? "crit" : "warn", key: p.key, title: `${incomplets.length} mois de saisie incomplète en ${year}`, text: `${incomplets.map(monthLabel).join(", ")} : conso Pilot, réel du CEP ou facturation réelle manquant (détail dans Contrôle MAJ).`, score: -incomplets.length / 10 });
  const c = updateControl(p, controlMonth());
  if (c.level === "late")
    out.push({ theme: "qualite", level: "crit", key: p.key, title: "CEP non mis à jour", text: `Mois de référence ${monthLabel(p.moisRef)} pour un contrôle de ${c.monthLabel}.`, score: -1 });
  const real = months.filter((m) => isReal(p, m));
  const coutsSansCa = real.filter((m) => (r.totalCharges?.[m] || 0) > 0 && !(r.caNet?.[m] || 0));
  if (coutsSansCa.length) out.push({ theme: "qualite", level: "warn", key: p.key, title: "Coûts sans CA", text: `Coûts saisis sans CA en ${coutsSansCa.map(monthLabel).join(", ")}.`, score: -0.2 });
  const caSansJours = real.filter((m) => (r.caPresta?.[m] || 0) > 0 && !(p.activite?.joursPilot?.[m] || 0));
  if (caSansJours.length) out.push({ theme: "qualite", level: "warn", key: p.key, title: "CA de prestation sans jours consommés", text: `CA de prestation sans conso Pilot en ${caSansJours.map(monthLabel).join(", ")}.`, score: -0.2 });
  // TJM réalisé comparé au TJM vendu des bons de commande (moyenne pondérée par les jours).
  const jv = (p.bons || []).reduce((a, b) => a + (b.joursVendus || 0), 0);
  const tjmVendu = jv ? (p.bons || []).reduce((a, b) => a + (b.tjmVendu || 0) * (b.joursVendus || 0), 0) / jv : 0;
  const tjm = p.kpi?.tjm?.cumul || 0;
  if (tjmVendu > 0 && tjm > 0 && Math.abs(tjm / tjmVendu - 1) >= T.tjmEcart)
    out.push({ theme: "qualite", level: "warn", key: p.key, title: "TJM réalisé éloigné du TJM vendu", text: `TJM cumulé ${fr(Math.round(tjm))} € contre ${fr(Math.round(tjmVendu))} € vendus aux bons de commande (${signed(tjm / tjmVendu - 1, (v) => pct(v, 0))}).`, score: -Math.abs(tjm / tjmVendu - 1) });
  const bud = budgetOf(p, year);
  if (bud.pending)
    out.push({ theme: "qualite", level: "info", key: p.key, title: "Nouvelle version du CEP à valider", text: `Le CEP ${year} diffère du budget de référence figé le ${bud.frozenAt.slice(0, 10).split("-").reverse().join("/")} (Paramètres → Budget de référence).`, score: 0 });
}

const RANK = { crit: 0, warn: 1, info: 2 };

/** Tous les constats du portefeuille pour l'exercice, du plus grave au moins grave. */
export function analyses(projects, year) {
  const out = [];
  for (const p of projects) {
    const n = out.length;
    marge(p, year, out);
    charge(p, year, out);
    facturation(p, year, out);
    pam(p, out);
    qualite(p, year, out);
    for (let i = n; i < out.length; i++) out[i].project = name(p);
  }
  surcharge(projects, year, out);
  portefeuille(projects, year, out);
  return out.sort((a, b) => RANK[a.level] - RANK[b.level] || a.score - b.score);
}
