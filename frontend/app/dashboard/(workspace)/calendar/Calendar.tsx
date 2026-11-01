"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import base from "../../dashboard.module.css";
import styles from "./calendar.module.css";
import { PageHead, TopBar, useShell } from "../../_shell/AppShell";
import { AppLayer, EmptyState, ReconnectBanner } from "../../_shell/states";
import { cx } from "../../_shell/ui";
import {
  TODAY_ISO,
  addDays,
  clock,
  dayLabel,
  eventTypes,
  monthLabel,
  nowMinutes,
  parseIso,
  postSlots,
  suggestedSlot,
  weekStart,
  type CalEvent,
  type EventType,
} from "../../data";

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_PX = 44;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TYPE = Object.fromEntries(eventTypes.map((t) => [t.type, t])) as Record<EventType, (typeof eventTypes)[number]>;

type View = "week" | "month";

interface Draft {
  title: string;
  type: EventType;
  date: string;
  start: number;
  length: number;
}

function timeRange(e: CalEvent) {
  if (e.start === undefined) return "All day";
  return e.end && e.end !== e.start ? `${clock(e.start)} – ${clock(e.end)}` : clock(e.start);
}

function dayNumber(iso: string) {
  return parseIso(iso).getUTCDate();
}

// Side-by-side lanes for events that overlap on the same day.
function layoutDay(events: CalEvent[]) {
  const timed = events.filter((e) => e.start !== undefined).sort((a, b) => a.start! - b.start!);
  const lanes: number[] = [];
  const placed = timed.map((e) => {
    const end = Math.max(e.end ?? e.start! + 30, e.start! + 30);
    let lane = lanes.findIndex((laneEnd) => laneEnd <= e.start!);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = end;
    return { event: e, lane, end };
  });
  return placed.map((p) => ({
    ...p,
    lanes: Math.max(1, ...placed.filter((o) => o.event.start! < p.end && o.end > p.event.start!).map((o) => o.lane + 1)),
  }));
}

