import React, { useMemo } from "react";
import Band from "../components/Band.jsx";
import { MarginLine, MonthBars } from "../components/charts.jsx";
import { Block, Empty, Pill, Status } from "../components/ui.jsx";
import { fr, keur, monthLabel, MONTHS, pct, signed } from "../format.js";
import { alerts as buildAlerts, figures, monthly, portfolioObjective, portfolioRef, status, totalFigures, yearMonths } from "../model.js";

// La synthèse porte sur l'exercice complet : réalisé jusqu'au mois de référence, prévisionnel ensuite.
const PERIOD = "annee";

export default function Synthese({ projects, data, filters, go, startScan }) {
  const { year } = filters;
  const ref = portfolioRef(projects);
  const months = yearMonths(year);
  const refIndex = ref && ref.startsWith(`${year}-`) ? Number(ref.slice(5)) - 1 : ref && ref < `${year}-01` ? -1 : 11;

  const tot = useMemo(() => totalFigures(projects, PERIOD, year), [projects, year]);
  const caRealise = useMemo(() => totalFigures(projects, "realise", year).ca, [projects, year]);
  const caN1 = useMemo(() => totalFigures(projects, PERIOD, year - 1).ca, [projects, year]);
  const objective = portfolioObjective(projects, PERIOD, year);

  // Budget = trajectoire initiale de l'onglet Projection (CA net et coûts), comparé sur la même base CA net.
  const sumBudget = (key) => projects.reduce((a, p) => a + months.reduce((s, m) => s + (p.budget?.[key]?.[m] || 0), 0), 0);
  const budCaNet = sumBudget("caNet");
  const budTaux = budCaNet ? (budCaNet - sumBudget("couts")) / budCaNet : null;
  const tauxNet = tot.caNet ? (tot.caNet - tot.couts) / tot.caNet : 0;

  const consoCumul = projects.reduce((a, p) => a + (p.kpi?.conso?.cumul || 0), 0);
  const joursVendus = projects.reduce((a, p) => a + (p.kpi?.joursVendus || 0), 0);
  const joursObjectif = projects.reduce((a, p) => a + (p.kpi?.joursObjectif || 0), 0);
  const caNetFin = projects.reduce((a, p) => a + (p.kpi?.caNetFin || 0), 0);
  const factFin = caNetFin ? projects.reduce((a, p) => a + (p.kpi?.caNetFin || 0) * (p.kpi?.pctFacturation || 0), 0) / caNetFin : 0;

  const rows = useMemo(
    () =>
      projects
        .map((p) => {
          const f = figures(p, PERIOD, year);
          return { p, f, s: status(p, f), fin: p.kpi?.caBrutFin || f.ca };
        })
        .sort((a, b) => b.fin - a.fin),
    [projects, year],
  );
  const maxCa = Math.max(1, ...rows.map((r) => r.f.ca));

  const caM = monthly(projects, (p) => p.cep.rows.caBrut, year);
  const coM = monthly(projects, (p) => p.cep.rows.totalCharges, year);
  const alertList = buildAlerts(projects, data.errors, PERIOD, year, data.staleDays);

  const band = (
    <Band
      title="Synthèse du portefeuille"
      eyebrow={`Consolidation des CEP V11-20${ref ? ` · mois de référence ${monthLabel(ref)}` : ""}`}
      filters={filters}
      showPeriod={false}
      figures={[
        {
          k: `CA brut ${year}`,
          v: keur(tot.ca),
          d: (
            <>
              dont réalisé {keur(caRealise)}
              {caN1 > 0 && (
                <span className={tot.ca >= caN1 ? "delta-up" : "delta-down"}>
                  {tot.ca >= caN1 ? "▲" : "▼"} {pct(Math.abs((tot.ca - caN1) / caN1))} vs N-1
                </span>
              )}
            </>
          ),
        },
        {
          k: "Marge brute",
          v: keur(tot.marge),
          d: (
            <>
              {pct(tot.taux)} du CA
              {budTaux != null && (
                <span className={tauxNet >= budTaux ? "delta-up" : "delta-down"} title="Taux de marge sur CA net comparé à la trajectoire initiale">
                  {tauxNet >= budTaux ? "▲" : "▼"} {fr(Math.abs(tauxNet - budTaux) * 100, 1)} pt vs budget
                </span>
              )}
            </>
          ),
        },
        { k: "Jours consommés", v: fr(Math.round(consoCumul)), d: `sur ${fr(joursVendus)} vendus · objectif ${fr(joursObjectif)}` },
        { k: "CA NET à fin d'affaire", v: keur(caNetFin), d: `facturé ${pct(factFin)} du total` },
      ]}
    />
  );

  if (!projects.length) {
    return (
      <main>
        <div className="wrap">
          {band}
          <div className="card">
            <Empty title="Aucun CEP consolidé">
              <p>Ajoutez une source SMB et les codes d'identification dans les paramètres, puis lancez un scan.</p>
              <div className="row">
                <button className="btn pri" onClick={() => go("parametres")}>Ouvrir les paramètres</button>
                <button className="btn" onClick={startScan}>Scanner maintenant</button>
              </div>
            </Empty>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="wrap">
        {band}

        <div className="grid2">
          <Block
            title="CA mensuel"
            note={
              <div className="legend">
                <span><i className="sq" style={{ background: "var(--s1)" }} />CA brut</span>
                {refIndex >= 0 && refIndex < 11 && <span><i className="dash" style={{ borderColor: "var(--ink-3)" }} />Prévisionnel (après {MONTHS[refIndex]})</span>}
              </div>
            }
          >
            <div className="card">
              <MonthBars
                year={year}
                refIndex={refIndex}
                height={240}
                label={`CA brut mensuel ${year}`}
                fmt={(v) => `${fr(v / 1e6, 1)} M€`}
                tipFmt={keur}
                series={[
                  { name: "CA brut", data: months.map((m) => caM[m]), color: "var(--s1)" },
                ]}
                extraRows={(i) => {
                  const c = caM[months[i]], m = c - coM[months[i]];
                  return [["Marge", `${keur(m)} · ${pct(c ? m / c : 0)}`]];
                }}
              />
            </div>
          </Block>
          <Block title="Taux de marge brute" note={`Objectif ${fr(objective * 100, 0)} %`}>
            <div className="card">
              <MarginLine
                year={year}
                refIndex={refIndex}
                objective={objective}
                rates={months.map((m) => (caM[m] ? (caM[m] - coM[m]) / caM[m] : null))}
                amounts={months.map((m) => caM[m] - coM[m])}
              />
            </div>
          </Block>
        </div>

        <div className="grid2">
          <Block title="Projets" note="Triés par CA à fin d'affaire">
            <div className="card flush tw">
              <table>
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th className="n">CA {year}</th>
                    <th />
                    <th className="n">Marge</th>
                    <th className="n">Dérive / obj.</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, f, s }) => (
                    <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                      <td>
                        <div>{p.client || "—"} · {p.projet || p.fileName}</div>
                        <div className="mono">{p.key}</div>
                      </td>
                      <td className="n">{keur(f.ca)}</td>
                      <td>
                        <div className="bar"><span style={{ width: `${(Math.max(0, f.ca) / maxCa) * 100}%` }} /></div>
                      </td>
                      <td className="n">{pct(f.taux)}</td>
                      <td className="n">{signed(p.kpi?.pctDeriveObjectif || 0, (v) => pct(v))}</td>
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
