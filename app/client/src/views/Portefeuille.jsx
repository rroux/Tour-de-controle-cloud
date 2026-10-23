import React, { useMemo } from "react";
import Band from "../components/Band.jsx";
import BudgetTrack, { cumRate } from "../components/BudgetTrack.jsx";
import { Block, Empty, Pill, Status } from "../components/ui.jsx";
import { fr, keur, monthLabel, MONTHS, pct, signed } from "../format.js";
import { alerts as buildAlerts, budgetFigures, budgetLabel, controlMonth, cumulate, figures, portfolioObjective, portfolioRef, portfolioTrack, status, totalBudgetFigures, updateControl } from "../model.js";

const PERIOD = "annee";

const rate = (m, c) => (c ? m / c : null);
// Écart de taux en points, vert si favorable.
function Pt({ real, target }) {
  if (real == null || target == null) return <span className="muted">—</span>;
  const d = (real - target) * 100;
  return <span className={d >= 0 ? "delta-up" : "delta-down"}>{signed(d, (v) => fr(v, 1))} pt</span>;
}
const CONTROL = { ok: ["ok", "À jour"], partial: ["warn", "Incomplet"], late: ["crit", "Non mis à jour"], off: ["none", "Hors période"] };

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
          const b = budgetFigures(p, year);
          const taux = rate(b.marge, b.ca);
          return { p, b, f, s: status(p, f), taux, gap: taux == null ? 0 : taux - f.obj, c: updateControl(p, controlMonth()) };
        })
        .sort((a, b) => a.gap - b.gap),
    [projects, year],
  );
  const counts = rows.reduce((a, r) => ({ ...a, [r.s.level]: (a[r.s.level] || 0) + 1 }), {});
  const alertList = buildAlerts(projects, [], PERIOD, year, data.staleDays);
  const taux = tot.ca ? tot.marge / tot.ca : 0;
  const budTaux = tot.budCa ? tot.budMarge / tot.budCa : null;
  const tauxAn = rate(tot.margeAn, tot.caAn);
  const budTauxAn = rate(tot.budMargeAn, tot.budCaAn);
  const obj = portfolioObjective(projects, year);
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
          d: budgetOk ? <>budget à date {keur(tot.budCa)} <Gap real={tot.ca} bud={tot.budCa} /></> : `${budgetLabel(year)} non disponible`,
        },
        {
          k: "Taux de marge à date",
          v: pct(taux),
          d: (
            <>
              objectif {pct(obj.value)}{obj.mode === "auto" ? " (auto)" : ""} <Pt real={taux} target={obj.value} />
              {budgetOk && budTaux != null && <> · budget {pct(budTaux)} <Pt real={taux} target={budTaux} /></>}
            </>
          ),
        },
        {
          k: `Taux de marge ${year} (atterrissage)`,
          v: tauxAn == null ? "—" : pct(tauxAn),
          d: budgetOk && budTauxAn != null ? <>budget {pct(budTauxAn)} <Pt real={tauxAn} target={budTauxAn} /></> : `objectif ${pct(obj.value)}`,
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

  const pctAxis = (v) => pct(v, 0);
  const chart = (title, real, bud, opts, monthly) => (
    <BudgetTrack title={title} year={year} refIndex={refIndex} real={real} bud={bud} budgetOk={budgetOk} opts={opts} monthly={monthly} />
  );

  return (
    <main>
      <div className="wrap">
        {band}

        <div className="grid2 eq">
          {chart("Taux de marge cumulé : réel et budgété", cumRate(track.marge, track.ca), cumRate(track.budMarge, track.budCa), { rate: true, fmt: (v) => pct(v), axisFmt: pctAxis }, {
            real: track.marge.map((m, i) => rate(m, track.ca[i]) ?? 0),
            bud: track.budMarge.map((m, i) => rate(m, track.budCa[i]) ?? 0),
            fmt: pctAxis,
            tipFmt: (v) => pct(v),
            gap: (i) => {
              const r = rate(track.marge[i], track.ca[i]), b = rate(track.budMarge[i], track.budCa[i]);
              return r == null || b == null ? "—" : `${signed((r - b) * 100, (v) => fr(v, 1))} pt`;
            },
          })}
          {chart("Avancement du CA net : réel et budgété", cumulate(track.ca), cumulate(track.budCa), {}, {
            real: track.ca,
            bud: track.budCa,
            fmt: (v) => `${fr(v / 1000)} k`,
            tipFmt: keur,
            gap: (i) => signed(track.ca[i] - track.budCa[i], keur),
          })}
        </div>

        <div className="stack">
          <Block title="Projets du portefeuille" note="Réalisé à date · taux de marge sur CA net comparé à l'objectif du projet (taux de son budget) · plus gros écart en tête">
            <div className="card flush tw">
              <table>
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th className="n">CA net</th>
                    <th className="n">vs budget</th>
                    <th className="n">Taux de marge</th>
                    <th className="n">Objectif</th>
                    <th className="n">Écart</th>
                    <th>État</th>
                    <th>MAJ {monthLabel(controlMonth())}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, b, f, s, taux: t, c }) => (
                    <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                      <td>
                        <div>{p.client || "—"} · {p.projet || p.fileName}</div>
                        <div className="mono">{p.key}{p.moisRef ? ` · réf. ${monthLabel(p.moisRef)}` : ""}</div>
                      </td>
                      <td className="n">{keur(b.ca)}</td>
                      <td className="n" title={b.hasBudget ? `Budget à date ${keur(b.budCa)}` : "Pas de budget"}><Gap real={b.ca} bud={b.budCa} show={b.hasBudget} /></td>
                      <td className="n">{t == null ? "—" : pct(t)}</td>
                      <td className="n" title={b.hasBudget ? `Taux du ${budgetLabel(year)}` : "Objectif par défaut (pas de budget)"}>{pct(f.obj)}{b.hasBudget ? "" : "*"}</td>
                      <td className="n"><Pt real={t} target={f.obj} /></td>
                      <td><Status s={s} /></td>
                      <td title={c.failed.map((x) => x.detail).join("\n") || undefined}><Pill level={CONTROL[c.level][0]}>{CONTROL[c.level][1]}</Pill></td>
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
