import "server-only";

import type { z } from "zod";

import { asShared, type Call, croma, shared } from "@/lib/croma";
import { infrastructurePage, parcelsPage, progressResult, proximityResult, stationsPage, treesPage } from "@/lib/schemas";
import type { Result, Trace } from "@/lib/trace";
import type { Check, Network, Parcel, Parcels, Progress, Station, Trees } from "@/lib/types";

const BASE = "/co/metro-bogota";
/** The source refreshes weekly, so six hours keeps every visitor on one copy without ever being far behind. */
const SIX_HOURS = 6 * 60 * 60_000;
const PER_PAGE = 100;
/** Pages read at once when walking a list; enough to be quick, few enough to be polite. */
const PARALLEL = 6;

type Paged = { total_pages: number; as_of: string };

/** Read page 1, then every other page a few at a time. Fails as a whole if any page fails. */
async function allPages<S extends z.ZodType<Paged>>(path: string, body: Record<string, unknown>, schema: S): Promise<{ ok: true; pages: z.infer<S>[]; traces: Trace[] } | { ok: false; error: { code: string; message: string }; traces: Trace[] }> {
  const started = Date.now();
  const first = await croma(path, { ...body, page: 1, per_page: PER_PAGE }, schema);
  const all: Trace[] = first.trace ? [first.trace] : [];
  if (!first.ok) return { ok: false, error: first.error, traces: all };
  const pages: z.infer<S>[] = [first.data];
  const rest = Array.from({ length: Math.max(0, first.data.total_pages - 1) }, (_, i) => i + 2);
  for (let i = 0; i < rest.length; i += PARALLEL) {
    const batch = await Promise.all(rest.slice(i, i + PARALLEL).map((page) => croma(path, { ...body, page, per_page: PER_PAGE }, schema)));
    for (const call of batch as Call<z.infer<S>>[]) {
      if (call.trace) all.push(call.trace);
      if (!call.ok) return { ok: false, error: call.error, traces: all };
      pages.push(call.data);
    }
  }
  const head = all[0];
  const traces: Trace[] = head ? [{ ...head, ms: Date.now() - started, pages: pages.length }] : [];
  return { ok: true, pages, traces };
}

function labelOf(commonName: string | null, name: string): string {
  const base = commonName ?? name;
  return base.replace(/-\d+$/, "").replace(/^ESTACIÓN (\d+)$/i, "Estación $1").trim();
}

type RawStation = z.infer<typeof stationsPage>["stations"][number];
function toStation(s: RawStation): Station {
  return { id: s.id, line: s.line, number: s.number, name: s.name, label: labelOf(s.common_name, s.name), status: s.status, lon: s.longitude, lat: s.latitude, geometry: s.geometry };
}

const networkCache = shared<Result<Network>>(SIX_HOURS);
export async function getNetwork(): Promise<Result<Network>> {
  const { value, fresh } = await networkCache(
    "network",
    async () => {
      const [stations, pieces] = await Promise.all([allPages(`${BASE}/stations-search/v1`, {}, stationsPage), allPages(`${BASE}/infrastructure-search/v1`, {}, infrastructurePage)]);
      const traces = [...stations.traces, ...pieces.traces];
      if (!stations.ok) return { ok: false, error: stations.error, traces };
      if (!pieces.ok) return { ok: false, error: pieces.error, traces };
      return {
        ok: true,
        traces,
        data: {
          asOf: stations.pages[0]?.as_of ?? new Date().toISOString(),
          stations: stations.pages.flatMap((p) => p.stations).map(toStation),
          pieces: pieces.pages
            .flatMap((p) => p.results)
            .map((r) => ({ id: r.id, kind: r.kind, line: r.line, name: r.name, stationId: r.station_id, lengthM: r.length_m, areaM2: r.area_m2, geometry: r.geometry })),
        },
      };
    },
    (r) => r.ok,
  );
  return { ...value, traces: asShared(value.traces, fresh) };
}

