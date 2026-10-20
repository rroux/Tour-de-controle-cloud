const nf = (d) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const cache = {};
export const fr = (v, d = 0) => (cache[d] ||= nf(d)).format(Number.isFinite(v) ? v : 0);
export const keur = (v) => `${fr(Math.round((v || 0) / 1000))} k€`;
export const meur = (v, d = 2) => fr((v || 0) / 1e6, d);
export const eur = (v) => `${fr(v)} €`;
export const pct = (v, d = 1) => `${fr((v || 0) * 100, d)} %`;
export const jours = (v) => `${fr(Math.round(v || 0))} j`;
export const signed = (v, f) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${f(Math.abs(v))}`;

export const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const monthLabel = (ym) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "—");
export const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
export const dateTimeFr = (iso) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
