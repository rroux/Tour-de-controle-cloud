import React, { useMemo } from "react";
import Band from "../components/Band.jsx";
import { Lines, Spark } from "../components/charts.jsx";
import { Block, Empty } from "../components/ui.jsx";
import { fr, jours, monthLabel, MONTHS, pct, signed } from "../format.js";
import { cumulate, portfolioRef, yearMonths } from "../model.js";

const HEAT = ["--h0", "--h1", "--h2", "--h3", "--h4", "--h5"];
const WORKING_DAYS = 20.8;

// Jours Pilot réalisés d'un projet pour un mois (0 après son mois de référence).
const pilotAt = (p, m) => (!p.moisRef || m <= p.moisRef ? p.activite?.joursPilot?.[m] || 0 : 0);

export default function Activite({ projects, filters, go }) {
  const { year } = filters;
  const months = yearMonths(year);
  const ref = portfolioRef(projects);
  const refIndex = ref && ref.startsWith(`${year}-`) ? Number(ref.slice(5)) - 1 : ref && ref < `${year}-01` ? -1 : 11;

  const pilot = months.map((m) => projects.reduce((a, p) => a + pilotAt(p, m), 0));
  const prev = months.map((m) => projects.reduce((a, p) => a + (p.activite?.joursPrev?.[m] || 0), 0));
  const budget = months.map((m) => projects.reduce((a, p) => a + (p.budget?.conso?.[m] || 0), 0));
  const hasBudget = budget.some(Boolean);
  const ytdPilot = pilot.reduce((a, b) => a + b, 0);
  const ytdPrev = months.reduce((a, m, i) => a + (i <= refIndex ? prev[i] : 0), 0);
  const raf = projects.reduce((a, p) => a + (p.kpi?.raf || 0), 0);
  const realMonths = Math.max(1, refIndex + 1);

  const roles = useMemo(() => {
    const map = new Map();
    for (const p of projects)
      for (const e of p.activite?.equipe || []) {
        const v = months.reduce((a, m) => a + (!p.moisRef || m <= p.moisRef ? e.jours[m] || 0 : 0), 0);
        if (v) map.set(e.role || "Non renseigné", (map.get(e.role || "Non renseigné") || 0) + v);
      }
    const list = [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    // Au-delà de 5 rôles, regroupement dans « Autres » pour garder des couleurs distinctes.
    if (list.length > 5) list.splice(4, list.length, { label: "Autres", value: list.slice(4).reduce((a, r) => a + r.value, 0) });
    return list;
  }, [projects, year]);

  // Plan de charge : réalisé Pilot jusqu'au mois de référence du projet, prévisionnel ensuite.
  const people = useMemo(() => {
    const rows = [];
    for (const p of projects) {
      const prevBy = new Map((p.activite?.equipePrev || []).map((e) => [e.trigramme || e.nom, e]));
      const keys = new Set([...(p.activite?.equipe || []).map((e) => e.trigramme || e.nom), ...prevBy.keys()]);
      const realBy = new Map((p.activite?.equipe || []).map((e) => [e.trigramme || e.nom, e]));
      for (const k of keys) {
        const r = realBy.get(k), f = prevBy.get(k);
        const vals = months.map((m) => (!p.moisRef || m <= p.moisRef ? r?.jours[m] || 0 : f?.jours[m] || 0));
        if (vals.some(Boolean)) rows.push({ id: `${p.key}-${k}`, trig: (r || f).trigramme, nom: (r || f).nom, role: (r || f).role, project: p.key, vals, future: months.map((m) => p.moisRef && m > p.moisRef) });
      }
    }
    return rows.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [projects, year]);

  const band = (
    <Band
      eyebrow={`Jours consommés Pilot comparés au prévisionnel · ${projects.length} projet${projects.length > 1 ? "s" : ""} · exercice ${year}`}
      title="Activité"
      filters={filters}
      showPeriod={false}
      figures={[
        { k: "Jours consommés Pilot", v: fr(Math.round(ytdPilot)), d: ref ? `janvier → ${monthLabel(ref)}` : "" },
        {
          k: "Écart au prévisionnel",
          v: ytdPrev ? `${signed(ytdPilot - ytdPrev, (v) => fr(Math.round(v)))} j` : "—",
          d: ytdPrev ? `${signed((ytdPilot - ytdPrev) / ytdPrev, (v) => pct(v))} sur la période réalisée` : "aucun prévisionnel saisi",
          tone: ytdPrev ? (ytdPilot > ytdPrev ? "down" : "up") : "",
        },
        { k: "Reste à faire", v: `${fr(Math.round(raf))} j`, d: "selon les CEP" },
        { k: "ETP moyen", v: fr(ytdPilot / realMonths / WORKING_DAYS, 1), d: `base ${fr(WORKING_DAYS, 1)} jours ouvrés par mois` },
      ]}
    />
  );

  if (!projects.length) {
    return (
      <>
        <main><div className="wrap">{band}<div className="card"><Empty title="Aucune activité">Aucun CEP consolidé pour ce filtre.</Empty></div></div></main>
      </>
    );
  }

  const maxCell = Math.max(1, ...people.flatMap((r) => r.vals));

  return (
    <>
      <main>
        <div className="wrap">
          {band}
          <div className="g12">
            <Block
              className="c8"
              title="Consommation cumulée des jours"
              note={
                <div className="legend">
                  <span><i style={{ borderColor: "var(--s1)" }} />Consommé Pilot</span>
                  <span><i style={{ borderColor: "var(--s3)" }} />Prévisionnel</span>
                  {hasBudget && <span><i className="dash" style={{ borderColor: "var(--ink-3)" }} />Trajectoire initiale</span>}
                </div>
              }
            >
              <div className="card">
                <Lines
                  year={year}
                  refIndex={refIndex}
                  fmt={(v) => jours(v)}
                  label="Jours cumulés consommés, prévisionnels et trajectoire initiale"
                  series={[
                    { name: "Consommé Pilot", data: cumulate(pilot.map((v, i) => (i <= refIndex ? v : null))), color: "var(--s1)", area: true },
                    { name: "Prévisionnel", data: cumulate(prev), color: "var(--s3)" },
                    ...(hasBudget ? [{ name: "Trajectoire initiale", data: cumulate(budget), color: "var(--ink-3)", dash: true, thin: true }] : []),
                  ]}
                />
              </div>
            </Block>
            <Block className="c4" title="Jours par rôle" note={`Réalisé ${year}`}>
              <div className="card flush">
                {roles.length ? (
                  <table>
                    <tbody>
                      {roles.map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td style={{ width: "42%" }}>
                            <div style={{ height: 8, borderRadius: 2, background: "var(--s1)", width: `${(r.value / roles[0].value) * 100}%` }} />
                          </td>
                          <td className="n">{jours(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted" style={{ padding: 12 }}>Aucun rôle renseigné dans l'onglet Activité.</p>
                )}
              </div>
            </Block>

            <Block className="c12" title="Activité par projet" note="Cliquer une ligne pour ouvrir le projet">
              <div className="card flush tw">
                <table>
                  <thead>
                    <tr>
                      <th>Projet</th><th className="n">Vendus</th><th className="n">Objectif</th><th className="n">Consommés</th>
                      <th className="n">Reste à faire</th><th>Jours / mois {year}</th><th className="n">Écart prév.</th><th className="n">Dérive / obj.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const real = months.reduce((a, m) => a + pilotAt(p, m), 0);
                      const pr = months.reduce((a, m) => a + (!p.moisRef || m <= p.moisRef ? p.activite?.joursPrev?.[m] || 0 : 0), 0);
                      const series = months.map((m) => (!p.moisRef || m <= p.moisRef ? pilotAt(p, m) : p.activite?.joursPrev?.[m] || 0));
                      const k = p.kpi || {};
                      return (
                        <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                          <td><b>{p.key}</b> <span className="muted">{p.client}</span></td>
                          <td className="n">{fr(k.joursVendus)}</td>
                          <td className="n">{fr(k.joursObjectif)}</td>
                          <td className="n">{fr(Math.round(k.conso?.cumul || 0))}</td>
                          <td className="n">{fr(Math.round(k.raf || 0))}</td>
                          <td><Spark data={series} refIndex={p.moisRef?.startsWith(`${year}-`) ? Number(p.moisRef.slice(5)) - 1 : 11} label={`Jours par mois ${p.key}`} /></td>
                          <td className="n">{pr ? signed((real - pr) / pr, (v) => pct(v)) : "—"}</td>
                          <td className="n">{signed(k.pctDeriveObjectif || 0, (v) => pct(v))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Block>

            <Block className="c12" title="Plan de charge par collaborateur" note="Jours par mois · réalisé Pilot puis prévisionnel (cases atténuées)">
              <div className="card tw">
                {people.length ? (
                  <div className="heat" style={{ gridTemplateColumns: "minmax(200px, auto) repeat(12, minmax(36px, 1fr))" }}>
                    <div />
                    {MONTHS.map((m, i) => <div key={m} className="ch">{m}{i > refIndex ? "*" : ""}</div>)}
                    {people.map((r) => (
                      <React.Fragment key={r.id}>
                        <div className="rh" title={`${r.nom} · ${r.role} · ${r.project}`}>
                          <span className="mono">{r.trig}</span>
                          <span>{r.nom}</span>
                          <span className="mono">{r.project}</span>
                        </div>
                        {r.vals.map((v, i) => {
                          const lvl = v ? Math.min(5, 1 + Math.floor((v / maxCell) * 4.99)) : 0;
                          return (
                            <div
                              key={i}
                              className="c"
                              title={`${r.nom} · ${MONTHS[i]} ${year} : ${fr(v, 1)} j${r.future[i] ? " (prévisionnel)" : ""}`}
                              style={{ background: `var(${HEAT[lvl]})`, color: lvl >= 3 ? "var(--paper)" : "var(--ink)", opacity: r.future[i] ? 0.55 : 1 }}
                            >
                              {v ? fr(v) : ""}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Aucune consommation par collaborateur dans les CEP.</p>
                )}
              </div>
            </Block>
          </div>
        </div>
      </main>
    </>
  );
}
