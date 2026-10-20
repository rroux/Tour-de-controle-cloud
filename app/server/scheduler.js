import { getConfig } from "./config.js";
import { runScan } from "./scanner.js";

// Vérifie chaque minute si un scan planifié est dû (pas de dépendance cron).
let lastSlot = null;

function dueSlot(now, schedule) {
  const [h, m] = schedule.time.split(":").map(Number);
  const day = now.getDay();
  switch (schedule.mode) {
    case "hourly":
      return now.getMinutes() === m ? now.toISOString().slice(0, 13) : null;
    case "workdays":
      if (day === 0 || day === 6) return null;
    // fallthrough
    case "daily":
      return now.getHours() === h && now.getMinutes() === m ? now.toISOString().slice(0, 10) : null;
    default:
      return null;
  }
}

export function nextRun(schedule, from = new Date()) {
  if (schedule.mode === "manual") return null;
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 8; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (dueSlot(d, schedule)) return d.toISOString();
  }
  return null;
}

export function startScheduler() {
  setInterval(() => {
    const slot = dueSlot(new Date(), getConfig().schedule);
    if (slot && slot !== lastSlot) {
      lastSlot = slot;
      runScan("Planifié").catch((err) => console.error("Scan planifié en échec :", err));
    }
  }, 20000).unref();
}
