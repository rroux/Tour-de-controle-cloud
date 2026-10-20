import React, { useMemo } from "react";
import Band from "../components/Band.jsx";
import { Lines } from "../components/charts.jsx";
import { Block, Empty, Pill, Status } from "../components/ui.jsx";
import { fr, keur, monthLabel, MONTHS, pct, signed } from "../format.js";
import { alerts as buildAlerts, budgetFigures, cumulate, figures, portfolioRef, portfolioTrack, status, totalBudgetFigures } from "../model.js";

const PERIOD = "annee";

// Écart réel − budget : montant signé et pourcentage du budget, vert si favorable.
function Gap({ real, bud, show = true }) {
  if (!show || !bud) return <span className="muted">—</span>;
  const d = real - bud;
  return (
    <span className={d >= 0 ? "delta-up" : "delta-down"}>
      {signed(d, keur)} <small>({signed(d / Math.abs(bud), (v) => pct(v, 0))})</small>
    </span>
  );
}

export default function Portefeuille({ projects, data, filters, go }) {
  const { year, dp } = filters;
  const ref = portfolioRef(projects);
  const refIndex = ref && ref.startsWith(`${year}-`) ? Number(ref.slice(5)) - 1 : ref && ref < `${year}-01` ? -1 : 11;

  const tot = useMemo(() => totalBudgetFigures(projects, year), [projects, year]);
  const track = useMemo(() => portfolioTrack(projects, year), [projects, year]);
  const rows = useMemo(
    () =>
      projects
        .map((p) => {
          const f = figures(p, PERIOD, year);
          return { p, b: budgetFigures(p, year), s: status(p, f) };
        })
        .sort((a, b) => a.b.marge - a.b.budMarge - (b.b.marge - b.b.budMarge)),
    [projects, year],
  );
  const counts = rows.reduce((a, r) => ({ ...a, [r.s.level]: (a[r.s.level] || 0) + 1 }), {});
  const alertList = buildAlerts(projects, [], PERIOD, year, data.staleDays);
  const taux = tot.ca ? tot.marge / tot.ca : 0;
  const budTaux = tot.budCa ? tot.budMarge / tot.budCa : null;
  const budgetOk = tot.withBudget > 0;

  const band = (
    <Band
      title={dp ? `Portefeuille de ${dp}` : "Portefeuille de tous les DP"}
      eyebrow={`${projects.length} projet${projects.length > 1 ? "s" : ""} · réel et budget sur la base du CA net${ref ? ` · réalisé jusqu'à ${monthLabel(ref)}` : ""}`}
      filters={filters}
      showPeriod={false}
      figures={[
        {
          k: "CA net réalisé",
          v: keur(tot.ca),
          d: budgetOk ? <>budget à date {keur(tot.budCa)} <Gap real={tot.ca} bud={tot.budCa} /></> : "trajectoire initiale non enregistrée",
        },
        {
          k: "Marge réalisée",
          v: keur(tot.marge),
          d: (
            <>
              {pct(taux)} du CA net
              {budgetOk && budTaux != null && (
                <span className={taux >= budTaux ? "delta-up" : "delta-down"}>
                  {taux >= budTaux ? "▲" : "▼"} {fr(Math.abs(taux - budTaux) * 100, 1)} pt vs budget
                </span>
              )}
            </>
          ),
        },
        {
          k: `Atterrissage marge ${year}`,
          v: keur(tot.margeAn),
          d: budgetOk ? <>budget {keur(tot.budMargeAn)} <Gap real={tot.margeAn} bud={tot.budMargeAn} /></> : `CA net ${keur(tot.caAn)}`,
        },
        {
          k: "État du portefeuille",
          v: `${counts.ok || 0} / ${projects.length}`,
          unit: " conformes",
          d: `${counts.warn || 0} à surveiller · ${counts.crit || 0} critique${(counts.crit || 0) > 1 ? "s" : ""}`,
          tone: counts.crit ? "down" : "",
        },
      ]}
    />
  );

  if (!projects.length) {
    return (
      <main>
        <div className="wrap">
          {band}
          <div className="card"><Empty title="Aucun projet">Aucun CEP consolidé pour ce directeur de projet et ces filtres.</Empty></div>
        </div>
      </main>
    );
  }

  const chart = (title, real, bud) => (
    <Block
      title={title}
      note={
        <div className="legend">
          <span><i style={{ borderColor: "var(--s1)" }} />Réel{refIndex < 11 ? " puis prévisionnel" : ""}</span>
          <span><i className="dash" style={{ borderColor: "var(--ink-3)" }} />Budget</span>
        </div>
      }
    >
      <div className="card">
        {budgetOk ? null : <p className="banner">Aucun CEP de ce portefeuille n'a de trajectoire initiale enregistrée (onglet Projection) : seul le réel est affiché.</p>}
        <Lines
          year={year}
          refIndex={refIndex}
          fmt={keur}
          label={`${title}, cumul ${year}`}
          series={[
            { name: "Réel", data: cumulate(real), color: "var(--s1)", area: true, split: true },
            ...(budgetOk ? [{ name: "Budget", data: cumulate(bud), color: "var(--ink-3)", dash: true, thin: true }] : []),
          ]}
          extraRows={(i) => (budgetOk ? [["Écart", signed(cumulate(real)[i] - cumulate(bud)[i], keur)]] : [])}
        />
      </div>
    </Block>
  );

  return (
    <main>
      <div className="wrap">
        {band}

        <div className="grid2 eq">
          {chart("Avancement de la marge : réelle et budgétée", track.marge, track.budMarge)}
          {chart("Avancement du CA net : réel et budgété", track.ca, track.budCa)}
        </div>

        <Block title={`Mois par mois ${year}`} note="Montants mensuels · prévisionnel en italique">
          <div className="card flush tw">
            <table className="months">
              <thead>
                <tr><th />{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}<th className="n">Total</th></tr>
              </thead>
              <tbody>
                {[
                  ["CA net réel", track.ca, ""],
                  ["CA net budget", track.budCa, "sub"],
                  ["Marge réelle", track.marge, "hl0"],
                  ["Marge budget", track.budMarge, "sub"],
                ].map(([l, arr, cls]) => (
                  <tr key={l} className={cls}>
                    <td>{l}</td>
                    {arr.map((v, i) => <td key={i} className={`n${!l.includes("budget") && i > refIndex ? " fc" : ""}`}>{fr(Math.round(v / 1000))}</td>)}
                    <td className="n"><b>{keur(arr.reduce((a, v) => a + v, 0))}</b></td>
                  </tr>
                ))}
                <tr className="hl">
                  <td>Écart de marge</td>
                  {track.marge.map((v, i) => {
                    const d = v - track.budMarge[i];
                    return <td key={i} className={`n ${d >= 0 ? "delta-up" : "delta-down"}`}>{budgetOk ? signed(Math.round(d / 1000), fr) : "—"}</td>;
                  })}
                  <td className="n">{budgetOk ? signed(tot.margeAn - tot.budMargeAn, keur) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Block>

        <div className="grid2">
          <Block title="Projets du portefeuille" note="Réalisé à date contre budget · plus gros retard de marge en tête">
            <div className="card flush tw">
              <table>
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th className="n">CA net</th>
                    <th className="n">vs budget</th>
                    <th className="n">Marge</th>
                    <th className="n">vs budget</th>
                    <th className="n">Taux</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, b, s }) => (
                    <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                      <td>
                        <div>{p.client || "—"} · {p.projet || p.fileName}</div>
                        <div className="mono">{p.key}{p.moisRef ? ` · réf. ${monthLabel(p.moisRef)}` : ""}</div>
                      </td>
                      <td className="n">{keur(b.ca)}</td>
                      <td className="n" title={b.hasBudget ? `Budget à date ${keur(b.budCa)}` : "Trajectoire initiale non enregistrée"}><Gap real={b.ca} bud={b.budCa} show={b.hasBudget} /></td>
                      <td className="n">{keur(b.marge)}</td>
                      <td className="n" title={b.hasBudget ? `Budget à date ${keur(b.budMarge)}` : "Trajectoire initiale non enregistrée"}><Gap real={b.marge} bud={b.budMarge} show={b.hasBudget} /></td>
                      <td className="n">{pct(b.ca ? b.marge / b.ca : 0)}</td>
                      <td><Status s={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
          <Block title="Points d'attention">
            <div className="card">
              {alertList.length ? (
                <ul className="alerts">
                  {alertList.slice(0, 30).map((a, i) => (
                    <li key={i} className={a.key ? "click" : ""} onClick={a.key ? () => go("projets", a.key) : undefined}>
                      <Pill level={a.level}>{a.tag}</Pill>
                      <span>{a.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Aucun point d'attention.</p>
              )}
            </div>
          </Block>
        </div>
      </div>
    </main>
  );
}
