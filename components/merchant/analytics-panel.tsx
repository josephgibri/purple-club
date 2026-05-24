"use client";

import {
  BarChart3,
  Copy,
  ExternalLink,
  Eye,
  MapPin,
  ScanLine,
  Users,
} from "lucide-react";

type SummaryCounts = {
  impressions: number;
  uniqueViewers: number;
  drawerOpens: number;
  codeCopies: number;
  websiteClicks: number;
  mapsClicks: number;
  passScans: number;
};

type DailyBucket = { date: string; impressions: number; actions: number };

export type ListingAnalytics = {
  listingId: string;
  merchantId: string;
  businessName: string;
  summary7d: SummaryCounts;
  summary30d: SummaryCounts;
  funnel: {
    impressionsToDrawer: number;
    drawerToAction: number;
    overallConversion: number;
  };
  daily30d: DailyBucket[];
  topCountries: Array<{ country: string; impressions: number }>;
  topHours: number[];
};

type AnalyticsPanelProps = {
  data: ListingAnalytics;
};

/**
 * Self-contained merchant analytics card. No chart library: the
 * trend chart is a tiny inline SVG so the bundle stays small and
 * the UI feels snappy in the dashboard.
 *
 * Layout:
 *   1. Summary tiles (7d numbers, with 30d ghosted underneath)
 *   2. Funnel bars (impression → drawer → action)
 *   3. 30-day trend SVG
 *   4. Top countries + hour-of-day histogram (for local merchants)
 */
export function AnalyticsPanel({ data }: AnalyticsPanelProps) {
  const has30dData =
    data.summary30d.impressions > 0 || data.summary30d.passScans > 0;

  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-accent">
            {data.businessName}
          </p>
          <h3 className="mt-1 text-lg font-semibold">Performance · last 7 days</h3>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-violet-100/65">
          30d totals shown below each tile
        </span>
      </header>

      {!has30dData ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-violet-100/70">
          No traffic yet. Members will show up here once they browse the
          directory or scan your pass.
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile
              icon={<Eye size={14} />}
              label="Impressions"
              value7={data.summary7d.impressions}
              value30={data.summary30d.impressions}
            />
            <SummaryTile
              icon={<Users size={14} />}
              label="Unique viewers"
              value7={data.summary7d.uniqueViewers}
              value30={data.summary30d.uniqueViewers}
            />
            <SummaryTile
              icon={<BarChart3 size={14} />}
              label="Drawer opens"
              value7={data.summary7d.drawerOpens}
              value30={data.summary30d.drawerOpens}
            />
            <SummaryTile
              icon={<ScanLine size={14} />}
              label="Pass scans"
              value7={data.summary7d.passScans}
              value30={data.summary30d.passScans}
              accent="emerald"
            />
            <SummaryTile
              icon={<Copy size={14} />}
              label="Code copies"
              value7={data.summary7d.codeCopies}
              value30={data.summary30d.codeCopies}
            />
            <SummaryTile
              icon={<ExternalLink size={14} />}
              label="Website clicks"
              value7={data.summary7d.websiteClicks}
              value30={data.summary30d.websiteClicks}
            />
            <SummaryTile
              icon={<MapPin size={14} />}
              label="Maps opens"
              value7={data.summary7d.mapsClicks}
              value30={data.summary30d.mapsClicks}
            />
            <SummaryTile
              icon={<BarChart3 size={14} />}
              label="Conversion"
              value7Display={`${data.funnel.overallConversion}%`}
              value30Display="Action / impression"
            />
          </div>

          <FunnelBars funnel={data.funnel} summary={data.summary7d} />

          <TrendChart daily={data.daily30d} />

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <TopCountries entries={data.topCountries} />
            <HourHistogram hours={data.topHours} passScans={data.summary30d.passScans} />
          </div>
        </>
      )}
    </article>
  );
}

type SummaryTileProps = {
  icon: React.ReactNode;
  label: string;
  value7?: number;
  value30?: number;
  value7Display?: string;
  value30Display?: string;
  accent?: "default" | "emerald";
};

function SummaryTile({
  icon,
  label,
  value7,
  value30,
  value7Display,
  value30Display,
  accent = "default",
}: SummaryTileProps) {
  const primary = value7Display ?? value7?.toLocaleString() ?? "0";
  const secondary =
    value30Display ?? (typeof value30 === "number" ? `${value30.toLocaleString()} (30d)` : null);
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent === "emerald"
          ? "border-emerald-400/40 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-violet-100/55">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={`mt-1 text-2xl font-semibold ${
          accent === "emerald" ? "text-emerald-50" : "text-white"
        }`}
      >
        {primary}
      </p>
      {secondary ? (
        <p className="mt-0.5 text-[11px] text-violet-100/55">{secondary}</p>
      ) : null}
    </div>
  );
}

