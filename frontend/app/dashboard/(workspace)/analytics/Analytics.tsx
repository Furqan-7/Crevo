"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import base from "../../dashboard.module.css";
import styles from "./analytics.module.css";
import { PageHead, TopBar, useShell } from "../../_shell/AppShell";
import { ReconnectBanner } from "../../_shell/states";
import { cx } from "../../_shell/ui";
import type { AnalyticsDto } from "@api-types";
import { ApiError, api } from "../../_shell/api";
import { EmptyState } from "../../_shell/states";
import { dayLabel } from "../../data";

type Revenue = { month: string; paid: number; owed: number }[];
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
import {
  AVERAGE_VIEWS,
  CHANNELS,
  HEAT_DAYS,
  RANGES,
  HEAT_SLOTS,
  formats,
  heat,
  type Channel,
  type DayStat,
  type Range,
} from "./data";

const CHANNEL = Object.fromEntries(CHANNELS.map((c) => [c.id, c])) as Record<Channel, (typeof CHANNELS)[number]>;
// Sequential blue ramp (100 → 700) for the best-times heatmap.
const BLUE_RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const GOOD = "#0ca30c";
const CRITICAL = "#d03b3b";

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
const full = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

// Round up to a tidy axis maximum and return evenly spaced ticks.
function niceTicks(max: number, count = 4) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function sum(days: DayStat[], key: "views" | "followers", channels: Channel[]) {
  return days.reduce((total, d) => total + channels.reduce((s, c) => s + d[key][c], 0), 0);
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const change = ((now - before) / before) * 100;
  const up = change >= 0;
  return (
    <span className={styles.delta}>
      <span style={{ color: up ? GOOD : CRITICAL }} aria-hidden="true">{up ? "▲" : "▼"}</span>
      {up ? "+" : "−"}
      {Math.abs(change).toFixed(1)}% <span className={styles.vs}>vs previous period</span>
    </span>
  );
}

function Card({ title, sub, children, table, wide }: { title: string; sub?: string; children: ReactNode; table?: ReactNode; wide?: boolean }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cx(styles.card, wide && styles.wide)}>
      <div className={styles.cardHead}>
        <div>
          <h2>{title}</h2>
          {sub && <small>{sub}</small>}
        </div>
        {table && (
          <button type="button" className={base.mini} onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? "Chart" : "Table"}
          </button>
        )}
      </div>
      {showTable ? <div className={styles.tableWrap}>{table}</div> : children}
    </section>
  );
}

