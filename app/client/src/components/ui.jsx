import React from "react";

const ICON = { ok: "●", warn: "▲", crit: "■", none: "○" };

export function Status({ s }) {
  return (
    <span className={`st ${s.level}`} title={s.reason || undefined}>
      {ICON[s.level]} {s.label}
    </span>
  );
}

export function Pill({ level, children }) {
  return (
    <span className={`st ${level}`}>
      {ICON[level]} {children}
    </span>
  );
}

export function Block({ title, note, className = "", children }) {
  return (
    <div className={`blk ${className}`}>
      <div className="blk-h">
        <h2>{title}</h2>
        {note && <div className="note">{note}</div>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
