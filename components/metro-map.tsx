"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { treatmentOf } from "@/lib/format";
import type { Check, Network, Parcels, Tree, Trees } from "@/lib/types";

const STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};
const FONT = ["Montserrat Medium", "Open Sans Regular", "Noto Sans Regular"];
/** Over the middle of Line 1, tilted so the viaduct reads as standing above the street. */
const START = { center: [-74.118, 4.612] as [number, number], zoom: 11.9, pitch: 48, bearing: -28 };
const PANEL = 380;
const FRAME_MS = 33;
const UNDATED = 999_999;

export const LINE_COLOR = { dark: { l1: "#8b95f5", l2: "#f5a524" }, light: { l1: "#5967e8", l2: "#d97706" } };

export interface Layers {
  trees: boolean;
  parcels: boolean;
  works: boolean;
  line2: boolean;
}

export interface MetroMapProps {
  network: Network | null;
  trees: Trees | null;
  parcels: Parcels | null;
  dark: boolean;
  /** `YYYY-MM` the time slider is on; trees show up to the end of it. Null shows everything, undated trees too. */
  month: string | null;
  layers: Layers;
  check: Check | null;
  /** A point picked and waiting for its answer. */
  pending: [number, number] | null;
  cinematic: boolean;
  /** Flown to when it changes. */
  focus: { lon: number; lat: number; zoom: number; key: string } | null;
  onPick: (lon: number, lat: number) => void;
  onSelectTree: (tree: Tree | null) => void;
}