export default function Analytics({ initialRange }: { initialRange: Range }) {
  const router = useRouter();
  const { notify, allDeals, addIdea } = useShell();
  const [range, setRange] = useState<Range>(initialRange);
  const [shown, setShown] = useState<Channel[]>(CHANNELS.map((c) => c.id));
  const [data, setData] = useState<AnalyticsDto | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(null);
    api.analytics(range).then(
      (result) => live && setData(result),
      (err: unknown) => live && setFailed(err instanceof ApiError ? err.message : "Analytics didn't load."),
    );
    return () => {
      live = false;
    };
  }, [range, attempt]);

  if (!data) {
    return (
      <>
        <TopBar />
        <PageHead eyebrow="analytics" title="Analytics" lead={`Last ${range} days across your channels.`} />
        {failed ? (
          <EmptyState title="Analytics didn't load" action={<button type="button" className={base.btnDark} onClick={() => setAttempt((n) => n + 1)}>Try again</button>}>
            {failed}
          </EmptyState>
        ) : (
          <div className={styles.loading} role="status">Loading your numbers…</div>
        )}
      </>
    );
  }

  const daily = data.days;
  const revenue: Revenue = data.revenue.map((r) => ({ ...r, month: MONTH.format(new Date(`${r.month}-01T00:00:00Z`)) }));
  const topContent = data.topContent.map((t) => ({ ...t, posted: dayLabel(t.postedAt, false) }));
  const owedBy = allDeals.filter((d) => d.overdue).map((d) => d.brand);
  const days = daily.slice(-range);
  const before = daily.slice(0, -range);
  const views = sum(days, "views", shown);
  const followers = sum(days, "followers", shown);
  const watchHours = Math.round(days.reduce((s, d) => s + d.watchMinutes, 0) / 60);
  const watchBefore = Math.round(before.reduce((s, d) => s + d.watchMinutes, 0) / 60);
  const oct = revenue[revenue.length - 1];

  function pickRange(next: Range) {
    setRange(next);
    router.replace(`/dashboard/analytics?range=${next}`, { scroll: false });
  }

  function toggleChannel(id: Channel) {
    setShown((s) => (s.includes(id) ? (s.length === 1 ? s : s.filter((c) => c !== id)) : CHANNELS.map((c) => c.id).filter((c) => c === id || s.includes(c))));
  }

  function exportCsv() {
    const rows = [
      ["date", ...CHANNELS.map((c) => `${c.id}_views`), ...CHANNELS.map((c) => `${c.id}_followers`), "youtube_watch_minutes"],
      ...days.map((d) => [d.date, ...CHANNELS.map((c) => d.views[c.id]), ...CHANNELS.map((c) => d.followers[c.id]), d.watchMinutes]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crevo-analytics-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${days.length} days to CSV`);
  }

  const best = [...topContent].filter((t) => shown.includes(t.channel)).sort((a, b) => b.views - a.views);

  return (
    <>
      <TopBar>
        <button type="button" className={base.btnLine} onClick={exportCsv}>↓ Export CSV</button>
      </TopBar>

      <PageHead
        eyebrow="analytics"
        title="Analytics"
        lead={`Last ${range} days across ${shown.map((c) => CHANNEL[c].label).join(", ").replace(/, ([^,]*)$/, " and $1")}. Shorts under 30 seconds are your best format.`}
        badge="updated today 9:02"
      />
      <ReconnectBanner accounts={["youtube"]} />

      <div className={styles.filters}>
        <div className={styles.segment} role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={range === r} className={cx(styles.segBtn, range === r && styles.segOn)} onClick={() => pickRange(r)}>
              {r} days
            </button>
          ))}
        </div>
        <div className={styles.channels} aria-label="Channels">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cx(styles.channel, !shown.includes(c.id) && styles.channelOff)}
              style={{ "--c": c.color } as CSSProperties}
              aria-pressed={shown.includes(c.id)}
              onClick={() => toggleChannel(c.id)}
            >
              <span className={styles.swatch} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <section className={styles.kpis} aria-label="Totals">
        <div className={styles.kpi}>
          <span>Views</span>
          <strong>{compact(views)}</strong>
          <Delta now={views} before={sum(before, "views", shown)} />
        </div>
        <div className={styles.kpi}>
          <span>Followers gained</span>
          <strong>+{full(followers)}</strong>
          <Delta now={followers} before={sum(before, "followers", shown)} />
        </div>
        <div className={styles.kpi}>
          <span>YouTube watch time</span>
          <strong>{full(watchHours)} h</strong>
          <Delta now={watchHours} before={watchBefore} />
        </div>
        <div className={styles.kpi}>
          <span>Brand income · {MONTH_LONG.format(new Date(`${data.revenue[data.revenue.length - 1].month}-01T00:00:00Z`))}</span>
          <strong>{money(oct.paid)}</strong>
          {oct.owed > 0 ? (
            <span className={styles.delta}>
              <span style={{ color: CRITICAL }} aria-hidden="true">●</span>
              {money(oct.owed)} still owed{owedBy.length ? ` (${owedBy.join(", ")})` : ""}
            </span>
          ) : (
            <span className={styles.delta}>Nothing owed</span>
          )}
        </div>
      </section>

      <div className={styles.grid}>
        <Card
          wide
          title="Views by channel"
          sub={`Daily views, last ${range} days`}
          table={
            <table className={styles.table}>
              <thead><tr><th>Date</th>{shown.map((c) => <th key={c}>{CHANNEL[c].label}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.date}>
                    <td>{dayLabel(d.date)}</td>
                    {shown.map((c) => <td key={c}>{full(d.views[c])}</td>)}
                    <td>{full(shown.reduce((s, c) => s + d.views[c], 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <LineChart days={days} channels={shown} />
        </Card>

        <Card
          title="Best formats"
          sub="Average views per post, last 90 days"
          table={
            <table className={styles.table}>
              <thead><tr><th>Format</th><th>Avg views</th><th>Posts</th></tr></thead>
              <tbody>{formats.map((f) => <tr key={f.label}><td>{f.label}</td><td>{full(f.avgViews)}</td><td>{f.videos}</td></tr>)}</tbody>
            </table>
          }
        >
          <FormatBars />
        </Card>

        <Card
          title="Best times to post"
          sub="Engagement per post · 100 = your typical post"
          table={
            <table className={styles.table}>
              <thead><tr><th>Day</th>{HEAT_SLOTS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>{HEAT_DAYS.map((d, i) => <tr key={d}><td>{d}</td>{heat[i].map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
            </table>
          }
        >
          <Heatmap />
        </Card>

        <Card
          title="Brand income"
          sub="Paid and invoiced, by month"
          table={
            <table className={styles.table}>
              <thead><tr><th>Month</th><th>Paid</th><th>Invoiced, not paid</th></tr></thead>
              <tbody>{revenue.map((r) => <tr key={r.month}><td>{r.month}</td><td>{money(r.paid)}</td><td>{r.owed ? money(r.owed) : "—"}</td></tr>)}</tbody>
            </table>
          }
        >
          <RevenueBars revenue={revenue} />
        </Card>

        <Card title="Top posts" sub="Most viewed, last 90 days">
          <ul className={styles.top}>
            {best.slice(0, 5).map((t, i) => (
              <li key={t.id}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.topText}>
                  <strong>{t.title}</strong>
                  <small>
                    <span className={styles.dot} style={{ background: CHANNEL[t.channel].color }} />
                    {CHANNEL[t.channel].label}{t.format !== CHANNEL[t.channel].label ? ` ${t.format}` : ""} · {t.posted}
                  </small>
                </span>
                <span className={styles.topNums}>
                  <strong>{compact(t.views)}</strong>
                  <small>{t.engagement}% engaged</small>
                </span>
                <button
                  type="button"
                  className={base.mini}
                  onClick={() => {
                    addIdea({
                      title: `Follow-up to “${t.title}”`,
                      why: `The original got ${compact(t.views)} views and ${t.engagement}% engagement`,
                      platforms: [t.channel === "youtube" ? (t.format === "Short" ? "shorts" : "youtube") : t.channel === "instagram" ? "reels" : "tiktok"],
                    });
                    notify(`Added “${t.title}” follow-up to your ideas`);
                  }}
                >
                  Make another
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function LineChart({ days, channels }: { days: DayStat[]; channels: Channel[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const height = 260;
  const m = { top: 12, right: 78, bottom: 28, left: 44 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const ticks = niceTicks(Math.max(...days.flatMap((d) => channels.map((c) => d.views[c]))));
  const yMax = ticks[ticks.length - 1];
  const x = (i: number) => m.left + (days.length === 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;
  // About one date label per 70px, so they never collide.
  const labelEvery = Math.ceil(days.length / Math.max(2, Math.min(6, Math.floor(innerW / 70))));

  // Direct labels at the line ends, nudged apart so they never overlap.
  const ends = channels
    .map((c) => ({ c, y: y(days[days.length - 1].views[c]) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ c: Channel; y: number }[]>((acc, e) => {
      const prev = acc[acc.length - 1];
      acc.push({ c: e.c, y: prev && e.y - prev.y < 14 ? prev.y + 14 : e.y });
      return acc;
    }, []);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - m.left) / innerW) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const hd = hover !== null ? days[hover] : null;

  return (
    <div ref={ref} className={styles.chart}>
      <div className={styles.legend}>
        {channels.map((c) => (
          <span key={c}><i style={{ background: CHANNEL[c].color }} />{CHANNEL[c].label}</span>
        ))}
      </div>
      <svg width={width} height={height} role="img" aria-label={`Daily views by channel over the last ${days.length} days`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d6d6d6" : "#f0f0f0"} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={styles.axis}>{compact(t)}</text>
          </g>
        ))}
        {days.map((d, i) =>
          (i % labelEvery === 0 && days.length - 1 - i >= labelEvery * 0.6) || i === days.length - 1 ? (
            <text key={d.date} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className={styles.axis}>
              {dayLabel(d.date, false).slice(4)}
            </text>
          ) : null,
        )}
        {channels.map((c) => (
          <path
            key={c}
            d={days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.views[c]).toFixed(1)}`).join("")}
            fill="none"
            stroke={CHANNEL[c].color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {days.length <= 10 &&
          channels.map((c) => days.map((d, i) => <circle key={`${c}${i}`} cx={x(i)} cy={y(d.views[c])} r={4} fill={CHANNEL[c].color} stroke="#fff" strokeWidth={2} />))}
        {ends.map((e) => (
          <text key={e.c} x={m.left + innerW + 8} y={e.y} dy="0.32em" className={styles.endLabel}>
            {CHANNEL[e.c].label}
          </text>
        ))}
        {hd && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={m.top} y2={m.top + innerH} stroke="#181818" strokeOpacity={0.25} />
            {channels.map((c) => <circle key={c} cx={x(hover!)} cy={y(hd.views[c])} r={4.5} fill={CHANNEL[c].color} stroke="#fff" strokeWidth={2} />)}
          </g>
        )}
        <rect x={m.left} y={m.top} width={innerW} height={innerH} fill="transparent" />
      </svg>
      {hd && (
        <div className={styles.tip} style={{ left: Math.min(Math.max(x(hover!), 90), width - 90), top: 36 }}>
          <strong>{dayLabel(hd.date)}</strong>
          {channels.map((c) => (
            <span key={c}><i style={{ background: CHANNEL[c].color }} />{CHANNEL[c].label}<b>{full(hd.views[c])}</b></span>
          ))}
          {channels.length > 1 && <span className={styles.tipTotal}>Total<b>{full(channels.reduce((s, c) => s + hd.views[c], 0))}</b></span>}
        </div>
      )}
    </div>
  );
}

