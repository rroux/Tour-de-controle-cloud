import React, { useMemo } from "react";
import Band from "../components/Band.jsx";
import { Lines, MonthBars, Spark } from "../components/charts.jsx";
import { Block, Empty } from "../components/ui.jsx";
import { fr, jours, monthLabel, MONTHS, pct, signed } from "../format.js";
import { budgetLabel, budgetOf, cumulate, gainIa, gainIaAt, joursAnnee, joursAtterrissage, joursBudget, portfolioRef, raf as rafOf, yearMonths } from "../model.js";

// Écart réel − budget en jours et en %, vert si on consomme moins que prévu.
function GapJ({ real, bud }) {
  if (!bud) return <span className="muted">—</span>;
  const d = real - bud;
  return <span className={d <= 0 ? "delta-up" : "delta-down"}>{signed(d, (v) => fr(Math.round(v)))} <small>({signed(d / bud, (v) => pct(v, 0))})</small></span>;
}

const HEAT = ["--h0", "--h1", "--h2", "--h3", "--h4", "--h5"];

// Jours Pilot réalisés d'un projet pour un mois (0 après son mois de référence).
const pilotAt = (p, m) => (!p.moisRef || m <= p.moisRef ? p.activite?.joursPilot?.[m] || 0 : 0);

export default function Activite({ projects, filters, go }) {
  const { year } = filters;
  const months = yearMonths(year);
  const ref = portfolioRef(projects);
  const refIndex = ref && ref.startsWith(`${year}-`) ? Number(ref.slice(5)) - 1 : ref && ref < `${year}-01` ? -1 : 11;

  const pilot = months.map((m) => projects.reduce((a, p) => a + pilotAt(p, m), 0));
  const prev = months.map((m) => projects.reduce((a, p) => a + (p.activite?.joursPrev?.[m] || 0), 0));
  const budget = months.map((m) => projects.reduce((a, p) => a + (budgetOf(p, year).conso?.[m] || 0), 0));
  const bl = budgetLabel(year);
  const Bl = bl[0].toUpperCase() + bl.slice(1);
  const hasBudget = budget.some(Boolean);
  const ytdPilot = pilot.reduce((a, b) => a + b, 0);
  const budADate = projects.reduce((a, p) => a + joursBudget(p, year, true), 0);
  const budAn = projects.reduce((a, p) => a + joursBudget(p, year), 0);
  const atterr = projects.reduce((a, p) => a + joursAtterrissage(p, year), 0);
  const raf = projects.reduce((a, p) => a + rafOf(p, year), 0);
  const gains = projects.map((p) => ({ p, g: gainIa(p, year) })).filter((x) => x.g.annee || x.g.projet).sort((a, b) => b.g.annee - a.g.annee);
  const gainM = months.map((m) => projects.reduce((a, p) => a + gainIaAt(p, m), 0));
  const gainTot = gains.reduce((a, x) => ({ realise: a.realise + x.g.realise, prevu: a.prevu + x.g.prevu, annee: a.annee + x.g.annee, projet: a.projet + x.g.projet }), { realise: 0, prevu: 0, annee: 0, projet: 0 });

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

  // Répartition de chaque collaborateur entre les projets : jours Pilot réalisés de l'année, sans prévisionnel.
  const split = useMemo(() => {
    const map = new Map();
    for (const p of projects)
      for (const e of p.activite?.equipe || []) {
        const v = months.reduce((a, m) => a + (!p.moisRef || m <= p.moisRef ? e.jours[m] || 0 : 0), 0);
        if (v <= 0) continue;
        const id = e.trigramme || e.nom;
        const r = map.get(id) || { id, trig: e.trigramme, nom: e.nom, role: e.role, total: 0, by: new Map() };
        r.total += v;
        r.by.set(p.key, (r.by.get(p.key) || 0) + v);
        map.set(id, r);
      }
    const rows = [...map.values()].map((r) => ({ ...r, parts: [...r.by.entries()].sort((a, b) => b[1] - a[1]) }));
    rows.sort((a, b) => b.parts.length - a.parts.length || a.nom.localeCompare(b.nom, "fr"));
    // Une couleur par projet pour les 5 projets les plus consommés, les autres en gris.
    const byProject = new Map();
    for (const r of rows) for (const [k, v] of r.parts) byProject.set(k, (byProject.get(k) || 0) + v);
    const colors = new Map([...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k], i) => [k, `var(--s${i + 1})`]));
    return { rows, colors, others: byProject.size > 5 };
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
          k: `Écart au ${bl}`,
          v: budADate ? `${signed(ytdPilot - budADate, (v) => fr(Math.round(v)))} j` : "—",
          d: budADate ? `${signed((ytdPilot - budADate) / budADate, (v) => pct(v))} · budget à date ${fr(Math.round(budADate))} j` : `${bl} non disponible`,
          tone: budADate ? (ytdPilot > budADate ? "down" : "up") : "",
        },
        {
          k: `Atterrissage ${year}`,
          v: `${fr(Math.round(atterr))} j`,
          d: budAn ? <>budget {fr(Math.round(budAn))} j <GapJ real={atterr} bud={budAn} /></> : "réalisé + prévisionnel de l'onglet Activité",
        },
        { k: "Reste à faire", v: `${fr(Math.round(raf))} j`, d: `prévisionnel ${year} de l'onglet Activité après le mois de référence` },

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
                  {hasBudget && <span><i className="dash" style={{ borderColor: "var(--ink-3)" }} />{Bl}</span>}
                </div>
              }
            >
              <div className="card">
                <Lines
                  year={year}
                  refIndex={refIndex}
                  fmt={(v) => jours(v)}
                  label={`Jours cumulés consommés, prévisionnels et ${bl}`}
                  series={[
                    { name: "Consommé Pilot", data: cumulate(pilot.map((v, i) => (i <= refIndex ? v : null))), color: "var(--s1)", area: true },
                    { name: "Prévisionnel", data: cumulate(prev), color: "var(--s3)" },
                    ...(hasBudget ? [{ name: Bl, data: cumulate(budget), color: "var(--ink-3)", dash: true, thin: true }] : []),
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

            <Block className="c12" title="Activité par projet" note={`Réel Pilot contre ${bl} · atterrissage = réalisé + prévisionnel · survoler le reste à faire pour le détail par mois`}>
              <div className="card flush tw">
                <table>
                  <thead>
                    <tr>
                      <th>Projet</th><th className="n">Consommés à date</th><th className="n">Budget à date</th><th className="n">Écart</th>
                      <th className="n">Atterrissage {year}</th><th className="n">Budget {year}</th><th className="n">Écart</th>
                      <th className="n">Reste à faire {year}</th><th>Jours / mois {year}</th><th className="n">Gain IA {year}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const real = months.reduce((a, m) => a + pilotAt(p, m), 0);
                      const bd = joursBudget(p, year, true), ba = joursBudget(p, year), at = joursAtterrissage(p, year);
                      const rafDetail = months.map((m) => [m, p.activite?.joursPrev?.[m] || 0]).filter(([m, v]) => m > (p.moisRef || "") && v).map(([m, v]) => `${monthLabel(m)} : ${fr(v, 1)} j`).join("\n");
                      const series = months.map((m) => (!p.moisRef || m <= p.moisRef ? pilotAt(p, m) : p.activite?.joursPrev?.[m] || 0));
                      const g = gainIa(p, year);
                      return (
                        <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                          <td><b>{p.key}</b> <span className="muted">{p.client}</span></td>
                          <td className="n">{fr(Math.round(real))}</td>
                          <td className="n">{bd ? fr(Math.round(bd)) : "—"}</td>
                          <td className="n"><GapJ real={real} bud={bd} /></td>
                          <td className="n">{fr(Math.round(at))}</td>
                          <td className="n">{ba ? fr(Math.round(ba)) : "—"}</td>
                          <td className="n"><GapJ real={at} bud={ba} /></td>
                          <td className="n" title={rafDetail ? `Prévisionnel après ${monthLabel(p.moisRef)} :\n${rafDetail}` : undefined}>{fr(Math.round(rafOf(p, year)))}</td>
                          <td><Spark data={series} refIndex={p.moisRef?.startsWith(`${year}-`) ? Number(p.moisRef.slice(5)) - 1 : 11} label={`Jours par mois ${p.key}`} /></td>
                          <td className="n">{g.annee ? `${fr(g.annee, 1)} j` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Block>

            <Block
              className="c12"
              title="Répartition des collaborateurs par projet"
              note={`Part des jours Pilot de chaque collaborateur, réalisé ${year} sans prévisionnel · un collaborateur = son trigramme sur tous les CEP`}
            >
              <div className="card flush tw">
                {split.rows.length ? (
                  <>
                    <div className="legend" style={{ padding: "10px 12px 0" }}>
                      {[...split.colors.entries()].map(([k, c]) => <span key={k}><i className="sq" style={{ background: c }} />{k}</span>)}
                      {split.others && <span><i className="sq" style={{ background: "var(--none-bg)" }} />Autres projets</span>}
                    </div>
                    <table>
                      <thead>
                        <tr><th>Collaborateur</th><th>Rôle</th><th className="n">Jours Pilot {year}</th><th style={{ width: "30%" }}>Répartition</th><th>Projets</th></tr>
                      </thead>
                      <tbody>
                        {split.rows.map((r) => (
                          <tr key={r.id}>
                            <td><span className="mono">{r.trig}</span> {r.nom}</td>
                            <td>{r.role || "—"}</td>
                            <td className="n">{fr(r.total, 1)}</td>
                            <td>
                              <div className="split" role="img" aria-label={r.parts.map(([k, v]) => `${k} ${pct(v / r.total, 0)}`).join(", ")}>
                                {r.parts.map(([k, v]) => <span key={k} title={`${k} : ${fr(v, 1)} j (${pct(v / r.total, 0)})`} style={{ width: `${(v / r.total) * 100}%`, background: split.colors.get(k) || "var(--none-bg)" }} />)}
                              </div>
                            </td>
                            <td style={{ whiteSpace: "normal" }}>{r.parts.map(([k, v]) => `${k} ${pct(v / r.total, 0)}`).join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="muted" style={{ padding: 12 }}>Aucune consommation Pilot par collaborateur en {year}.</p>
                )}
              </div>
            </Block>

            <Block className="c5" title={`Gain IA ${year}`} note="Profil ZZZ_GAIN_IA de l'onglet Activité">
              <div className="card">
                {gains.length ? (
                  <>
                    <div className="bud">
                      <div><span>Gain {year}</span><b>{fr(gainTot.annee, 1)} j</b><small>dont réalisé {fr(gainTot.realise, 1)} j</small></div>
                      <div><span>Part des jours consommés</span><b>{ytdPilot ? pct(gainTot.realise / ytdPilot) : "—"}</b><small>réalisé {year}</small></div>
                      <div><span>Sur la durée des projets</span><b>{fr(gainTot.projet, 1)} j</b><small>{gains.length} projet{gains.length > 1 ? "s" : ""}</small></div>
                    </div>
                    <MonthBars
                      year={year}
                      refIndex={refIndex}
                      height={170}
                      label={`Gain IA mensuel ${year}`}
                      fmt={(v) => `${fr(v)} j`}
                      tipFmt={(v) => `${fr(v, 1)} j`}
                      series={[{ name: "Gain IA", data: gainM, color: "var(--s3)" }]}
                    />
                  </>
                ) : (
                  <p className="muted">Aucun gain IA saisi dans les CEP (ligne ZZZ_GAIN_IA de l'onglet Activité).</p>
                )}
              </div>
            </Block>
            <Block className="c7" title="Gain IA par projet" note="Jours gagnés · cliquer pour ouvrir le projet">
              <div className="card flush tw">
                {gains.length ? (
                  <table>
                    <thead>
                      <tr><th>Projet</th><th className="n">Réalisé {year}</th><th className="n">Prévu {year}</th><th className="n">Total {year}</th><th className="n">Durée du projet</th></tr>
                    </thead>
                    <tbody>
                      {gains.map(({ p, g }) => (
                        <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                          <td><b>{p.key}</b> <span className="muted">{p.client}</span></td>
                          <td className="n">{fr(g.realise, 1)}</td>
                          <td className="n">{fr(g.prevu, 1)}</td>
                          <td className="n"><b>{fr(g.annee, 1)} j</b></td>
                          <td className="n">{fr(g.projet, 1)} j</td>
                        </tr>
                      ))}
                      <tr className="hl"><td>Total</td><td className="n">{fr(gainTot.realise, 1)}</td><td className="n">{fr(gainTot.prevu, 1)}</td><td className="n">{fr(gainTot.annee, 1)} j</td><td className="n">{fr(gainTot.projet, 1)} j</td></tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="muted" style={{ padding: 12 }}>Aucun projet avec un gain IA.</p>
                )}
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
