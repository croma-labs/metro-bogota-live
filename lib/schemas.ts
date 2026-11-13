import { z } from "zod";

export const apiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const position = z.array(z.number());
const geometry = z.union([
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(position) }),
  z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(position))) }),
]);
export type Geometry = z.infer<typeof geometry>;

const station = z.object({
  id: z.string(),
  line: z.number().int(),
  number: z.string(),
  name: z.string(),
  common_name: z.string().nullable(),
  status: z.string().nullable(),
  note: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  area_m2: z.number().nullable(),
  geometry: geometry.nullable(),
  distance_m: z.number().nullable().optional(),
});

export const stationsPage = z.object({
  as_of: z.string(),
  total: z.number().int(),
  total_pages: z.number().int(),
  stations: z.array(station),
});

export const infrastructurePage = z.object({
  as_of: z.string(),
  total: z.number().int(),
  total_pages: z.number().int(),
  results: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      line: z.number().int(),
      name: z.string(),
      station_id: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      length_m: z.number().nullable(),
      area_m2: z.number().nullable(),
      geometry: geometry.nullable(),
    }),
  ),
});

const month = z.object({
  month: z.string(),
  planned_pct: z.number().nullable(),
  executed_pct: z.number().nullable(),
  budget_executed_cumulative_pct: z.number().nullable(),
  budget_executed_cumulative_cop: z.number().nullable(),
});

const event = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  status: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  reported_on: z.string().nullable(),
  value_cop: z.number().nullable(),
});

export const progressResult = z.object({
  as_of: z.string(),
  latest: month.nullable(),
  project: event.nullable(),
  stages: z.array(event),
  activities: z.array(event),
  milestones: z.array(event),
  months: z.array(month),
});

export const treesPage = z.object({
  as_of: z.string(),
  total: z.number().int(),
  total_pages: z.number().int(),
  trees: z.array(
    z.object({
      id: z.string(),
      common_name: z.string().nullable(),
      scientific_name: z.string().nullable(),
      treatment: z.string().nullable(),
      status: z.string().nullable(),
      executed_on: z.string().nullable(),
      height_m: z.number().nullable(),
      locality: z.string().nullable(),
      location: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    }),
  ),
});

const parcel = z.object({
  id: z.string(),
  chip: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  area_m2: z.number().nullable(),
  geometry: geometry.nullable().optional(),
});

export const parcelsPage = z.object({
  as_of: z.string(),
  total: z.number().int(),
  total_pages: z.number().int(),
  parcels: z.array(parcel),
});

export const proximityResult = z.object({
  as_of: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  nearest_station: station.nullable(),
  stations_within_1km: z.number().int(),
  inside_intervention_limit: z.boolean(),
  intervention_limit_distance_m: z.number().nullable(),
  parcel: parcel.nullable(),
  parcels_within_100m: z.number().int(),
  lines: z.array(z.object({ line: z.number().int(), alignment_distance_m: z.number().nullable(), nearest_station: station.nullable() })),
});

/** `/api/proximity` params, checked before anything reaches the API: a point inside greater Bogotá. */
export const pointParams = z.object({
  lat: z.coerce.number().min(4.3).max(5.0),
  lon: z.coerce.number().min(-74.5).max(-73.8),
});
