import React, { useRef, useState } from "react";
import { fr, MONTHS } from "../format.js";

// ---------------------------------------------------------------------------
// Infobulle partagée par tous les graphiques
// ---------------------------------------------------------------------------

function useTip() {
  const host = useRef(null);
  const tipRef = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const b = host.current.getBoundingClientRect();
    setTip({ x: e.clientX - b.left, y: e.clientY - b.top, w: b.width, content });
  };
  const hide = () => setTip(null);
  const node = tip && (
    <div
      className="tip"
      ref={(el) => {
        tipRef.current = el;
        if (el) {
          const tw = el.offsetWidth;
          el.style.left = `${Math.min(Math.max(0, tip.x - tw / 2), tip.w - tw)}px`;
          el.style.top = `${tip.y - el.offsetHeight - 12}px`;
        }
      }}
    >
      {tip.content}
    </div>
  );
  return { host, show, hide, node };
}

export function TipRows({ title, rows }) {
  return (
    <>
      <b>{title}</b>
      {rows.map(([k, v]) => (
        <div className="r" key={k}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </>
  );
}

function niceStep(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function ticks(max, n = 4) {
  const step = niceStep(max / n);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(v);
  return { top, out };
}

const topRounded = (x, y, w, h, r = 3) =>
  h <= r ? `M${x},${y + h}V${y}h${w}V${y + h}Z` : `M${x},${y + h}V${y + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${y + h}Z`;

// ---------------------------------------------------------------------------
// Courbes (cumuls sur 12 mois). `split` : trait plein jusqu'à refIndex, pointillé ensuite.
// ---------------------------------------------------------------------------

export function Lines({ series, refIndex, fmt, axisFmt = fmt, label, year, extraRows }) {
  const { host, show, hide, node } = useTip();
  const [hover, setHover] = useState(null);
  const W = 720, H = 260, L = 60, R = 78, T = 12, B = 26;
  const vals = series.flatMap((s) => s.data.filter((v) => v != null));
  const { top, out: up } = ticks(Math.max(Number.EPSILON, ...vals) * 1.05);
  // Cumul négatif possible (marge) : graduations prolongées sous zéro avec le même pas.
  const step = up[1] || top;
  const bottom = Math.min(0, Math.floor(Math.min(0, ...vals) / step) * step);
  const out = [...up];
  for (let v = -step; v >= bottom - step / 1000; v -= step) out.unshift(v);
  const x = (i) => L + ((W - L - R) * i) / 11;
  const y = (v) => T + (H - T - B) * (1 - (v - bottom) / (top - bottom));
  // Étiquettes de fin de courbe écartées d'au moins 14 px pour ne pas se chevaucher.
  const ends = series
    .map((s, k) => {
      const last = s.data.reduce((acc, v, i) => (v == null ? acc : i), -1);
      return last < 0 ? null : { k, ly: y(s.data[last]) + 4 };
    })
    .filter(Boolean)
    .sort((a, b) => a.ly - b.ly);
  ends.forEach((e, i) => i && e.ly < ends[i - 1].ly + 14 && (e.ly = ends[i - 1].ly + 14));
  const labelY = Object.fromEntries(ends.map((e) => [e.k, e.ly]));
  const path = (pts) => pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
  const onMove = (e) => {
    const b = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const sx = ((e.clientX - b.left) * W) / b.width;
    const i = Math.max(0, Math.min(11, Math.round((sx - L) / ((W - L - R) / 11))));
    setHover(i);
    show(e, <TipRows title={`Fin ${MONTHS[i]} ${year}${refIndex != null && i > refIndex ? " · prévisionnel" : ""}`} rows={[...series.map((s) => [s.name, s.data[i] == null ? "—" : fmt(s.data[i])]), ...(extraRows ? extraRows(i) : [])]} />);
  };
  return (
    <div className="chart" ref={host}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {out.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 && bottom < 0 ? "var(--ink-3)" : "var(--rule)"} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{axisFmt(v)}</text>
          </g>
        ))}
        {MONTHS.map((m, i) => (i % 2 === 0 || i === 11) && <text key={m} x={x(i)} y={H - 8} textAnchor="middle">{m}</text>)}
        {refIndex != null && refIndex >= 0 && refIndex < 11 && (
          <>
            <line x1={x(refIndex)} x2={x(refIndex)} y1={T} y2={H - B} stroke="var(--ink-3)" strokeDasharray="2 3" />
            <text x={x(refIndex) + 5} y={T + 10}>mois de référence</text>
          </>
        )}
        {series.map((s, k) => {
          const pts = s.data.map((v, i) => (v == null ? null : [x(i), y(v)]));
          const last = s.data.reduce((acc, v, i) => (v == null ? acc : i), -1);
          const ri = s.split && refIndex != null ? Math.min(refIndex, 11) : 11;
          return (
            <g key={s.name}>
              {s.area && last >= 0 && (
                <path d={`${path(pts.slice(0, ri + 1))}L${x(Math.min(ri, last))},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} fillOpacity=".08" />
              )}
              <path d={path(pts.slice(0, ri + 1))} fill="none" stroke={s.color} strokeWidth={s.thin ? 1.5 : 2} strokeDasharray={s.dash ? "5 4" : undefined} />
              {s.split && ri < 11 && <path d={path(pts.slice(ri))} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="5 4" />}
              {last >= 0 && (
                <>
                  <circle cx={x(last)} cy={y(s.data[last])} r="4" fill={s.color} stroke="var(--paper)" strokeWidth="2" />
                  <text x={x(last) + 8} y={labelY[k]} style={{ fill: "var(--ink)", fontFamily: "var(--f-num)" }}>{fmt(s.data[last])}</text>
                </>
              )}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ink-3)" />}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setHover(null); hide(); }} />
      </svg>
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Taux de marge mensuel : aire et trait plein jusqu'au mois de référence, pointillé ensuite,
// ligne d'objectif, valeur du mois de référence mise en avant.
// ---------------------------------------------------------------------------

export function MarginLine({ rates, amounts, objective, refIndex, year, compare }) {
  const { host, show, hide, node } = useTip();
  const [hover, setHover] = useState(null);
  const W = 400, H = 240, L = 40, R = 12, T = 14, B = 26;
  // `compare` : { year, rates, amounts, refIndex } — taux d'une autre année tracé sur le même graphique.
  const vals = [...rates, ...(compare?.rates || [])].filter((v) => v != null);
  const lo = Math.min(0, Math.floor(Math.min(0, ...vals) * 10) / 10);
  const hi = Math.max(0.4, Math.ceil(Math.max(objective + 0.05, ...vals) * 10) / 10);
  const x = (i) => L + ((W - L - R) * i) / 11;
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticksY = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.1) ticksY.push(Math.round(v * 10) / 10);
  const ri = Math.max(-1, Math.min(11, refIndex ?? 11));
  const pts = rates.map((v, i) => (v == null ? null : [x(i), y(v)]));
  const path = (list) => list.filter(Boolean).map((pt, i) => `${i ? "L" : "M"}${pt[0]},${pt[1]}`).join("");
  const real = pts.slice(0, ri + 1).filter(Boolean);
  const fc = pts.slice(Math.max(0, ri)).filter(Boolean);
  const end = ri >= 0 && rates[ri] != null ? ri : null;
  const onMove = (e) => {
    const b = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const sx = ((e.clientX - b.left) * W) / b.width;
    const i = Math.max(0, Math.min(11, Math.round((sx - L) / ((W - L - R) / 11))));
    setHover(i);
    const rate = (r) => (r == null ? "—" : `${fr(r * 100, 1)} %`);
    const keur = (v) => `${fr(Math.round((v || 0) / 1000))} k€`;
    show(
      e,
      <TipRows
        title={`${MONTHS[i]}${compare ? "" : ` ${year}`}${i > ri ? ` · prévisionnel${compare ? ` ${year}` : ""}` : ""}`}
        rows={
          compare
            ? [[`Marge ${year}`, `${rate(rates[i])} · ${keur(amounts[i])}`], [`Marge ${compare.year}`, `${rate(compare.rates[i])} · ${keur(compare.amounts[i])}`]]
            : [["Marge", rate(rates[i])], ["Montant", keur(amounts[i])]]
        }
      />,
    );
  };
  return (
    <div className="chart" ref={host}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Taux de marge brute mensuel">
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{fr(v * 100)} %</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(objective)} y2={y(objective)} stroke="var(--ink-3)" strokeDasharray="4 3" />
        <text x={W - R} y={y(objective) - 5} textAnchor="end">objectif</text>
        {compare && (() => {
          const cri = Math.max(-1, Math.min(11, compare.refIndex ?? 11));
          const cp = compare.rates.map((v, i) => (v == null ? null : [x(i), y(v)]));
          return (
            <g>
              <path d={path(cp.slice(0, cri + 1))} fill="none" stroke="var(--s2)" strokeWidth="2" />
              {cri < 11 && <path d={path(cp.slice(Math.max(0, cri)))} fill="none" stroke="var(--s2)" strokeWidth="2" strokeDasharray="4 3" />}
            </g>
          );
        })()}
        {real.length > 1 && <path d={`${path(real)}L${real[real.length - 1][0]},${y(Math.max(lo, 0))}L${real[0][0]},${y(Math.max(lo, 0))}Z`} fill="var(--s1)" fillOpacity=".1" />}
        {real.length > 0 && <path d={path(real)} fill="none" stroke="var(--s1)" strokeWidth="2" />}
        {fc.length > 1 && <path d={path(fc)} fill="none" stroke="var(--s1)" strokeWidth="2" strokeDasharray="4 3" />}
        {end != null && (
          <>
            <circle cx={x(end)} cy={y(rates[end])} r="4.5" fill="var(--s1)" stroke="var(--paper)" strokeWidth="2" />
            <text x={x(end)} y={y(rates[end]) - 10} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>{fr(rates[end] * 100, 1)} %</text>
          </>
        )}
        {[0, 3, 6, 9, 11].map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{MONTHS[i]}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ink-3)" />}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setHover(null); hide(); }} />
      </svg>
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barres mensuelles (une ou plusieurs séries, même échelle)
// ---------------------------------------------------------------------------

export function MonthBars({ series, refIndex, fmt, tipFmt, label, year, extraRows, height = 200 }) {
  const { host, show, hide, node } = useTip();
  const W = 640, H = height, L = 56, R = 8, T = 10, B = 26;
  const all = series.flatMap((s) => s.data);
  const minV = Math.min(0, ...all);
  const { top, out } = ticks(Math.max(Number.EPSILON, ...all) * 1.08);
  const bottom = minV < 0 ? -niceStep(-minV) * Math.ceil(-minV / niceStep(-minV)) : 0;
  const y = (v) => T + ((H - T - B) * (top - v)) / (top - bottom);
  const bw = (W - L - R) / 12;
  const n = series.length, gap = 2, inner = bw * (n > 1 ? 0.7 : 0.58);
  const each = (inner - gap * (n - 1)) / n;
  return (
    <div className="chart" ref={host}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[...out, ...(bottom < 0 ? [bottom] : [])].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--ink-3)" : "var(--rule)"} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        {MONTHS.map((m, i) => {
          const x0 = L + i * bw + (bw - inner) / 2;
          const fut = refIndex != null && i > refIndex;
          return (
            <g key={m}>
              {series.map((s, k) => {
                const v = s.data[i] || 0;
                const x = x0 + k * (each + gap);
                const future = (s.refIndex != null ? i > s.refIndex : fut) && !s.solid;
                const y1 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
                return v >= 0 ? (
                  <path key={s.name} d={topRounded(x, y1, each, h)} fill={s.color} fillOpacity={future ? 0.35 : 1} stroke={future ? s.color : "none"} strokeDasharray={future ? "3 2" : undefined} />
                ) : (
                  <rect key={s.name} x={x} y={y(0)} width={each} height={h} fill="var(--crit)" fillOpacity={future ? 0.35 : 0.85} />
                );
              })}
              <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle">{m}</text>
              <rect
                x={L + i * bw}
                y={T}
                width={bw}
                height={H - T - B}
                fill="transparent"
                onMouseMove={(e) =>
                  show(e, <TipRows title={`${MONTHS[i]} ${year}${fut ? " · prévisionnel" : ""}`} rows={[...series.map((s) => [s.name, tipFmt(s.data[i] || 0)]), ...(extraRows ? extraRows(i) : [])]} />)
                }
                onMouseLeave={hide}
              />
            </g>
          );
        })}
        {refIndex != null && refIndex >= 0 && refIndex < 11 && (
          <line x1={L + (refIndex + 1) * bw} x2={L + (refIndex + 1) * bw} y1={T} y2={H - B} stroke="var(--ink-3)" strokeDasharray="2 3" />
        )}
      </svg>
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Petite courbe de tendance pour les tableaux
// ---------------------------------------------------------------------------

export function Spark({ data, refIndex, color = "var(--s1)", label }) {
  const W = 96, H = 24;
  const vals = data.map((v) => (Number.isFinite(v) ? v : 0));
  const mx = Math.max(...vals), mn = Math.min(...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 2 - ((v - mn) / (mx - mn || 1)) * (H - 4)]);
  const ri = Math.max(0, Math.min(vals.length - 1, refIndex ?? vals.length - 1));
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={pts.slice(0, ri + 1).map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
      <polyline points={pts.slice(ri).map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" opacity=".6" />
      <circle cx={pts[ri][0]} cy={pts[ri][1]} r="2.5" fill={color} />
    </svg>
  );
}