export default function Calendar({ initialDate, initialView }: { initialDate?: string; initialView: View }) {
  const router = useRouter();
  const shell = useShell();
  const { notify, scheduledClips, dealsInCalendar, addDealToCalendar, events, addEvent, removeEvent, confirmEvent, video } = shell;
  const allDeals = shell.allDeals.filter((d) => d.stage !== "Paid");
  const clips = video?.clips.filter((c) => !c.skipped) ?? [];
  const [anchor, setAnchor] = useState(initialDate ?? TODAY_ISO);
  const [view, setView] = useState<View>(initialView);
  const [hidden, setHidden] = useState<Set<EventType>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Everything on the calendar: Google Calendar events, deal deadlines the
  // creator added from Deals, and posts from Publish.
  const dealEvents: CalEvent[] = allDeals
    .filter((d) => dealsInCalendar.has(d.slug))
    .flatMap((d) =>
      d.deliverables.map((item) => ({
        id: `dl-${item.id}`,
        title: `${d.brand}: ${item.title}`,
        type: "deadline" as const,
        date: item.dueDate,
        detail: `${d.campaign} · ${d.value}`,
        link: { href: `/dashboard/deals?deal=${d.slug}`, label: "Open deal" },
        done: item.done,
      })),
    );
  const postEvents: CalEvent[] = clips.flatMap((c) => {
    const i = video!.clips.indexOf(c);
    const scheduled = scheduledClips.has(c.id);
    if (!scheduled && i > 0) return [];
    return postSlots(i).map((slot) => ({
      id: `post-${c.id}-${slot.platform}`,
      title: `${c.short} · ${slot.label}`,
      type: "post" as const,
      date: slot.date,
      start: slot.minutes,
      end: slot.minutes + 30,
      detail: scheduled ? `Clip ${i + 1} · ${slot.why}` : `Clip ${i + 1} · waiting for your approval in Publish`,
      link: { href: `/dashboard/publish?clip=${c.id}`, label: scheduled ? "Open in Publish" : "Review and approve" },
      tentative: !scheduled,
    }));
  });
  const all = [...events, ...dealEvents, ...postEvents];
  const slot = suggestedSlot();
  const now = nowMinutes();
  const visible = all.filter((e) => !hidden.has(e.type));
  const onDay = (iso: string) => visible.filter((e) => e.date === iso);
  const selected = all.find((e) => e.id === selectedId) ?? null;

  const monday = weekStart(anchor);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inWeek = all.filter((e) => week.includes(e.date));
  const count = (type: EventType) => inWeek.filter((e) => e.type === type && !e.done).length;
  const slotBooked = events.some((e) => e.title === slot.title && e.date === slot.date);
  const showSlot = view === "week" && week.includes(slot.date) && !slotBooked && !hidden.has("film");

  // Month grid: Monday-start weeks covering the anchor's month.
  const first = `${anchor.slice(0, 7)}-01`;
  const gridStart = weekStart(first);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeksNeeded = Math.ceil(monthDays.findIndex((d, i) => i > 27 && d.slice(0, 7) !== anchor.slice(0, 7)) / 7) || 6;
  const monthCells = monthDays.slice(0, weeksNeeded * 7);

  const missingDeals = allDeals.filter((d) => !dealsInCalendar.has(d.slug) && d.deliverables.some((item) => !item.done));
  const waitingClips = clips.filter((c) => !scheduledClips.has(c.id));

  function go(nextAnchor: string, nextView: View = view) {
    setAnchor(nextAnchor);
    setView(nextView);
    const params = new URLSearchParams({ date: nextAnchor });
    if (nextView === "month") params.set("view", "month");
    router.replace(`/dashboard/calendar?${params}`, { scroll: false });
  }

  function step(direction: -1 | 1) {
    if (view === "week") return go(addDays(anchor, direction * 7));
    const d = parseIso(first);
    d.setUTCMonth(d.getUTCMonth() + direction);
    go(d.toISOString().slice(0, 10));
  }

  function toggleType(type: EventType) {
    setHidden((s) => {
      const next = new Set(s);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function bookSlot() {
    const booked = await addEvent({
      title: slot.title,
      type: "film",
      date: slot.date,
      start: slot.start,
      end: slot.end,
      detail: slot.why,
    });
    if (!booked) return;
    setSelectedId(booked.id);
    notify(`Booked ${dayLabel(slot.date)}, ${clock(slot.start)} – ${clock(slot.end)}`);
  }

  async function saveDraft() {
    if (!draft || !draft.title.trim()) return;
    const allDay = draft.type === "deadline";
    const saved = await addEvent({
      title: draft.title.trim(),
      type: draft.type,
      date: draft.date,
      start: allDay ? undefined : draft.start,
      end: allDay ? undefined : draft.start + draft.length,
      detail: "Added in Crevo",
    });
    if (!saved) return;
    setDraft(null);
    setSelectedId(saved.id);
    go(draft.date, "week");
    notify("Event added to your calendar");
  }

  const rangeLabel =
    view === "week"
      ? `${dayLabel(week[0], false).slice(4)} – ${dayLabel(week[6], false).slice(4)} ${week[6].slice(0, 4)}`
      : monthLabel(first);
  const thisWeek = monday === weekStart(TODAY_ISO);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    count("deadline") && plural(count("deadline"), "deadline", "deadlines"),
    count("post") && plural(count("post"), "post", "posts"),
    count("film") && plural(count("film"), "filming block", "filming blocks"),
    count("call") && plural(count("call"), "call", "calls"),
  ].filter(Boolean) as string[];
  const summary = parts.length === 0 ? "nothing booked yet" : parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

  return (
    <>
      <TopBar>
        <button type="button" className={base.btnDark} onClick={() => setDraft({ title: "", type: "film", date: week.includes(TODAY_ISO) ? TODAY_ISO : week[0], start: 14 * 60, length: 60 })}>
          ＋ New event
        </button>
      </TopBar>

      <PageHead
        eyebrow="calendar"
        title="Calendar"
        lead={`${thisWeek ? "This week" : `Week of ${dayLabel(monday, false)}`}: ${summary}.${
          thisWeek && count("deadline") === 0 ? " Add deal deadlines from the list on the right." : ""
        }`}
        badge={shell.settings.accounts.calendar === "disconnected" ? "Google Calendar not syncing" : "synced with Google Calendar"}
      />
      <ReconnectBanner accounts={["calendar"]} />

      <div className={styles.layout}>
        <section className={styles.card} aria-label="Calendar">
          <div className={styles.toolbar}>
            <div className={styles.nav}>
              <button type="button" className={base.mini} onClick={() => step(-1)} aria-label={view === "week" ? "Previous week" : "Previous month"}>‹</button>
              <button type="button" className={base.mini} onClick={() => step(1)} aria-label={view === "week" ? "Next week" : "Next month"}>›</button>
              <button type="button" className={base.mini} onClick={() => go(TODAY_ISO)} disabled={anchor === TODAY_ISO}>Today</button>
              <h2 className={styles.range}>{rangeLabel}</h2>
            </div>
            <div className={styles.views} role="tablist" aria-label="View">
              {(["week", "month"] as View[]).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={cx(styles.viewBtn, view === v && styles.viewOn)} onClick={() => go(anchor, v)}>
                  {v === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filters} aria-label="Show">
            {eventTypes.map((t) => (
              <button
                key={t.type}
                type="button"
                className={cx(styles.filter, hidden.has(t.type) && styles.filterOff)}
                style={{ "--c": t.color } as CSSProperties}
                aria-pressed={!hidden.has(t.type)}
                onClick={() => toggleType(t.type)}
              >
                <span className={styles.filterDot} />
                {t.label}
              </button>
            ))}
          </div>

          {view === "week" ? (
            <div className={cx(styles.scroller, styles.weekWrap)}>
              {!week.some((iso) => onDay(iso).length > 0) && !showSlot && (
                <div className={styles.weekEmpty}>
                  <EmptyState
                    title={hidden.size ? "Nothing to show with these filters" : "Nothing booked this week"}
                    color="#2a6df4"
                    pattern="1010010110100101"
                    action={
                      hidden.size ? (
                        <button type="button" className={base.mini} onClick={() => setHidden(new Set())}>Show everything</button>
                      ) : (
                        <button type="button" className={base.miniDark} onClick={() => setDraft({ title: "", type: "film", date: week[0], start: 14 * 60, length: 60 })}>＋ New event</button>
                      )
                    }
                  >
                    {hidden.size ? "Some event types are hidden." : "Add a filming block, or add deal deadlines from the list on the right."}
                  </EmptyState>
                </div>
              )}
              <div className={styles.week}>
                <div className={styles.corner} />
                {week.map((iso, i) => (
                  <div key={iso} className={cx(styles.dayHead, iso === TODAY_ISO && styles.today)}>
                    <span>{WEEKDAYS[i]}</span>
                    <strong>{dayNumber(iso)}</strong>
                  </div>
                ))}

                <div className={styles.allDayLabel}>all-day</div>
                {week.map((iso) => (
                  <div key={iso} className={styles.allDay}>
                    {onDay(iso)
                      .filter((e) => e.start === undefined)
                      .map((e) => (
                        <EventChip key={e.id} event={e} selected={selectedId === e.id} onSelect={setSelectedId} />
                      ))}
                  </div>
                ))}

                <div className={styles.hours} aria-hidden="true">
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <span key={i} style={{ height: HOUR_PX }}>{clock((START_HOUR + i) * 60).replace(":00", "")}</span>
                  ))}
                </div>
                {week.map((iso) => (
                  <div key={iso} className={cx(styles.dayCol, iso === TODAY_ISO && styles.todayCol)} style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
                    {layoutDay(onDay(iso)).map(({ event: e, lane, lanes, end }) => {
                      const top = ((Math.max(e.start!, START_HOUR * 60) - START_HOUR * 60) / 60) * HOUR_PX;
                      const height = Math.max(22, ((Math.min(end, END_HOUR * 60) - Math.max(e.start!, START_HOUR * 60)) / 60) * HOUR_PX - 2);
                      return (
                        <EventBlock
                          key={e.id}
                          event={e}
                          selected={selectedId === e.id}
                          onSelect={setSelectedId}
                          style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                        />
                      );
                    })}
                    {showSlot && iso === slot.date && (
                      <button
                        type="button"
                        className={styles.ghost}
                        style={{
                          top: ((slot.start - START_HOUR * 60) / 60) * HOUR_PX,
                          height: ((slot.end - slot.start) / 60) * HOUR_PX - 2,
                        }}
                        onClick={bookSlot}
                      >
                        <strong>＋ Book filming</strong>
                        <small>Suggested free slot</small>
                      </button>
                    )}
                    {iso === TODAY_ISO && (
                      <span className={styles.now} style={{ top: ((now - START_HOUR * 60) / 60) * HOUR_PX }} aria-label={`Now, ${clock(now)}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.scroller}>
              <div className={styles.month}>
                {WEEKDAYS.map((d) => <div key={d} className={styles.monthHead}>{d}</div>)}
                {monthCells.map((iso) => {
                  const events = onDay(iso).sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
                  return (
                    <div key={iso} className={cx(styles.cell, iso.slice(0, 7) !== first.slice(0, 7) && styles.cellOut, iso === TODAY_ISO && styles.cellToday)}>
                      <button type="button" className={styles.cellDate} onClick={() => go(iso, "week")} aria-label={`Open the week of ${dayLabel(iso, false)}`}>
                        {dayNumber(iso)}
                      </button>
                      {events.slice(0, 3).map((e) => (
                        <EventChip key={e.id} event={e} selected={selectedId === e.id} onSelect={setSelectedId} compact />
                      ))}
                      {events.length > 3 && (
                        <button type="button" className={styles.more} onClick={() => go(iso, "week")}>+{events.length - 3} more</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className={styles.side}>
          {selected ? (
            <section className={styles.panel} aria-labelledby="event-title">
              <div className={styles.panelTop}>
                <span className={styles.typeTag} style={{ background: TYPE[selected.type].bg, color: TYPE[selected.type].ink }}>
                  {TYPE[selected.type].label.replace(/s$/, "")}
                </span>
                {selected.tentative && <span className={base.tag}>tentative</span>}
                {selected.done && <span className={base.tag}>done</span>}
                <button type="button" className={styles.closeBtn} onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
              </div>
              <h3 id="event-title" className={styles.eventTitle}>{selected.title}</h3>
              <p className={styles.when}>
                {dayLabel(selected.date)} · {timeRange(selected)}
              </p>
              {selected.detail && <p className={styles.detail}>{selected.detail}</p>}
              <div className={styles.panelActions}>
                {selected.link && <Link className={base.miniDark} href={selected.link.href}>{selected.link.label} →</Link>}
                {selected.tentative && selected.stored && (
                  <button type="button" className={base.mini} onClick={() => { confirmEvent(selected.id); notify("Marked as confirmed"); }}>
                    Confirm
                  </button>
                )}
                {selected.stored && (
                  <button type="button" className={base.mini} onClick={() => { removeEvent(selected.id); setSelectedId(null); notify("Removed from your calendar"); }}>
                    Remove
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className={styles.panel}>
              <h3 className={styles.sideTitle}>Up next</h3>
              <ul className={styles.agenda}>
                {all
                  .filter((e) => e.date > TODAY_ISO || (e.date === TODAY_ISO && (e.start ?? 24 * 60) >= now))
                  .filter((e) => !e.done)
                  .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? -1) - (b.start ?? -1))
                  .slice(0, 5)
                  .map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => { setSelectedId(e.id); if (!week.includes(e.date)) go(e.date); }}>
                        <span className={styles.agendaDot} style={{ background: TYPE[e.type].color }} />
                        <span className={styles.agendaText}>
                          <strong>{e.title}</strong>
                          <small>{dayLabel(e.date)} · {timeRange(e)}</small>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {(missingDeals.length > 0 || waitingClips.length > 0) && (
            <section className={styles.panel}>
              <h3 className={styles.sideTitle}>Not in your calendar yet</h3>
              <ul className={styles.missing}>
                {missingDeals.map((d) => (
                  <li key={d.slug}>
                    <span className={styles.brandMark} style={{ background: d.color }}>{d.initial}</span>
                    <span className={styles.agendaText}>
                      <strong>{d.brand} deadlines</strong>
                      <small>{d.deliverables.filter((item) => !item.done).length} left · next {d.deliverables.find((item) => !item.done)!.date}</small>
                    </span>
                    <button
                      type="button"
                      className={base.mini}
                      onClick={() => {
                        addDealToCalendar(d.slug);
                        notify(`${d.brand} deadlines added`);
                      }}
                    >
                      Add
                    </button>
                  </li>
                ))}
                {waitingClips.map((c) => (
                  <li key={c.id}>
                    <span className={styles.brandMark} style={{ background: c.color }}>{video!.clips.indexOf(c) + 1}</span>
                    <span className={styles.agendaText}>
                      <strong>{c.short} clip · 3 posts</strong>
                      <small>Waiting for your approval</small>
                    </span>
                    <Link className={base.mini} href={`/dashboard/publish?clip=${c.id}`}>Review</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!slotBooked && (
            <section className={cx(styles.panel, styles.suggest)}>
              <div className={styles.suggestLabel}>✦ Suggested filming slot</div>
              <strong>{dayLabel(slot.date)}, {clock(slot.start)} – {clock(slot.end)}</strong>
              <p>{slot.why}</p>
              <button type="button" className={base.miniDark} onClick={() => { bookSlot(); if (!week.includes(slot.date)) go(slot.date, "week"); }}>
                Book this slot
              </button>
            </section>
          )}
        </aside>
      </div>

      {draft && (
        <AppLayer>
          <div className={base.overlay} onClick={() => setDraft(null)}>
            <form
              className={base.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-event-title"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => { e.preventDefault(); saveDraft(); }}
            >
              <div className={base.eyebrow}><span>[</span>new event<span>]</span></div>
              <h3 id="new-event-title" className={base.modalTitle}>Add to your calendar</h3>
              <label className={styles.formRow}>
                <span>Title</span>
                <input autoFocus required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Film: gear haul" />
              </label>
              <div className={styles.formGrid}>
                <label className={styles.formRow}>
                  <span>Type</span>
                  <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as EventType })}>
                    {eventTypes.map((t) => <option key={t.type} value={t.type}>{t.label.replace(/s$/, "")}</option>)}
                  </select>
                </label>
                <label className={styles.formRow}>
                  <span>Date</span>
                  <input type="date" required value={draft.date} onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })} />
                </label>
                {draft.type !== "deadline" && (
                  <>
                    <label className={styles.formRow}>
                      <span>Starts</span>
                      <select value={draft.start} onChange={(e) => setDraft({ ...draft, start: Number(e.target.value) })}>
                        {Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, i) => START_HOUR * 60 + i * 30).map((m) => (
                          <option key={m} value={m}>{clock(m)}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formRow}>
                      <span>Length</span>
                      <select value={draft.length} onChange={(e) => setDraft({ ...draft, length: Number(e.target.value) })}>
                        {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                      </select>
                    </label>
                  </>
                )}
              </div>
              <p className={base.modalNote}>{draft.type === "deadline" ? "Deadlines are all-day events." : "Saved to Google Calendar once your account is live."}</p>
              <div className={base.modalActions}>
                <button type="button" className={base.btnGhost} onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className={base.btnDark} disabled={!draft.title.trim()}>Add event</button>
              </div>
            </form>
          </div>
        </AppLayer>
      )}
    </>
  );
}

function EventBlock({ event: e, selected, onSelect, style }: { event: CalEvent; selected: boolean; onSelect: (id: string) => void; style: CSSProperties }) {
  const t = TYPE[e.type];
  return (
    <button
      type="button"
      className={cx(styles.event, (e.end ?? 0) - (e.start ?? 0) <= 30 && styles.short, e.tentative && styles.tentative, e.done && styles.done, selected && styles.selected)}
      style={{ ...style, background: t.bg, color: t.ink, borderColor: t.color }}
      onClick={() => onSelect(e.id)}
      aria-pressed={selected}
    >
      <strong>{e.title}</strong>
      <small>{timeRange(e)}</small>
    </button>
  );
}

function EventChip({ event: e, selected, onSelect, compact }: { event: CalEvent; selected: boolean; onSelect: (id: string) => void; compact?: boolean }) {
  const t = TYPE[e.type];
  return (
    <button
      type="button"
      className={cx(styles.chip, e.tentative && styles.tentative, e.done && styles.done, selected && styles.selected)}
      style={{ background: t.bg, color: t.ink, borderColor: t.color }}
      onClick={() => onSelect(e.id)}
      aria-pressed={selected}
      title={`${e.title} · ${timeRange(e)}`}
    >
      {compact && e.start !== undefined && <span className={styles.chipTime}>{clock(e.start).replace(" ", "")}</span>}
      {e.title}
    </button>
  );
}
