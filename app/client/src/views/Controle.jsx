import React, { useMemo, useState } from "react";
import Band from "../components/Band.jsx";
import { Block, Empty, Pill } from "../components/ui.jsx";
import { dateTimeFr, monthLabel } from "../format.js";
import { addMonths, controlMajFrom, controlMonth, dpOf, updateControl } from "../model.js";

const LEVELS = {
  late: { pill: "crit", label: "Non mis à jour", rank: 0 },
  partial: { pill: "warn", label: "Incomplet", rank: 1 },
  ok: { pill: "ok", label: "À jour", rank: 2 },
  off: { pill: "none", label: "Hors période", rank: 3 },
};

// Ce que vérifie chaque point de contrôle, affiché sous le tableau.
const HELP = [
  ["Mois de référence", "la date de référence du Sommaire est au moins le mois contrôlé"],
  ["Date de MAJ", "la date de mise à jour du Sommaire est récente (au plus tôt 7 jours avant la fin du mois contrôlé)"],
  ["Conso Pilot", "la consommation du mois est saisie dans l'onglet Activité (zone Pilot) ; une valeur négative est une régularisation, donc conforme"],
  ["Réel du CEP", "le CA net ou les coûts du mois sont renseignés dans l'onglet CEP"],
  ["Facturation réelle", "la facturation réelle est saisie quand une facturation est prévue ce mois"],
  ["Prévisionnel", "des jours sont prévus après ce mois tant que le projet n'est pas terminé"],
  ["Budget", "le budget de l'exercice existe : trajectoire initiale de l'onglet Projection, ou budget de référence figé à partir de l'exercice réglé dans les paramètres"],
];

function Mark({ c }) {
  if (c.ok == null) return <span className="ctl na" title={c.detail}>–</span>;
  return (
    <span className={`ctl ${c.ok ? "ok" : "ko"}`} title={c.detail}>
      {c.ok ? "✓" : "✗"}
      <span className="sr">{c.ok ? "conforme" : "à corriger"}</span>
    </span>
  );
}

export default function Controle({ projects, filters, go }) {
  const def = controlMonth();
  const [month, setMonth] = useState(def);
  const options = Array.from({ length: 12 }, (_, i) => addMonths(def, -i));

  const rows = useMemo(
    () =>
      projects
        .map((p) => ({ p, c: updateControl(p, month) }))
        .sort((a, b) => LEVELS[a.c.level].rank - LEVELS[b.c.level].rank || a.p.key.localeCompare(b.p.key, "fr")),
    [projects, month],
  );
  const count = rows.reduce((a, r) => ({ ...a, [r.c.level]: (a[r.c.level] || 0) + 1 }), {});
  const actifs = rows.length - (count.off || 0);
  const labels = rows[0]?.c.checks.map((c) => c.label) || HELP.map((h) => h[0]);

  const band = (
    <Band
      title="Contrôle des mises à jour"
      eyebrow={`Vérifie que chaque CEP est réellement mis à jour pour ${monthLabel(month)}, pas seulement présent sur le partage`}
      filters={filters}
      showPeriod={false}
      figures={[
        { k: "À jour", v: `${count.ok || 0} / ${actifs}`, unit: " projets", d: `pour ${monthLabel(month)}`, tone: actifs && count.ok === actifs ? "up" : "" },
        { k: "Incomplets", v: String(count.partial || 0), d: "mois de référence à jour, saisie partielle", tone: count.partial ? "down" : "" },
        { k: "Non mis à jour", v: String(count.late || 0), d: "mois de référence antérieur", tone: count.late ? "down" : "" },
        { k: "Hors période", v: String(count.off || 0), d: "projet non démarré ou terminé" },
      ]}
    />
  );

  if (!projects.length) {
    return (
      <main>
        <div className="wrap">
          {band}
          <div className="card"><Empty title="Aucun projet">Aucun CEP consolidé pour ce filtre.</Empty></div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="wrap">
        {band}
        <Block
          title="Points de contrôle par projet"
          note={
            <select className="i" style={{ width: "auto" }} aria-label="Mois contrôlé" value={month} onChange={(e) => setMonth(e.target.value)}>
              {options.map((m) => (
                <option key={m} value={m}>Mois contrôlé : {monthLabel(m)}</option>
              ))}
            </select>
          }
        >
          <div className="card flush tw">
            <table className="ctl-table">
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>DP</th>
                  <th>Fichier enregistré</th>
                  {labels.map((l) => <th key={l} className="c">{l}</th>)}
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, c }) => (
                  <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                    <td>
                      <div>{p.client || "—"} · {p.projet || p.fileName}</div>
                      <div className="mono">{p.key} · réf. {monthLabel(p.moisRef)}</div>
                    </td>
                    <td>{dpOf(p)}</td>
                    <td className="mono">{p.fileMtime ? dateTimeFr(new Date(p.fileMtime).toISOString()) : "—"}</td>
                    {c.checks.map((x) => <td key={x.id} className="c"><Mark c={x} /></td>)}
                    <td title={c.failed.map((x) => x.detail).join("\n") || undefined}><Pill level={LEVELS[c.level].pill}>{LEVELS[c.level].label}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <p className="hint" style={{ marginTop: 0 }}>
              Survolez une case pour le détail. Un CEP est <b>à jour</b> quand tous les points applicables sont conformes (– = sans objet ce mois).
              Date de MAJ attendue à partir du {controlMajFrom(month).split("-").reverse().join("/")}.
            </p>
            <ul className="help">
              {HELP.map(([k, v]) => <li key={k}><b>{k}</b> : {v}.</li>)}
            </ul>
          </div>
        </Block>
      </div>
    </main>
  );
}