export function MetroMap(props: MetroMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const live = useRef(props);
  live.current = props;
  const ready = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    const wide = window.innerWidth >= 1024;
    const m = new maplibregl.Map({
      container: container.current,
      style: live.current.dark ? STYLES.dark : STYLES.light,
      center: START.center,
      zoom: wide ? START.zoom : START.zoom - 1.2,
      pitch: START.pitch,
      bearing: START.bearing,
      minZoom: 9,
      maxZoom: 18.5,
      maxPitch: 70,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.current = m;
    if (wide && !live.current.cinematic) m.setPadding({ left: PANEL, top: 0, right: 0, bottom: 0 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");

    m.on("style.load", () => {
      addLayers(m, live.current.dark);
      ready.current = true;
      drawAll(m);
    });

    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ["trees"] });
      const tree = hit[0];
      if (tree) {
        const found = live.current.trees?.trees.find((t) => t.id === tree.properties.id);
        if (found) {
          live.current.onSelectTree(found);
          return;
        }
      }
      live.current.onSelectTree(null);
      live.current.onPick(e.lngLat.lng, e.lngLat.lat);
    });
    m.on("mouseenter", "trees", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "trees", () => (m.getCanvas().style.cursor = ""));

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS || !ready.current) return;
      last = now;
      if (live.current.cinematic && !m.isMoving()) m.setBearing(m.getBearing() + 0.04);
      const pulse = m.getLayer("pending-ring");
      if (pulse && live.current.pending) {
        const t = (now % 1400) / 1400;
        m.setPaintProperty("pending-ring", "circle-radius", 8 + t * 22);
        m.setPaintProperty("pending-ring", "circle-stroke-opacity", 1 - t);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    ready.current = false;
    m.setStyle(props.dark ? STYLES.dark : STYLES.light, { diff: false });
  }, [props.dark]);

  const framed = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    drawNetwork(m);
    frameLine(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.network]);

  /** Once, when the network first arrives: Line 1 fills the view, still tilted. */
  function frameLine(m: MapLibre) {
    if (framed.current) return;
    const camera = lineCamera(m, false);
    if (!camera) return;
    framed.current = true;
    m.jumpTo(camera);
  }

  /** Where the camera goes to show the whole of Line 1, tilted; closer in recording mode, where nothing covers the map. */
  function lineCamera(m: MapLibre, cinematic: boolean) {
    const line = live.current.network?.pieces.find((p) => p.kind === "alignment" && p.line === 1)?.geometry;
    if (!line || line.type !== "LineString") return null;
    const coords = line.coordinates as [number, number][];
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    const wide = window.innerWidth >= 1024;
    const padding = cinematic ? { top: 40, bottom: 160, left: 40, right: 40 } : wide ? { top: 60, bottom: 60, left: 40, right: 40 } : { top: 40, bottom: 90, left: 20, right: 20 };
    const camera = m.cameraForBounds(bounds, { padding, bearing: m.getBearing() });
    if (!camera) return null;
    return { center: camera.center, zoom: (camera.zoom ?? START.zoom) + (cinematic ? 0.55 : 0.25), pitch: cinematic ? 62 : START.pitch, bearing: framed.current ? m.getBearing() : START.bearing };
  }

  useEffect(() => {
    if (map.current && ready.current) drawTrees(map.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.trees]);

  useEffect(() => {
    if (map.current && ready.current) drawParcels(map.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.parcels]);

  useEffect(() => {
    if (map.current && ready.current) applyMonth(map.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.month]);

  useEffect(() => {
    if (map.current && ready.current) applyLayers(map.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.layers]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    drawCheck(m);
    if (props.check?.nearest) {
      const b = new maplibregl.LngLatBounds([props.check.lon, props.check.lat], [props.check.lon, props.check.lat]).extend([props.check.nearest.lon, props.check.nearest.lat]);
      m.fitBounds(b, { padding: { top: 120, bottom: 160, left: 80, right: 80 }, maxZoom: 16.5, duration: 1400, pitch: 50 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.check, props.pending]);

  useEffect(() => {
    const m = map.current;
    const f = props.focus;
    if (m && f) m.flyTo({ center: [f.lon, f.lat], zoom: f.zoom, pitch: 55, duration: 1600 });
  }, [props.focus]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const left = !props.cinematic && window.innerWidth >= 1024 ? PANEL : 0;
    m.setPadding({ left, top: 0, right: 0, bottom: 0 });
    const camera = props.cinematic ? lineCamera(m, true) : null;
    m.easeTo({ ...(camera ?? { pitch: START.pitch }), duration: 1800 });
  }, [props.cinematic]);

  function drawAll(m: MapLibre) {
    drawNetwork(m);
    frameLine(m);
    drawTrees(m);
    drawParcels(m);
    drawCheck(m);
    applyMonth(m);
    applyLayers(m);
  }

  function drawNetwork(m: MapLibre) {
    const net = live.current.network;
    if (!net) return;
    const pieces = net.pieces.filter((p) => p.geometry);
    const feature = (geometry: GeoJSON.Geometry, properties: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", geometry, properties });
    set(m, "alignment", pieces.filter((p) => p.kind === "alignment").map((p) => feature(p.geometry as GeoJSON.Geometry, { line: p.line })));
    set(m, "works", pieces.filter((p) => p.kind === "intervention_limit").map((p) => feature(p.geometry as GeoJSON.Geometry, {})));
    set(
      m,
      "solids",
      pieces
        .filter((p) => p.kind === "viaduct" || p.kind === "depot" || p.kind === "access_building")
        .map((p) => feature(p.geometry as GeoJSON.Geometry, { kind: p.kind })),
    );
    set(m, "station-shapes", net.stations.filter((s) => s.geometry && s.line === 1).map((s) => feature(s.geometry as GeoJSON.Geometry, { id: s.id })));
    set(m, "station-points", net.stations.map((s) => feature({ type: "Point", coordinates: [s.lon, s.lat] }, { id: s.id, line: s.line, label: s.line === 1 ? s.label : `L2 · ${s.number}` })));
  }

  function drawTrees(m: MapLibre) {
    const trees = live.current.trees;
    if (!trees) return;
    const dark = live.current.dark;
    set(
      m,
      "trees",
      trees.trees.map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lon, t.lat] },
        properties: { id: t.id, m: t.date ? Number(t.date.slice(0, 4) + t.date.slice(5, 7)) : UNDATED, color: dark ? treatmentOf(t.treatment).dark : treatmentOf(t.treatment).light },
      })),
    );
  }

  function drawParcels(m: MapLibre) {
    const parcels = live.current.parcels;
    if (!parcels) return;
    set(m, "parcels", parcels.parcels.filter((p) => p.geometry).map((p) => ({ type: "Feature", geometry: p.geometry as GeoJSON.Geometry, properties: { id: p.id } })));
  }

  function drawCheck(m: MapLibre) {
    const { check, pending } = live.current;
    const point = check ? [check.lon, check.lat] : pending;
    set(m, "pick", point ? [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: { pending: check ? 0 : 1 } }] : []);
    set(
      m,
      "link",
      check?.nearest
        ? [{ type: "Feature", geometry: { type: "LineString", coordinates: [[check.lon, check.lat], [check.nearest.lon, check.nearest.lat]] }, properties: {} }]
        : [],
    );
    set(m, "hit-parcel", check?.parcel?.geometry ? [{ type: "Feature", geometry: check.parcel.geometry as GeoJSON.Geometry, properties: {} }] : []);
  }

  function applyMonth(m: MapLibre) {
    const month = live.current.month;
    const now = month ? Number(month.replace("-", "")) : UNDATED;
    const shown: ExpressionSpecification = ["<=", ["get", "m"], now];
    m.setFilter("trees", shown);
    m.setFilter("trees-new", month ? ["==", ["get", "m"], now] : ["==", ["get", "m"], -1]);
  }

  function applyLayers(m: MapLibre) {
    const l = live.current.layers;
    const vis = (on: boolean) => (on ? "visible" : "none");
    for (const id of ["trees", "trees-new"]) m.setLayoutProperty(id, "visibility", vis(l.trees));
    for (const id of ["parcels-fill", "parcels-line"]) m.setLayoutProperty(id, "visibility", vis(l.parcels));
    for (const id of ["works-fill", "works-line"]) m.setLayoutProperty(id, "visibility", vis(l.works));
    for (const id of ["line2", "line2-stations", "line2-labels"]) m.setLayoutProperty(id, "visibility", vis(l.line2));
  }

  return (
    <div className={props.cinematic ? "absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:hidden" : "absolute inset-0"}>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}

