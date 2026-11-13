"use client";

import { CheckIcon, ChevronRightIcon, CopyIcon, LocateFixedIcon, PauseIcon, PlayIcon, TerminalSquareIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type Layers, LINE_COLOR } from "@/components/metro-map";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { copText, dateText, distanceText, formatMs, monthShort, monthText, pctText, TREATMENTS, treatmentOf } from "@/lib/format";
import type { Trace } from "@/lib/trace";
import type { Check, Milestone, Month, Network, Progress, Station, Tree } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Section({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line", className)}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <span className="eyebrow">{title}</span>
        {aside}
      </div>
      <div className="px-5 pb-4">{children}</div>
    </section>
  );
}

/** Eases to `value` instead of jumping, so a new month reads as movement. */
export function AnimatedNumber({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const start = current.current;
    const began = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 700);
      const v = start + (value - start) * (1 - (1 - t) ** 3);
      current.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn("tabular-nums", className)}>{shown.toLocaleString("es-CO", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}

/** The month the slider is on, or the newest month with a physical figure. */
export function monthAt(progress: Progress | null, month: string | null): Month | null {
  if (!progress) return null;
  const withFigure = progress.months.filter((m) => m.executed != null);
  if (!month) return withFigure[withFigure.length - 1] ?? null;
  return progress.months.find((m) => m.month === month) ?? null;
}

export function ProgressCounter({ progress, month, error }: { progress: Progress | null; month: string | null; error: string | null }) {
  const m = monthAt(progress, month);
  const executed = m?.executed ?? null;
  return (
    <section className="border-b border-line px-5 pt-5 pb-5">
      <span className="eyebrow">Avance de obra · Línea 1</span>
      <div className="mt-4 flex items-end gap-1 font-sans text-[64px] leading-none font-semibold tracking-[-0.04em]">
        {executed != null ? <AnimatedNumber value={executed} digits={2} /> : <span className="text-muted-foreground/40">{progress ? "—" : "0"}</span>}
        <span className="mb-2 text-2xl text-muted-foreground">%</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {m ? (
          executed != null ? (
            <>
              ejecutado a {monthText(m.month)}, contra <span className="text-foreground">{pctText(m.planned, 2)}</span> programado
            </>
          ) : (
            <>sin cifra de obra física en {monthText(m.month)}</>
          )
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          "Cargando el avance…"
        )}
      </p>
      {progress?.project ? (
        <p className="mt-3 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {copText(progress.project.valueCop)} · entrega {progress.project.end ? dateText(progress.project.end) : "sin fecha"}
        </p>
      ) : null}
    </section>
  );
}

export function Timeline({
  progress,
  month,
  onMonth,
  playing,
  onPlaying,
}: {
  progress: Progress | null;
  month: string | null;
  onMonth: (month: string | null) => void;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
}) {
  const months = progress?.months ?? [];
  const index = month ? months.findIndex((m) => m.month === month) : months.length - 1;
  const at = months[index];
  const recent = progress ? milestonesUpTo(progress.milestones, at?.month ?? null, 3) : [];
  const first = months[0]?.month;
  const last = months[months.length - 1]?.month;
  return (
    <Section title="Línea de tiempo" aside={<span className="eyebrow-sm">espacio · ← →</span>}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="block font-mono text-[28px] leading-none font-semibold tracking-tight tabular-nums">{at ? monthShort(at.month) : "…"}</span>
          {month ? (
            <button type="button" className="mt-2 font-mono text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => onMonth(null)}>
              Volver a hoy
            </button>
          ) : (
            <span className="mt-2 block font-mono text-[10.5px] text-muted-foreground">Último reporte</span>
          )}
        </div>
        <Button size="icon" variant="outline" aria-label={playing ? "Pausar" : "Reproducir la obra"} disabled={!months.length} onClick={() => onPlaying(!playing)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </div>
      <Bars months={months} index={index} onPick={(i) => onMonth(months[i]?.month ?? null)} />
      <Slider
        className="mt-3"
        min={0}
        max={Math.max(0, months.length - 1)}
        step={1}
        value={[Math.max(0, index)]}
        aria-label="Mes"
        onValueChange={(value) => {
          onPlaying(false);
          const i = Array.isArray(value) ? (value[0] ?? 0) : value;
          onMonth(i === months.length - 1 ? null : (months[i]?.month ?? null));
        }}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
        <span>{first ? monthShort(first) : ""}</span>
        <span>{last ? monthShort(last) : ""}</span>
      </div>
      {recent.length ? (
        <ul className="mt-4 space-y-2 border-t border-line pt-3">
          {recent.map((m) => (
            <li key={m.name + m.date} className="grid grid-cols-[64px_1fr] gap-3 text-[12.5px] leading-snug">
              <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">{m.date.slice(0, 7)}</span>
              <span>{m.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs leading-snug text-muted-foreground">
        El avance es el de toda la obra, según el reporte mensual de la Empresa Metro de Bogotá. En el mapa aparece cada árbol intervenido el mes en que se ejecutó.
      </p>
    </Section>
  );
}

function milestonesUpTo(milestones: Milestone[], month: string | null, n: number): Milestone[] {
  const upTo = month ? milestones.filter((m) => m.date.slice(0, 7) <= month) : milestones;
  return upTo.slice(-n).reverse();
}

/** Executed (solid) against planned (outline) per month; the picked month is lit. */
function Bars({ months, index, onPick }: { months: Month[]; index: number; onPick: (i: number) => void }) {
  return (
    <div className="mt-4 flex h-16 items-end gap-px" role="img" aria-label="Avance ejecutado y programado por mes">
      {months.map((m, i) => {
        const on = i <= index;
        return (
          <button
            type="button"
            key={m.month}
            aria-label={monthText(m.month)}
            onClick={() => onPick(i)}
            className="relative h-full min-w-0 flex-1"
          >
            {m.planned != null ? <span className="absolute inset-x-0 bottom-0 border-t border-muted-foreground/50" style={{ height: `${m.planned}%` }} /> : null}
            <span
              className={cn("absolute inset-x-0 bottom-0 transition-colors", i === index ? "bg-foreground" : on ? "bg-agent" : "bg-muted-foreground/25")}
              style={{ height: `${m.executed ?? 0}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

export function CheckPanel({
  check,
  pending,
  error,
  onLocate,
  locating,
  onClear,
}: {
  check: Check | null;
  pending: boolean;
  error: string | null;
  onLocate: () => void;
  locating: boolean;
  onClear: () => void;
}) {
  return (
    <Section
      title="¿Tu predio y el metro?"
      aside={
        check || pending ? (
          <Button size="icon-xs" variant="ghost" aria-label="Borrar" onClick={onClear}>
            <XIcon />
          </Button>
        ) : null
      }
    >
      {!check && !pending ? (
        <>
          <p className="text-[13px] leading-snug">Toca cualquier punto del mapa: te decimos a qué distancia queda la estación más cercana, si está dentro de la zona de obra y si es uno de los predios que necesita la Línea 1.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={onLocate} disabled={locating}>
            <LocateFixedIcon />
            {locating ? "Buscando tu ubicación…" : "Usar mi ubicación"}
          </Button>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </>
      ) : pending ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : check ? (
        <CheckResult check={check} />
      ) : null}
    </Section>
  );
}

function CheckResult({ check }: { check: Check }) {
  const l1 = check.lines.find((l) => l.line === 1);
  const l2 = check.lines.find((l) => l.line === 2);
  return (
    <div>
      {check.nearest ? (
        <>
          <p className="eyebrow-sm">Estación más cercana</p>
          <p className="mt-1.5 text-xl leading-tight font-semibold tracking-tight">{check.nearest.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            a <span className="text-foreground">{distanceText(check.nearest.distanceM)}</span> en línea recta · Línea {check.nearest.line}
            {check.nearest.line === 2 ? " (en diseño)" : ""}
          </p>
        </>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-px border border-line bg-line">
        <Fact label="A la Línea 1" value={distanceText(l1?.distanceM ?? null)} />
        <Fact label="A la Línea 2" value={distanceText(l2?.distanceM ?? null)} />
        <Fact label="Zona de obra" value={check.insideWorks ? "Adentro" : `Afuera · ${distanceText(check.worksDistanceM)}`} strong={check.insideWorks} />
        <Fact label="Estaciones a 1 km" value={String(check.stationsWithin1km)} />
      </dl>
      <div className={cn("mt-3 border px-3 py-2.5", check.parcel ? "border-agent bg-agent/10" : "border-line")}>
        {check.parcel ? (
          <>
            <p className="text-[13px] font-medium">Es un predio requerido para la Línea 1</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {check.parcel.address ?? "Sin dirección"} · CHIP {check.parcel.chip ?? "sin dato"}
              {check.parcel.areaM2 != null ? ` · ${check.parcel.areaM2.toLocaleString("es-CO")} m²` : ""}
            </p>
          </>
        ) : (
          <p className="text-[13px]">
            No es un predio requerido.{" "}
            <span className="text-muted-foreground">{check.parcelsWithin100m > 0 ? `Hay ${check.parcelsWithin100m} a menos de 100 m.` : "Ninguno a menos de 100 m."}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-background px-3 py-2">
      <dt className="eyebrow-sm">{label}</dt>
      <dd className={cn("mt-1 truncate text-[13px] tabular-nums", strong && "font-semibold text-agent")}>{value}</dd>
    </div>
  );
}

export function StationList({ network, onPick, dark }: { network: Network | null; onPick: (s: Station) => void; dark: boolean }) {
  const line1 = network?.stations.filter((s) => s.line === 1).sort((a, b) => a.number.localeCompare(b.number)) ?? [];
  return (
    <Section title="Estaciones · Línea 1" aside={<span className="eyebrow-sm">{line1.length || ""}</span>}>
      {line1.length ? (
        <ol className="relative ml-1.5 border-l-2" style={{ borderColor: dark ? LINE_COLOR.dark.l1 : LINE_COLOR.light.l1 }}>
          {line1.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s)} className="group flex w-full items-center gap-3 py-1 pl-3 text-left">
                <span className="-ml-[19px] size-2.5 rounded-full border-2 bg-background" style={{ borderColor: dark ? LINE_COLOR.dark.l1 : LINE_COLOR.light.l1 }} />
                <span className="w-5 font-mono text-[10.5px] text-muted-foreground tabular-nums">{s.number}</span>
                <span className="text-[13px] group-hover:underline">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </Section>
  );
}

export function LayerToggles({
  layers,
  onLayers,
  treeCounts,
  parcels,
  dark,
}: {
  layers: Layers;
  onLayers: (l: Layers) => void;
  treeCounts: Map<string, number>;
  parcels: number | null;
  dark: boolean;
}) {
  const c = dark ? LINE_COLOR.dark : LINE_COLOR.light;
  const total = [...treeCounts.values()].reduce((a, b) => a + b, 0);
  const rows = Object.entries(TREATMENTS)
    .filter(([code]) => treeCounts.get(code))
    .sort((a, b) => a[1].order - b[1].order);
  return (
    <Section title="Capas" aside={<span className="eyebrow-sm">toca para ocultar</span>}>
      <ul className="-mx-2 space-y-0.5">
        <Toggle on={layers.trees} onClick={() => onLayers({ ...layers, trees: !layers.trees })} swatch={<span className="size-2.5 rounded-full bg-[#4ade80]" />} label="Árboles intervenidos" count={total} />
        {layers.trees ? (
          <li className="flex flex-wrap gap-x-3 gap-y-1 px-2 pb-1.5 pl-[34px]">
            {rows.map(([code, t]) => (
              <span key={code} className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: dark ? treatmentOf(code).dark : treatmentOf(code).light }} />
                {t.label} {treeCounts.get(code)?.toLocaleString("es-CO")}
              </span>
            ))}
          </li>
        ) : null}
        <Toggle on={layers.parcels} onClick={() => onLayers({ ...layers, parcels: !layers.parcels })} swatch={<span className="size-2.5 border border-foreground/60 bg-foreground/20" />} label="Predios requeridos" count={parcels} hint="desde zoom 13" />
        <Toggle on={layers.works} onClick={() => onLayers({ ...layers, works: !layers.works })} swatch={<span className="size-2.5 border border-dashed" style={{ borderColor: c.l1 }} />} label="Zona de obra" count={null} />
        <Toggle on={layers.line2} onClick={() => onLayers({ ...layers, line2: !layers.line2 })} swatch={<span className="h-0.5 w-2.5 border-t-2 border-dashed" style={{ borderColor: c.l2 }} />} label="Línea 2 (en diseño)" count={null} />
      </ul>
    </Section>
  );
}

function Toggle({ on, onClick, swatch, label, count, hint }: { on: boolean; onClick: () => void; swatch: React.ReactNode; label: string; count: number | null; hint?: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cn("grid w-full grid-cols-[14px_1fr_auto] items-center gap-3 px-2 py-1.5 text-left transition-colors hover:bg-secondary/50", !on && "opacity-40")}>
        <span className="flex items-center justify-center">{swatch}</span>
        <span className="text-[13px]">
          {label}
          {hint ? <span className="ml-2 font-mono text-[10px] text-muted-foreground">{hint}</span> : null}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{count != null ? count.toLocaleString("es-CO") : ""}</span>
      </button>
    </li>
  );
}

export function TreeCard({ tree, onClose, dark }: { tree: Tree; onClose: () => void; dark: boolean }) {
  const t = treatmentOf(tree.treatment);
  return (
    <section className="border-b border-line bg-secondary/30">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <span className="eyebrow">Árbol</span>
          <p className="mt-2 text-[15px] leading-tight font-medium">{tree.name ?? "Sin nombre común"}</p>
          {tree.scientific ? <p className="mt-0.5 text-[12px] text-muted-foreground italic">{tree.scientific}</p> : null}
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Cerrar" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-px border-y border-line bg-line">
        <div className="bg-background px-5 py-2.5">
          <dt className="eyebrow-sm">Tratamiento</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-[13px]">
            <span className="size-2 rounded-full" style={{ background: dark ? t.dark : t.light }} />
            {t.label}
          </dd>
        </div>
        <div className="bg-background px-5 py-2.5">
          <dt className="eyebrow-sm">Fecha</dt>
          <dd className="mt-1 text-[13px]">{tree.date ? dateText(tree.date) : tree.status === "no_ejecutado" ? "No ejecutado" : "Sin reporte"}</dd>
        </div>
        <div className="bg-background px-5 py-2.5">
          <dt className="eyebrow-sm">Altura</dt>
          <dd className="mt-1 text-[13px]">{tree.heightM != null ? `${tree.heightM} m` : "Sin dato"}</dd>
        </div>
        <div className="bg-background px-5 py-2.5">
          <dt className="eyebrow-sm">Localidad</dt>
          <dd className="mt-1 truncate text-[13px] capitalize">{tree.locality?.toLowerCase() ?? "Sin dato"}</dd>
        </div>
        {tree.place ? (
          <div className="col-span-2 bg-background px-5 py-2.5">
            <dt className="eyebrow-sm">Dónde</dt>
            <dd className="mt-1 truncate text-[13px]">{tree.place}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function Inspector({ traces }: { traces: Trace[] }) {
  return (
    <section>
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <div className="flex items-center gap-2">
          <TerminalSquareIcon className="size-3.5 text-agent" />
          <span className="eyebrow">Inspector</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{traces.length} llamadas</span>
      </div>
      <p className="px-5 pb-3 text-[11px] leading-relaxed text-muted-foreground">
        Cada llamada a la API de Croma sale del servidor. Las estaciones, la obra, los árboles y los predios se leen una vez y se comparten entre todos los visitantes. La API key nunca llega al navegador.
      </p>
      <div className="border-t border-line">
        {traces.map((t) => (
          <TraceRow key={t.id} trace={t} />
        ))}
      </div>
    </section>
  );
}

function TraceRow({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ok = trace.status < 300;
  const curl = `curl https://api.croma.run${trace.path} \\\n  -H "Authorization: Bearer $CROMA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(trace.body)}'`;
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-secondary/40">
        <ChevronRightIcon className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className={cn("font-mono text-[10px] font-medium tabular-nums", ok ? "text-positive" : "text-destructive")}>{trace.status}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {trace.path.replace("/co/metro-bogota/", "").replace("/v1", "")}
          {trace.pages && trace.pages > 1 ? <span className="text-muted-foreground"> · {trace.pages} páginas</span> : null}
          {trace.shared ? <span className="text-muted-foreground"> · compartida</span> : null}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{formatMs(trace.ms)}</span>
      </button>
      {open ? (
        <div className="space-y-2 px-5 pb-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow-sm">POST · {new Date(trace.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(curl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              cURL
            </Button>
          </div>
          <pre className="overflow-auto border border-line bg-secondary/30 p-2.5 font-mono text-[10.5px] leading-relaxed">{curl}</pre>
        </div>
      ) : null}
    </div>
  );
}
