import type { Geometry } from "@/lib/schemas";

export interface Station {
  id: string;
  line: number;
  number: string;
  name: string;
  /** The working name people use ("Calle 45"), without the number. */
  label: string;
  status: string | null;
  lon: number;
  lat: number;
  geometry: Geometry | null;
}

export interface Piece {
  id: string;
  kind: "alignment" | "viaduct" | "intervention_limit" | "access_building" | "depot" | string;
  line: number;
  name: string;
  stationId: string | null;
  lengthM: number | null;
  areaM2: number | null;
  geometry: Geometry | null;
}

export interface Network {
  asOf: string;
  stations: Station[];
  pieces: Piece[];
}

export interface Month {
  /** `YYYY-MM` */
  month: string;
  planned: number | null;
  executed: number | null;
  budgetPct: number | null;
}

export interface Milestone {
  name: string;
  /** `YYYY-MM-DD` */
  date: string;
}

export interface Progress {
  asOf: string;
  months: Month[];
  project: { name: string; start: string | null; end: string | null; valueCop: number | null } | null;
  milestones: Milestone[];
  activities: string[];
}

export interface Tree {
  id: string;
  lon: number;
  lat: number;
  treatment: string;
  status: string | null;
  /** `YYYY-MM-DD`, or null when the inventory has no date for it. */
  date: string | null;
  name: string | null;
  scientific: string | null;
  heightM: number | null;
  locality: string | null;
  place: string | null;
}

export interface Trees {
  asOf: string;
  trees: Tree[];
}

export interface Parcel {
  id: string;
  chip: string | null;
  address: string | null;
  areaM2: number | null;
  lon: number | null;
  lat: number | null;
  geometry: Geometry | null;
}

export interface Parcels {
  asOf: string;
  parcels: Parcel[];
}

export interface Check {
  lon: number;
  lat: number;
  nearest: (Station & { distanceM: number | null }) | null;
  stationsWithin1km: number;
  insideWorks: boolean;
  worksDistanceM: number | null;
  parcel: Parcel | null;
  parcelsWithin100m: number;
  lines: { line: number; distanceM: number | null; station: (Station & { distanceM: number | null }) | null }[];
}
