export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toDateStr(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function isDueOn(r, dateStr) {
  if (!r.enabled) return false;
  if (r.date) return r.date === dateStr;
  if (!r.days) return true;
  return r.days.split(",").includes(String(new Date(dateStr + "T00:00:00").getDay()));
}

export function repeatLabel(r) {
  if (r.date) return `Once · ${r.date}`;
  if (!r.days) return "Every day";
  const ds = r.days.split(",").map(Number);
  if (ds.join() === "1,2,3,4,5") return "Weekdays";
  if (ds.join() === "0,6") return "Weekends";
  return ds.map((d) => DAY_LABELS[d]).join(", ");
}

// "14:05" -> "2:05 PM"
export function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