function set(m: MapLibre, id: string, features: GeoJSON.Feature[]) {
  m.getSource<GeoJSONSource>(id)?.setData({ type: "FeatureCollection", features });
}

function addLayers(m: MapLibre, dark: boolean) {
  if (m.getLayer("line1")) return;
  const c = dark ? LINE_COLOR.dark : LINE_COLOR.light;
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of ["works", "parcels", "alignment", "solids", "station-shapes", "station-points", "trees", "pick", "link", "hit-parcel"]) {
    if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });
  }
  const ink = dark ? "#fafafa" : "#0a0a0a";
  const paper = dark ? "#0a0a0a" : "#ffffff";

  m.addLayer({ id: "works-fill", type: "fill", source: "works", paint: { "fill-color": c.l1, "fill-opacity": dark ? 0.07 : 0.06 } });
  m.addLayer({ id: "works-line", type: "line", source: "works", paint: { "line-color": c.l1, "line-opacity": 0.35, "line-width": 0.8, "line-dasharray": [2, 2] } });

  m.addLayer({ id: "parcels-fill", type: "fill", source: "parcels", minzoom: 13, paint: { "fill-color": dark ? "#fafafa" : "#171717", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.05, 16, 0.16] } });
  m.addLayer({ id: "parcels-line", type: "line", source: "parcels", minzoom: 14, paint: { "line-color": dark ? "#fafafa" : "#171717", "line-opacity": 0.4, "line-width": 0.6 } });

  m.addLayer({
    id: "line2",
    type: "line",
    source: "alignment",
    filter: ["==", ["get", "line"], 2],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": c.l2, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 4], "line-opacity": 0.85, "line-dasharray": [1.5, 1.5] },
  });
  m.addLayer({
    id: "line1-glow",
    type: "line",
    source: "alignment",
    filter: ["==", ["get", "line"], 1],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": c.l1, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 15, 26], "line-opacity": dark ? 0.22 : 0.16, "line-blur": 6 },
  });
  m.addLayer({
    id: "line1",
    type: "line",
    source: "alignment",
    filter: ["==", ["get", "line"], 1],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": c.l1, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 3.5], "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 15.5, 0.35] },
  });

  m.addLayer({
    id: "solids",
    type: "fill-extrusion",
    source: "solids",
    paint: {
      "fill-extrusion-color": ["match", ["get", "kind"], "viaduct", dark ? "#d4d4d8" : "#a1a1aa", "depot", dark ? "#52525b" : "#d4d4d8", c.l1],
      "fill-extrusion-base": ["match", ["get", "kind"], "viaduct", 11, 0],
      "fill-extrusion-height": ["match", ["get", "kind"], "viaduct", 14, "depot", 9, 16],
      "fill-extrusion-opacity": 0.92,
    },
  });
  m.addLayer({
    id: "stations-3d",
    type: "fill-extrusion",
    source: "station-shapes",
    paint: { "fill-extrusion-color": c.l1, "fill-extrusion-base": 9, "fill-extrusion-height": 24, "fill-extrusion-opacity": 0.95 },
  });

  m.addLayer({
    id: "trees",
    type: "circle",
    source: "trees",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2.6, 17, 6],
      "circle-opacity": ["case", ["==", ["get", "m"], UNDATED], 0.45, 0.85],
      "circle-pitch-alignment": "map",
    },
  });
  m.addLayer({
    id: "trees-new",
    type: "circle",
    source: "trees",
    paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 8, 17, 14], "circle-opacity": 0.35, "circle-blur": 0.8, "circle-pitch-alignment": "map" },
  });

  m.addLayer({
    id: "line1-stations",
    type: "circle",
    source: "station-points",
    filter: ["==", ["get", "line"], 1],
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5], "circle-color": paper, "circle-stroke-color": c.l1, "circle-stroke-width": 2, "circle-pitch-alignment": "map" },
    maxzoom: 14.5,
  });
  m.addLayer({
    id: "line2-stations",
    type: "circle",
    source: "station-points",
    filter: ["==", ["get", "line"], 2],
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 4.5], "circle-color": paper, "circle-stroke-color": c.l2, "circle-stroke-width": 1.6, "circle-pitch-alignment": "map" },
  });

  m.addLayer({ id: "hit-parcel", type: "fill", source: "hit-parcel", paint: { "fill-color": c.l1, "fill-opacity": 0.55 } });
  m.addLayer({ id: "link", type: "line", source: "link", paint: { "line-color": ink, "line-width": 1.5, "line-dasharray": [2, 1.5], "line-opacity": 0.85 } });
  m.addLayer({
    id: "pending-ring",
    type: "circle",
    source: "pick",
    filter: ["==", ["get", "pending"], 1],
    paint: { "circle-radius": 10, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": ink, "circle-stroke-width": 1.5, "circle-pitch-alignment": "map" },
  });
  m.addLayer({
    id: "pick",
    type: "circle",
    source: "pick",
    paint: { "circle-radius": 6, "circle-color": ink, "circle-stroke-color": paper, "circle-stroke-width": 2.5, "circle-pitch-alignment": "map" },
  });

  const halo = { "text-color": dark ? "#e5e5e5" : "#171717", "text-halo-color": paper, "text-halo-width": 1.4 };
  m.addLayer({
    id: "line1-labels",
    type: "symbol",
    source: "station-points",
    filter: ["==", ["get", "line"], 1],
    minzoom: 11,
    layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 13], "text-offset": [0, -1.4], "text-anchor": "bottom", "text-max-width": 8 },
    paint: halo,
  });
  m.addLayer({
    id: "line2-labels",
    type: "symbol",
    source: "station-points",
    filter: ["==", ["get", "line"], 2],
    minzoom: 12.5,
    layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 10.5, "text-offset": [0, 1.1], "text-anchor": "top" },
    paint: { ...halo, "text-color": c.l2 },
  });
}
