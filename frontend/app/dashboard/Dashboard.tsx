"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./dashboard.module.css";
import { PageHead, TopBar, useShell } from "./_shell/AppShell";
import { withSignOff } from "./_shell/settings";
import { EmptyState, ReconnectBanner } from "./_shell/states";
import { BLUE, CATEGORY_STYLE, GREEN, PATTERNS, PURPLE, Pixels, YELLOW, healthColor, hours } from "./_shell/ui";
import { TODAY_ISO, addDays, clock, dayLabel, dealScore, parseIso, postSlots, publishPlatforms, weekStart, type Category, type Idea } from "./data";
import { money } from "./_shell/model";

const CATEGORIES: Category[] = ["Brand deal", "Collab", "Fan question", "Spam"];
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });

export default function Dashboard() {
  const { notify, openDraft, approved, minutesSaved, settings, threads, todos: todoList, toggleTodo, ideas, addIdeaToToday, allDeals, video, scheduledClips } = useShell();
  const [filter, setFilter] = useState<Category | "All">("All");

  const doneCount = todoList.filter((t) => t.done).length;
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, threads.filter((t) => t.category === c).length])) as Record<Category, number>;
  // Replies ready to approve: drafted messages that don't belong to an
  // overdue invoice (those show as a payment reminder under Brand deals).
  const deals = allDeals.filter((d) => d.stage !== "Paid" && d.alert);
  const overdueDeal = deals.find((d) => d.overdue);
  const inbox = threads.filter((t) => t.drafts && t.draftReady && t.category !== "Spam" && t.id !== overdueDeal?.replyId).slice(0, 3);
  const pendingDrafts = inbox.filter((m) => !approved.has(m.id)).length + (overdueDeal?.replyId && !approved.has(overdueDeal.replyId) ? 1 : 0);
  const visibleInbox = useMemo(() => (filter === "All" ? inbox : inbox.filter((m) => m.category === filter)), [filter, inbox]);
  const expected = allDeals.filter((d) => d.stage !== "Paid").reduce((sum, d) => sum + d.amount, 0);

  // Up next: each clip's posts, scheduled or waiting for approval in Publish.
  const clips = video?.clips.filter((c) => !c.skipped) ?? [];
  const thisWeek = weekStart(TODAY_ISO);
  const posts = clips.flatMap((c) => {
    const n = video!.clips.indexOf(c);
    const scheduled = scheduledClips.has(c.id);
    if (!scheduled && n > 0) return [];
    return postSlots(n).map((slot) => ({
      id: `${c.id}-${slot.platform}`,
      title: c.short,
      platform: publishPlatforms.find((p) => p.id === slot.platform)!.label,
      status: scheduled ? "Scheduled · caption and hashtags ready" : "Waiting for your approval",
      date: slot.date,
      when: `${dayLabel(slot.date)} ${clock(slot.minutes)}`,
    }));
  }).filter((p) => p.date >= TODAY_ISO).slice(0, 3);
  const postsThisWeek = clips.filter((c) => scheduledClips.has(c.id)).flatMap((c) => postSlots(video!.clips.indexOf(c))).filter((s) => s.date >= thisWeek && s.date < addDays(thisWeek, 7)).length;

  const dueSoon = allDeals.flatMap((d) => d.deliverables.filter((item) => !item.done && item.dueDate >= TODAY_ISO).map((item) => ({ deal: d, item }))).sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate))[0];
  const summary = [
    deals.length ? `${deals.length} brand ${deals.length === 1 ? "deal needs" : "deals need"} you` : "no deals need you",
    `${pendingDrafts} ${pendingDrafts === 1 ? "reply is" : "replies are"} drafted`,
    dueSoon ? `${dueSoon.deal.brand}'s ${dueSoon.item.title.split(":")[0]} is due ${dueSoon.item.dueDate === TODAY_ISO ? "today" : WEEKDAY.format(parseIso(dueSoon.item.dueDate))}` : "",
  ].filter(Boolean);
  const lead = `${summary.length > 2 ? `${summary.slice(0, -1).join(", ")}, and ${summary.at(-1)}` : summary.join(" and ")}.`.replace(/^./, (c) => c.toUpperCase());

  function addIdea(idea: Idea) {
    if (idea.todoId) return;
    addIdeaToToday(idea);
    notify("Added to today's to-do");
  }

  return (
    <>
      <TopBar>
        <Link className={styles.btnLine} href="/dashboard/publish">＋ Upload video</Link>
      </TopBar>

      <PageHead
        eyebrow={`today · ${dayLabel(TODAY_ISO, false)}`}
        title={settings.name.trim() ? `Good morning, ${settings.name.trim().split(" ")[0]}` : "Good morning"}
        lead={lead}
        badge={`${hours(minutesSaved)} saved this week`}
      />
      <ReconnectBanner accounts={["gmail", "youtube"]} />

      <section className={styles.stats} aria-label="Today at a glance">
        <div className={styles.stat}>
          <div className={styles.statKey}><Pixels color={GREEN} pattern={PATTERNS.inbox} />Messages sorted</div>
          <div className={styles.statValue}>{threads.length}<small>since yesterday</small></div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statKey}><Pixels color={BLUE} pattern={PATTERNS.briefing} />Replies drafted</div>
          <div className={styles.statValue}>{pendingDrafts}<small>ready to approve</small></div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statKey}><Pixels color={PURPLE} pattern={PATTERNS.deals} />Deals need you</div>
          <div className={styles.statValue}>{deals.length}<small>{overdueDeal?.replyId && !approved.has(overdueDeal.replyId) ? "1 payment overdue" : overdueDeal ? "reminder drafted" : "none overdue"}</small></div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statKey}><Pixels color={YELLOW} pattern={PATTERNS.publish} />Posts scheduled</div>
          <div className={styles.statValue}>{postsThisWeek}<small>this week</small></div>
        </div>
      </section>

      <div className={styles.cols}>
        <section className={`${styles.card} ${styles.cardRaised}`} aria-labelledby="todo-title">
          <div className={styles.cardHead}>
            <span className={styles.icon}><Pixels color={BLUE} pattern={PATTERNS.briefing} /></span>
            <h2 id="todo-title">Today&apos;s to-do</h2>
            <span className={styles.tag}>{doneCount} of {todoList.length} done</span>
          </div>
          <ul className={styles.list}>
            {todoList.map((t) => (
              <li key={t.id} className={t.done ? `${styles.todo} ${styles.todoDone}` : styles.todo}>
                <button
                  type="button"
                  className={t.done ? `${styles.check} ${styles.checkOn}` : styles.check}
                  onClick={() => toggleTodo(t.id)}
                  aria-pressed={t.done}
                  aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.title}`}
                >
                  {t.done ? "✓" : ""}
                </button>
                <div className={styles.todoText}>
                  <strong>{t.title}</strong>
                  <small>{t.detail}</small>
                </div>
                <span className={styles.when}>{t.when}</span>
              </li>
            ))}
          </ul>
          {doneCount === todoList.length && (
            <EmptyState compact title="All done for today" color={BLUE} pattern={PATTERNS.briefing}>
              Nice work. Add an idea below, or plan tomorrow in Calendar.
            </EmptyState>
          )}
        </section>

        <section className={styles.card} id="inbox" aria-labelledby="inbox-title">
          <div className={styles.cardHead}>
            <span className={styles.icon}><Pixels color={GREEN} pattern={PATTERNS.inbox} /></span>
            <h2 id="inbox-title">Inbox, sorted for you</h2>
            <span className={styles.tag}>Gmail · YouTube · DMs</span>
          </div>
          <div className={styles.cats} role="tablist" aria-label="Filter messages">
            <button type="button" role="tab" aria-selected={filter === "All"} className={filter === "All" ? `${styles.cat} ${styles.catAll} ${styles.catOn}` : `${styles.cat} ${styles.catAll}`} onClick={() => setFilter("All")}>All</button>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={filter === c} className={filter === c ? `${styles.cat} ${CATEGORY_STYLE[c]} ${styles.catOn}` : `${styles.cat} ${CATEGORY_STYLE[c]}`} onClick={() => setFilter(c)}>
                {c === "Fan question" ? "Fans" : c} {categoryCounts[c]}
              </button>
            ))}
          </div>
          <ul className={styles.list}>
            {visibleInbox.map((m) => (
              <li key={m.id} className={styles.msg}>
                <span className={styles.who} style={{ background: m.color }}>{m.initial}</span>
                <div className={styles.msgBody}>
                  <div className={styles.msgTop}>
                    <strong>{m.from}</strong>
                    <span className={`${styles.tag} ${CATEGORY_STYLE[m.category]}`}>{m.category}</span>
                  </div>
                  <p>{m.subject}</p>
                  <div className={styles.actions}>
                    {approved.has(m.id) ? (
                      <span className={styles.savedTag}>✓ {m.delivery === "gmail_draft" ? "Saved to Gmail drafts" : "Approved"}</span>
                    ) : (
                      <button type="button" className={styles.miniDark} onClick={() => openDraft({ kind: "reply", id: m.id, title: "Reply draft", to: m.from, text: m.editedReply ?? withSignOff(m.drafts![m.tone ?? settings.tone].replace(/==/g, ""), settings.signOff), minutesSaved: m.minutesSaved })}>
                        Review draft
                      </button>
                    )}
                    <Link className={styles.mini} href={`/dashboard/inbox?m=${m.id}`}>Open</Link>
                  </div>
                </div>
              </li>
            ))}
            {visibleInbox.length === 0 && (
              <li className={styles.empty}>
                {filter === "Spam"
                  ? `${categoryCounts.Spam} spam ${categoryCounts.Spam === 1 ? "message was" : "messages were"} filtered out. Nothing needs you here.`
                  : `${categoryCounts[filter as Category]} in the full Inbox, none with a draft waiting.`}
              </li>
            )}
          </ul>
        </section>

        <section className={styles.card} aria-labelledby="ideas-title">
          <div className={styles.cardHead}>
            <span className={styles.icon}><Pixels color={YELLOW} pattern={PATTERNS.publish} /></span>
            <h2 id="ideas-title">Ideas for today</h2>
            <span className={styles.tag}>from your audience</span>
          </div>
          <div className={styles.ideas}>
            {ideas.length === 0 && <p className={styles.empty}>New ideas show up here as your audience asks for them.</p>}
            {ideas.map((idea) => (
              <div key={idea.id} className={styles.idea}>
                <strong>{idea.title}</strong>
                <small>{idea.why}</small>
                <div className={styles.ideaRow}>
                  {idea.platforms.map((p) => <span key={p} className={styles.tag}>{p}</span>)}
                  <button type="button" className={idea.todoId ? `${styles.mini} ${styles.miniDone}` : styles.mini} onClick={() => addIdea(idea)} disabled={Boolean(idea.todoId)}>
                    {idea.todoId ? "✓ Added" : "+ Add to today"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.rows}>
        <section className={styles.card} id="deals" aria-labelledby="deals-title">
          <div className={styles.cardHead}>
            <span className={styles.icon}><Pixels color={PURPLE} pattern={PATTERNS.deals} /></span>
            <h2 id="deals-title">Brand deals</h2>
            <span className={styles.tag}>{expected >= 1000 ? `$${(expected / 1000).toFixed(1).replace(/\.0$/, "")}k` : money(expected)} expected</span>
          </div>
          <ul className={styles.list}>
            {deals.length === 0 && <li className={styles.empty}>No deal needs you today.</li>}
            {deals.map((d) => {
              const reminderDone = Boolean(d.overdue && d.replyId && approved.has(d.replyId));
              return (
              <li key={d.id} className={styles.deal}>
                <div>
                  <strong>{d.brand} · {d.campaign}</strong>
                  <small className={d.overdue && !reminderDone ? styles.overdue : undefined}>
                    {d.overdue && !reminderDone ? `${d.overdue.amount} · ${d.overdue.days} days overdue` : `${d.value} · ${d.note.split(" · ").slice(1).join(" · ")}`}
                  </small>
                </div>
                <span className={styles.health} title="Deal Health">
                  {dealScore(d)}
                  <span className={styles.bar}><i style={{ width: `${dealScore(d)}%`, background: healthColor(dealScore(d)) }} /></span>
                </span>
                {d.overdue && d.replyId && !reminderDone ? (
                  <button type="button" className={styles.miniDark} onClick={() => openDraft({ kind: "reminder", id: d.replyId!, title: "Payment reminder", to: `${d.brand} · accounts`, text: d.overdue!.reminder, minutesSaved: 10 })}>
                    Send reminder
                  </button>
                ) : d.overdue ? (
                  <span className={styles.savedTag}>✓ Reminder drafted</span>
                ) : (
                  <Link className={styles.mini} href={`/dashboard/deals?deal=${d.slug}`}>Open</Link>
                )}
              </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.card} id="publish" aria-labelledby="publish-title">
          <div className={styles.cardHead}>
            <span className={styles.icon}><Pixels color={YELLOW} pattern={PATTERNS.publish} /></span>
            <h2 id="publish-title">Up next</h2>
            <Link className={styles.tag} href="/dashboard/calendar">Open calendar →</Link>
          </div>
          <ul className={styles.list}>
            {posts.length === 0 && <li className={styles.empty}>Nothing scheduled. Upload a video in Publish to cut clips.</li>}
            {posts.map((p) => (
              <li key={p.id} className={styles.post}>
                <span className={styles.thumb} aria-hidden="true" />
                <div>
                  <strong>{p.title} · {p.platform}</strong>
                  <small>{p.status}</small>
                </div>
                <span className={`${styles.tag} ${styles.mono}`}>{p.when}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