type FunnelBarsProps = {
  funnel: ListingAnalytics["funnel"];
  summary: SummaryCounts;
};

function FunnelBars({ funnel, summary }: FunnelBarsProps) {
  const rows = [
    { label: "Impressions → Drawer opens", value: funnel.impressionsToDrawer },
    { label: "Drawer opens → Any action", value: funnel.drawerToAction },
    { label: "Impressions → Any action (overall)", value: funnel.overallConversion },
  ];
  return (
    <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <header className="flex items-center justify-between text-xs">
        <p className="font-semibold uppercase tracking-[0.18em] text-violet-100/60">
          Funnel (last 7 days)
        </p>
        <p className="text-[11px] text-violet-100/55">
          {summary.impressions} impressions · {summary.drawerOpens} drawers ·{" "}
          {summary.codeCopies + summary.websiteClicks + summary.mapsClicks + summary.passScans} actions
        </p>
      </header>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-[11px] text-violet-100/70">
              <span>{row.label}</span>
              <span className="font-mono text-violet-100/90">{row.value}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-accent to-gold-accent transition-all"
                style={{ width: `${Math.min(100, Math.max(2, row.value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type TrendChartProps = {
  daily: DailyBucket[];
};

function TrendChart({ daily }: TrendChartProps) {
  const width = 520;
  const height = 120;
  const padding = { top: 8, right: 4, bottom: 16, left: 4 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...daily.flatMap((d) => [d.impressions, d.actions]),
  );
  const barGroupWidth = chartWidth / daily.length;
  const barWidth = Math.max(2, barGroupWidth * 0.35);

  return (
    <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <header className="flex items-center justify-between text-xs">
        <p className="font-semibold uppercase tracking-[0.18em] text-violet-100/60">
          30-day trend
        </p>
        <div className="flex gap-3 text-[11px] text-violet-100/65">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-accent" />
            Impressions
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-gold-accent" />
            Actions
          </span>
        </div>
      </header>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="30-day impressions and actions trend"
      >
        {daily.map((bucket, index) => {
          const x = padding.left + index * barGroupWidth;
          const impressionHeight = (bucket.impressions / maxValue) * chartHeight;
          const actionHeight = (bucket.actions / maxValue) * chartHeight;
          return (
            <g key={bucket.date}>
              <rect
                x={x + barGroupWidth * 0.15}
                y={padding.top + chartHeight - impressionHeight}
                width={barWidth}
                height={impressionHeight}
                fill="rgb(139, 92, 246)"
                opacity="0.75"
                rx="1"
              />
              <rect
                x={x + barGroupWidth * 0.5}
                y={padding.top + chartHeight - actionHeight}
                width={barWidth}
                height={actionHeight}
                fill="rgb(246, 196, 83)"
                opacity="0.85"
                rx="1"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-violet-100/45">
        <span>{daily[0]?.date.slice(5) ?? ""}</span>
        <span>{daily[Math.floor(daily.length / 2)]?.date.slice(5) ?? ""}</span>
        <span>{daily[daily.length - 1]?.date.slice(5) ?? ""}</span>
      </div>
    </section>
  );
}

type TopCountriesProps = {
  entries: Array<{ country: string; impressions: number }>;
};

function TopCountries({ entries }: TopCountriesProps) {
  if (entries.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/60">
          Top countries (30d)
        </p>
        <p className="mt-3 text-xs text-violet-100/55">
          Geo data appears once members start browsing your listing.
        </p>
      </section>
    );
  }
  const max = entries[0]?.impressions ?? 1;
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/60">
        Top countries (30d)
      </p>
      <ul className="mt-3 space-y-2">
        {entries.map((entry) => (
          <li key={entry.country} className="text-xs text-violet-100/85">
            <div className="flex items-center justify-between">
              <span className="font-mono uppercase">{entry.country}</span>
              <span className="text-violet-100/60">{entry.impressions}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-purple-accent/60"
                style={{ width: `${(entry.impressions / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type HourHistogramProps = {
  hours: number[];
  passScans: number;
};

function HourHistogram({ hours, passScans }: HourHistogramProps) {
  const max = Math.max(1, ...hours);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/60">
        Pass scans by hour (UTC, 30d)
      </p>
      {passScans === 0 ? (
        <p className="mt-3 text-xs text-violet-100/55">
          No in-person scans yet. Print your sticker and bookmark the verifier
          link on your counter device.
        </p>
      ) : (
        <>
          <div className="mt-3 flex h-20 items-end gap-[3px]">
            {hours.map((count, hour) => (
              <div
                key={hour}
                className="flex-1 rounded-sm bg-emerald-400/70"
                style={{ height: `${Math.max(2, (count / max) * 100)}%` }}
                title={`${hour}:00 — ${count} scans`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-violet-100/45">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </>
      )}
    </section>
  );
}
