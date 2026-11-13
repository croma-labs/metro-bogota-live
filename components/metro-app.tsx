"use client";

import { ClapperboardIcon, XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Layers } from "@/components/metro-map";
import { AnimatedNumber, CheckPanel, Inspector, LayerToggles, monthAt, ProgressCounter, StationList, Timeline, TreeCard } from "@/components/panels";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getJson, useTraces } from "@/components/use-live";
import { monthEnd, monthShort, monthText } from "@/lib/format";
import type { Result } from "@/lib/trace";
import type { Check, Network, Parcels, Progress, Station, Tree, Trees } from "@/lib/types";
import { cn } from "@/lib/utils";

const PLAY_TICK_MS = 650;

const MetroMap = dynamic(() => import("@/components/metro-map").then((m) => m.MetroMap), { ssr: false });

function useOnce<T>(url: string, add: Parameters<typeof getJson>[1]) {
  const [result, setResult] = useState<Result<T> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getJson<T>(url, add, controller.signal)
      .then(setResult)
      .catch(() => {});
    return () => controller.abort();
  }, [url, add]);
  return result;
}

export function MetroApp() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== "light";

  const { traces, add } = useTraces();
  const networkResult = useOnce<Network>("/api/network", add);
  const progressResult = useOnce<Progress>("/api/progress", add);
  const treesResult = useOnce<Trees>("/api/trees", add);
  const parcelsResult = useOnce<Parcels>("/api/parcels", add);
  const network = networkResult?.ok ? networkResult.data : null;
  const progress = progressResult?.ok ? progressResult.data : null;
  const trees = treesResult?.ok ? treesResult.data : null;
  const parcels = parcelsResult?.ok ? parcelsResult.data : null;

  const [month, setMonth] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [layers, setLayers] = useState<Layers>({ trees: true, parcels: true, works: true, line2: true });
  const [check, setCheck] = useState<Check | null>(null);
  const [pending, setPending] = useState<[number, number] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [tree, setTree] = useState<Tree | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; zoom: number; key: string } | null>(null);
  const [record, setRecord] = useState(false);
  const checkAbort = useRef<AbortController | null>(null);
  const side = useRef<HTMLElement>(null);

  // A new answer or a picked tree: bring the panel back to the top, where it shows.
  useEffect(() => {
    if (check || pending || tree) side.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [check, pending, tree]);

  const months = progress?.months ?? [];

  // Playing: one month per tick, from where the slider is (or the start, if it sits on today).
  useEffect(() => {
    if (!playing || !months.length) return;
    const timer = setTimeout(() => {
      const i = month ? months.findIndex((m) => m.month === month) : -1;
      const next = months[i + 1];
      if (!next || i + 1 === months.length - 1) {
        setMonth(null);
        setPlaying(false);
      } else setMonth(next.month);
    }, month ? PLAY_TICK_MS : 300);
    return () => clearTimeout(timer);
  }, [playing, month, months]);

  const startPlaying = useCallback(
    (on: boolean) => {
      if (on && !month && months[0]) setMonth(months[0].month);
      setPlaying(on);
    },
    [month, months],
  );

  const pick = useCallback(
    (lon: number, lat: number) => {
      checkAbort.current?.abort();
      const controller = new AbortController();
      checkAbort.current = controller;
      setCheck(null);
      setCheckError(null);
      setPending([lon, lat]);
      getJson<Check>(`/api/check?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, add, controller.signal)
        .then((r) => {
          setPending(null);
          if (r.ok) setCheck(r.data);
          else setCheckError(r.error.message);
        })
        .catch(() => {});
    },
    [add],
  );

  const clearCheck = useCallback(() => {
    checkAbort.current?.abort();
    setCheck(null);
    setPending(null);
    setCheckError(null);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setCheckError("Tu navegador no comparte la ubicación. Toca el mapa.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (p.coords.latitude < 4.3 || p.coords.latitude > 5 || p.coords.longitude < -74.5 || p.coords.longitude > -73.8) {
          setCheckError("Estás fuera de Bogotá. Toca un punto del mapa.");
          return;
        }
        pick(p.coords.longitude, p.coords.latitude);
      },
      () => {
        setLocating(false);
        setCheckError("No pudimos leer tu ubicación. Toca el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [pick]);

  const pickStation = useCallback((s: Station) => {
    setFocus({ lon: s.lon, lat: s.lat, zoom: 16.2, key: `${s.id}-${Date.now()}` });
  }, []);

  const treeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const end = month ? monthEnd(month) : null;
    for (const t of trees?.trees ?? []) {
      if (end && (!t.date || t.date > end)) continue;
      counts.set(t.treatment, (counts.get(t.treatment) ?? 0) + 1);
    }
    return counts;
  }, [trees, month]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " ") {
        e.preventDefault();
        startPlaying(!playing);
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && months.length) {
        setPlaying(false);
        const i = month ? months.findIndex((m) => m.month === month) : months.length - 1;
        const j = Math.min(months.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)));
        setMonth(j === months.length - 1 ? null : (months[j]?.month ?? null));
      }
      if (e.key === "r" || e.key === "R") setRecord((r) => !r);
      if (e.key === "Escape") {
        setRecord(false);
        setTree(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startPlaying, playing, month, months]);

  const progressError = progressResult && !progressResult.ok ? progressResult.error.message : null;

  const panel = (
    <>
      <ProgressCounter progress={progress} month={month} error={progressError} />
      {tree ? <TreeCard tree={tree} onClose={() => setTree(null)} dark={dark} /> : null}
      <CheckPanel check={check} pending={pending != null} error={checkError} onLocate={locate} locating={locating} onClear={clearCheck} />
      <Timeline progress={progress} month={month} onMonth={setMonth} playing={playing} onPlaying={startPlaying} />
      <LayerToggles layers={layers} onLayers={setLayers} treeCounts={treeCounts} parcels={parcels?.parcels.length ?? null} dark={dark} />
      <StationList network={network} onPick={pickStation} dark={dark} />
      <section className="flex flex-wrap gap-2 border-b border-line px-5 py-4">
        <Button size="sm" variant="outline" onClick={() => setRecord(true)}>
          <ClapperboardIcon />
          Modo grabación
          <kbd className="ml-1 border border-line px-1 font-mono text-[9px] text-muted-foreground">R</kbd>
        </Button>
      </section>
      <Inspector traces={traces} />
    </>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {record ? null : <SiteHeader />}
      <main className="relative min-h-0 flex-1">
        <MetroMap
          network={network}
          trees={trees}
          parcels={parcels}
          dark={dark}
          month={month}
          layers={layers}
          check={check}
          pending={pending}
          cinematic={record}
          focus={focus}
          onPick={pick}
          onSelectTree={setTree}
        />
        {record ? (
          <RecordOverlay progress={progress} month={month} trees={[...treeCounts.values()].reduce((a, b) => a + b, 0)} onExit={() => setRecord(false)} />
        ) : (
          <>
            <aside ref={side} className="absolute inset-y-0 left-0 z-10 hidden w-[380px] flex-col overflow-y-auto border-r border-line bg-background/90 backdrop-blur-md lg:flex">
              {panel}
              <Footer />
            </aside>
            <MobileBar progress={progress} month={month} hasCheck={check != null || pending != null}>
              {panel}
            </MobileBar>
          </>
        )}
      </main>
    </div>
  );
}

function Footer() {
  return (
    <p className="mt-auto border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
      Datos de la Empresa Metro de Bogotá vía <a className="underline-offset-2 hover:underline" href="https://usecroma.com">Croma</a>. Mapa © CARTO, © OpenStreetMap.
    </p>
  );
}

function RecordOverlay({ progress, month, trees, onExit }: { progress: Progress | null; month: string | null; trees: number; onExit: () => void }) {
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(t);
  }, []);
  const m = monthAt(progress, month);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[55%] bg-gradient-to-t from-background via-background/75 to-transparent" />
      <div className="pointer-events-none absolute bottom-8 left-8 z-20 sm:bottom-12 sm:left-12">
        <span className="eyebrow">Metro de Bogotá · Línea 1 · {m ? monthShort(m.month) : "…"}</span>
        <div className="mt-3 flex items-end gap-2 text-[88px] leading-none font-semibold tracking-[-0.045em] sm:text-[128px]">
          {m?.executed != null ? <AnimatedNumber value={m.executed} digits={1} /> : "…"}
          <span className="mb-3 text-4xl text-muted-foreground sm:mb-5 sm:text-5xl">%</span>
        </div>
        <p className="mt-3 text-lg text-muted-foreground sm:text-xl">
          de la obra ejecutada{m ? ` a ${monthText(m.month)}` : ""} · {trees === 1 ? "1 árbol intervenido" : `${trees.toLocaleString("es-CO")} árboles intervenidos`}
        </p>
      </div>
      <div className="pointer-events-none absolute right-8 bottom-8 z-20 text-right sm:right-12 sm:bottom-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Croma" src="/croma_brand_black.svg" className="ml-auto h-5 w-auto dark:invert" />
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">POST api.croma.run/co/metro-bogota/progress/v1</p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Salir del modo grabación"
        onClick={onExit}
        className={cn("absolute top-4 right-4 z-20 transition-opacity duration-700", hint ? "opacity-100" : "opacity-0 hover:opacity-100")}
      >
        <XIcon />
      </Button>
      <div className={cn("pointer-events-none absolute top-5 left-1/2 z-20 -translate-x-1/2 border border-line bg-background/80 px-3 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur transition-opacity duration-700", hint ? "opacity-100" : "opacity-0")}>
        Espacio reproduce la obra · R o Esc para salir
      </div>
    </>
  );
}

function MobileBar({ progress, month, hasCheck, children }: { progress: Progress | null; month: string | null; hasCheck: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (hasCheck) setOpen(true);
  }, [hasCheck]);
  const m = monthAt(progress, month);
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden">
      {open ? (
        <div className="max-h-[70dvh] overflow-y-auto border-t border-line bg-background/95 backdrop-blur-md">
          {children}
          <Footer />
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between border-t border-line bg-background/90 px-5 py-3.5 backdrop-blur-md">
        <span className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tracking-tight">{m?.executed != null ? <AnimatedNumber value={m.executed} digits={1} /> : "…"} %</span>
          <span className="text-sm text-muted-foreground">obra ejecutada{m ? ` · ${monthShort(m.month)}` : ""}</span>
        </span>
        <span className="eyebrow-sm">{open ? "Cerrar" : "Detalles"}</span>
      </button>
    </div>
  );
}
