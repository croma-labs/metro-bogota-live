const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "octubre de 2026" from `2026-10`. */
export function monthText(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1]} de ${y}`;
}

/** "oct 2026" from `2026-10`. */
export function monthShort(month: string): string {
  const [y, m] = month.split("-");
  return `${SHORT[Number(m) - 1]} ${y}`;
}

/** "16 de octubre de 2026" from `2026-10-16`. */
export function dateText(date: string): string {
  const [y, m, d] = date.split("-");
  return `${Number(d)} de ${MONTHS[Number(m) - 1]} de ${y}`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "388 m" or "3,3 km". */
export function distanceText(m: number | null): string {
  if (m == null) return "sin dato";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`;
}

export function pctText(value: number | null, digits = 1): string {
  return value == null ? "—" : `${value.toLocaleString("es-CO", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** "12,9 billones" from pesos. */
export function copText(value: number | null): string {
  if (value == null) return "sin dato";
  if (value >= 1e12) return `$${(value / 1e12).toLocaleString("es-CO", { maximumFractionDigits: 1 })} billones`;
  return `$${(value / 1e9).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil millones`;
}

export const TREATMENTS: Record<string, { label: string; dark: string; light: string; order: number }> = {
  traslado: { label: "Trasladados", dark: "#4ade80", light: "#16a34a", order: 0 },
  tala: { label: "Talados", dark: "#f87171", light: "#dc2626", order: 1 },
  tratamiento_integral: { label: "Tratamiento integral", dark: "#facc15", light: "#ca8a04", order: 2 },
  conservacion: { label: "Conservados", dark: "#38bdf8", light: "#0284c7", order: 3 },
  poda: { label: "Podados", dark: "#c084fc", light: "#9333ea", order: 4 },
  otro: { label: "Otros", dark: "#a3a3a3", light: "#737373", order: 5 },
};

export function treatmentOf(code: string) {
  return TREATMENTS[code] ?? TREATMENTS.otro!;
}

/** The last day of `YYYY-MM`, as `YYYY-MM-DD`, for comparing against dates. */
export function monthEnd(month: string): string {
  return `${month}-31`;
}