const progressCache = shared<Result<Progress>>(SIX_HOURS);
export async function getProgress(): Promise<Result<Progress>> {
  const { value, fresh } = await progressCache(
    "progress",
    async () => {
      const call = await croma(`${BASE}/progress/v1`, {}, progressResult);
      const traces = call.trace ? [call.trace] : [];
      if (!call.ok) return { ok: false, error: call.error, traces };
      const d = call.data;
      return {
        ok: true,
        traces,
        data: {
          asOf: d.as_of,
          months: d.months
            .map((m) => ({ month: m.month, planned: m.planned_pct, executed: m.executed_pct, budgetPct: m.budget_executed_cumulative_pct }))
            .sort((a, b) => a.month.localeCompare(b.month)),
          project: d.project ? { name: d.project.name, start: d.project.start_date, end: d.project.end_date, valueCop: d.project.value_cop } : null,
          milestones: [
            ...d.milestones.flatMap((m) => {
              const date = m.end_date ?? m.reported_on;
              return date ? [{ name: m.name, date }] : [];
            }),
            ...d.stages.flatMap((s) => {
              const today = d.as_of.slice(0, 10);
              return [
                ...(s.start_date && s.start_date <= today ? [{ name: `Arranca: ${s.name}`, date: s.start_date }] : []),
                ...(s.end_date && s.end_date <= today ? [{ name: `Termina: ${s.name}`, date: s.end_date }] : []),
              ];
            }),
          ].sort((a, b) => a.date.localeCompare(b.date)),
          activities: d.activities.map((a) => a.name),
        },
      };
    },
    (r) => r.ok,
  );
  return { ...value, traces: asShared(value.traces, fresh) };
}

const treesCache = shared<Result<Trees>>(SIX_HOURS);
export async function getTrees(): Promise<Result<Trees>> {
  const { value, fresh } = await treesCache(
    "trees",
    async () => {
      const read = await allPages(`${BASE}/trees-search/v1`, {}, treesPage);
      if (!read.ok) return read;
      return {
        ok: true,
        traces: read.traces,
        data: {
          asOf: read.pages[0]?.as_of ?? new Date().toISOString(),
          trees: read.pages.flatMap((p) =>
            p.trees.flatMap((t) =>
              t.latitude == null || t.longitude == null
                ? []
                : [
                    {
                      id: t.id,
                      lon: t.longitude,
                      lat: t.latitude,
                      treatment: t.treatment ?? "otro",
                      status: t.status,
                      date: t.status === "ejecutado" ? t.executed_on : null,
                      name: t.common_name,
                      scientific: t.scientific_name,
                      heightM: t.height_m,
                      locality: t.locality,
                      place: t.location,
                    },
                  ],
            ),
          ),
        },
      };
    },
    (r) => r.ok,
  );
  return { ...value, traces: asShared(value.traces, fresh) };
}

type RawParcel = z.infer<typeof parcelsPage>["parcels"][number];
function toParcel(p: RawParcel): Parcel {
  return { id: p.id, chip: p.chip, address: p.address, areaM2: p.area_m2, lon: p.longitude, lat: p.latitude, geometry: p.geometry ?? null };
}

const parcelsCache = shared<Result<Parcels>>(SIX_HOURS);
export async function getParcels(): Promise<Result<Parcels>> {
  const { value, fresh } = await parcelsCache(
    "parcels",
    async () => {
      const read = await allPages(`${BASE}/parcels-search/v1`, {}, parcelsPage);
      if (!read.ok) return read;
      return { ok: true, traces: read.traces, data: { asOf: read.pages[0]?.as_of ?? new Date().toISOString(), parcels: read.pages.flatMap((p) => p.parcels).map(toParcel) } };
    },
    (r) => r.ok,
  );
  return { ...value, traces: asShared(value.traces, fresh) };
}

/** Points about 10 m apart share one answer for a day, so a crowd clicking the same block costs one call. */
const checkCache = shared<Result<Check>>(24 * 60 * 60_000);
export async function checkPoint(lat: number, lon: number): Promise<Result<Check>> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const { value, fresh } = await checkCache(
    key,
    async () => {
      const call = await croma(`${BASE}/proximity/v1`, { latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)) }, proximityResult);
      const traces = call.trace ? [call.trace] : [];
      if (!call.ok) return { ok: false, error: call.error, traces };
      const d = call.data;
      const near = (s: RawStation | null) => (s ? { ...toStation(s), distanceM: s.distance_m ?? null } : null);
      return {
        ok: true,
        traces,
        data: {
          lon: d.longitude,
          lat: d.latitude,
          nearest: near(d.nearest_station),
          stationsWithin1km: d.stations_within_1km,
          insideWorks: d.inside_intervention_limit,
          worksDistanceM: d.intervention_limit_distance_m,
          parcel: d.parcel ? toParcel(d.parcel) : null,
          parcelsWithin100m: d.parcels_within_100m,
          lines: d.lines.map((l) => ({ line: l.line, distanceM: l.alignment_distance_m, station: near(l.nearest_station) })),
        },
      };
    },
    (r) => r.ok,
  );
  return { ...value, traces: asShared(value.traces, fresh) };
}