function FormatBars() {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceTicks(formats[0].avgViews, 4).at(-1)!;
  return (
    <div className={styles.bars} style={{ "--avg": AVERAGE_VIEWS / max } as CSSProperties}>
      <span className={styles.avgLine} aria-hidden="true" />
      {formats.map((f, i) => (
        <div key={f.label} className={styles.barRow} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className={styles.barLabel}>{f.label}</span>
          <span className={styles.barTrack}>
            <i style={{ width: `${(f.avgViews / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </span>
          <span className={styles.barValue}>{compact(f.avgViews)}</span>
          {hover === i && (
            <span className={styles.barTip}>
              {full(f.avgViews)} avg views · {f.videos} posts · {(f.avgViews / AVERAGE_VIEWS).toFixed(1)}x your average
            </span>
          )}
        </div>
      ))}
      <p className={styles.footnote}><span className={styles.avgKey} aria-hidden="true" /> Your average: {compact(AVERAGE_VIEWS)} views per post</p>
    </div>
  );
}

function Heatmap() {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const values = heat.flat();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const top3 = [...values].sort((a, b) => b - a).slice(0, 3);
  const step = (v: number) => BLUE_RAMP[Math.round(((v - min) / (max - min)) * (BLUE_RAMP.length - 1))];
  return (
    <div className={styles.heat}>
      <div className={styles.heatGrid} style={{ gridTemplateColumns: `40px repeat(${HEAT_SLOTS.length}, minmax(0, 1fr))` }}>
        <span />
        {HEAT_SLOTS.map((s) => <span key={s} className={styles.heatHead}>{s}</span>)}
        {HEAT_DAYS.map((d, i) => (
          <div key={d} style={{ display: "contents" }}>
            <span className={styles.heatDay}>{d}</span>
            {heat[i].map((v, j) => {
              const dark = (v - min) / (max - min) > 0.55;
              return (
                <span
                  key={j}
                  className={cx(styles.cell, hover?.[0] === i && hover?.[1] === j && styles.cellOn)}
                  style={{ background: step(v), color: dark ? "#fff" : "#181818" }}
                  onMouseEnter={() => setHover([i, j])}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${d} ${HEAT_SLOTS[j]}: ${v}`}
                >
                  {top3.includes(v) ? v : ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className={styles.heatFoot}>
        <span className={styles.heatInfo}>
          {hover ? (
            <><strong>{HEAT_DAYS[hover[0]]} {HEAT_SLOTS[hover[1]]}</strong> · {heat[hover[0]][hover[1]]} ({heat[hover[0]][hover[1]] >= 100 ? "+" : "−"}{Math.abs(heat[hover[0]][hover[1]] - 100)}% vs typical)</>
          ) : (
            <>Peak: <strong>Wed 6–9 pm</strong>, then Thu lunch and Fri evening</>
          )}
        </span>
        <span className={styles.ramp} aria-hidden="true">
          <small>{min}</small>
          <i style={{ background: `linear-gradient(90deg, ${BLUE_RAMP[0]}, ${BLUE_RAMP[6]}, ${BLUE_RAMP[12]})` }} />
          <small>{max}</small>
        </span>
      </div>
    </div>
  );
}

function RevenueBars({ revenue }: { revenue: Revenue }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const m = { top: 10, right: 8, bottom: 26, left: 44 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const ticks = niceTicks(Math.max(...revenue.map((r) => r.paid + r.owed)));
  const yMax = ticks[ticks.length - 1];
  const band = innerW / revenue.length;
  const barW = Math.min(40, band * 0.55);
  const h = (v: number) => (v / yMax) * innerH;
  const PAID = CHANNELS[0].color;
  const OWED = CHANNELS[1].color;
  return (
    <div ref={ref} className={styles.chart}>
      <div className={styles.legend}>
        <span><i style={{ background: PAID }} />Paid</span>
        <span><i style={{ background: OWED }} />Invoiced, not paid</span>
      </div>
      <svg width={width} height={height} role="img" aria-label="Brand income by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + innerW} y1={m.top + innerH - h(t)} y2={m.top + innerH - h(t)} stroke={t === 0 ? "#d6d6d6" : "#f0f0f0"} />
            <text x={m.left - 8} y={m.top + innerH - h(t)} dy="0.32em" textAnchor="end" className={styles.axis}>{t ? `$${compact(t)}` : "0"}</text>
          </g>
        ))}
        {revenue.map((r, i) => {
          const cx0 = m.left + band * i + band / 2;
          const paidH = h(r.paid);
          const owedH = h(r.owed);
          const baseY = m.top + innerH;
          return (
            <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.5}>
              <rect x={cx0 - band / 2} y={m.top} width={band} height={innerH} fill="transparent" />
              {/* Rounded top only, anchored square on the baseline. */}
              <path d={roundedTop(cx0 - barW / 2, baseY - paidH, barW, paidH, r.owed ? 0 : 4)} fill={PAID} />
              {r.owed > 0 && <path d={roundedTop(cx0 - barW / 2, baseY - paidH - owedH, barW, owedH - 2, 4)} fill={OWED} />}
              <text x={cx0} y={height - 8} textAnchor="middle" className={styles.axis}>{r.month}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className={styles.tip} style={{ left: Math.min(Math.max(m.left + band * hover + band / 2, 80), width - 80), top: 30 }}>
          <strong>{revenue[hover].month} 2026</strong>
          <span><i style={{ background: PAID }} />Paid<b>{money(revenue[hover].paid)}</b></span>
          {revenue[hover].owed > 0 && <span><i style={{ background: OWED }} />Owed<b>{money(revenue[hover].owed)}</b></span>}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
