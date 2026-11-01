"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import base from "../../dashboard.module.css";
import styles from "./inbox.module.css";
import { PageHead, TopBar, useShell } from "../../_shell/AppShell";
import { withSignOff } from "../../_shell/settings";
import { EmptyState, ReconnectBanner } from "../../_shell/states";
import { BLUE, CATEGORY_STYLE, GREEN, PATTERNS, Pixels, RefreshIcon, cx, hours } from "../../_shell/ui";
import type { Category, InboxThread, Tone } from "../../data";

const TONES: Tone[] = ["Friendly", "Professional", "Shorter"];

// What approving does, by where the message came from.
const APPROVE_LABEL: Record<InboxThread["delivery"], string> = { gmail_draft: "Approve and save to Gmail drafts", youtube_reply: "Approve and post reply", none: "Approve reply" };
const APPROVED_NOTE: Record<InboxThread["delivery"], string> = { gmail_draft: "Reply saved to your Gmail drafts", youtube_reply: "Reply approved; posting it on YouTube", none: "Reply approved" };
const SAVED_SHORT: Record<InboxThread["delivery"], string> = { gmail_draft: "Saved to drafts", youtube_reply: "Reply posted", none: "Approved" };
const FILTERS: { id: Category | "All"; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Brand deal", label: "Brand deal" },
  { id: "Collab", label: "Collab" },
  { id: "Fan question", label: "Fans" },
  { id: "Spam", label: "Spam" },
];

// "==key point==" → highlighted, "**bold**" → strong.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(==[^=]+==|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("==") ? (
          <mark key={i} className={styles.mark}>{part.slice(2, -2)}</mark>
        ) : part.startsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function plain(text: string) {
  return text.replace(/==([^=]+)==/g, "$1");
}

export default function Inbox({ initialId }: { initialId?: string }) {
  const router = useRouter();
  const { notify, approve, approved, minutesSaved, settings, threads: live, updateThread, regenerateDrafts } = useShell();
  const [selectedId, setSelectedId] = useState(live.some((t) => t.id === initialId) ? initialId! : live[0]?.id);
  const [filter, setFilter] = useState<Category | "All">("All");
  const [query, setQuery] = useState("");
  // The reply being typed; saved to the API when editing is done.
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // Opening the inbox marks the message on screen as read.
  useEffect(() => {
    const first = live.find((t) => t.id === selectedId);
    if (first?.unread) updateThread(first.id, { read: true });
    // Only on arrival; select() handles later picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const visible = live.filter(
    (t) =>
      (filter === "All" || t.category === filter) &&
      (!q || [t.from, t.subject, t.preview].some((field) => field.toLowerCase().includes(q))),
  );

  // Drafted automatically only when Settings › Replies allows it for the category.
  const autoDrafted = (t: InboxThread) => t.draftReady && t.category !== "Spam" && settings.autoDraft[t.category];
  const hasDraft = (t: InboxThread) => Boolean(t.drafts) && (autoDrafted(t) || t.draftRequested);
  const waiting = live.filter((t) => autoDrafted(t) && !approved.has(t.id));
  const toneFor = (t: InboxThread) => t.tone ?? settings.tone;
  const edit = (t: InboxThread) => typing[t.id] ?? t.editedReply ?? undefined;
  const draftText = (t: InboxThread) => edit(t) ?? withSignOff(t.drafts![toneFor(t)], settings.signOff);
  const selected = live.find((t) => t.id === selectedId) ?? live[0];

  function select(id: string) {
    setSelectedId(id);
    if (live.find((t) => t.id === id)?.unread) updateThread(id, { read: true });
    router.replace(`/dashboard/inbox?m=${id}`, { scroll: false });
  }

  // What gets saved to Gmail drafts: the text on screen, without highlights.
  const approvalFor = (t: InboxThread) => ({ id: t.id, text: plain(draftText(t)), minutesSaved: t.minutesSaved });

  function approveAll() {
    if (waiting.length === 0) return;
    approve(waiting.map(approvalFor));
    notify(`${waiting.length} ${waiting.length === 1 ? "reply" : "replies"} approved`);
  }

  function archive(t: InboxThread) {
    updateThread(t.id, { archived: true });
    const next = live.find((other) => other.id !== t.id);
    if (next) select(next.id);
    notify(`Archived “${t.subject}”`);
  }

  async function regenerate(t: InboxThread) {
    setRegenerating(true);
    const ok = await regenerateDrafts(t.id);
    setRegenerating(false);
    if (ok) notify(`Draft rewritten in a ${toneFor(t).toLowerCase()} tone`);
  }

  const shown = (c: Category | "All") => live.filter((t) => c === "All" || t.category === c).length;

  return (
    <>
      <TopBar>
        <button type="button" className={base.btnLine} onClick={approveAll} disabled={waiting.length === 0}>
          {waiting.length ? `✓ Approve all ${waiting.length} drafts` : "✓ No drafts waiting"}
        </button>
      </TopBar>

      <PageHead
        eyebrow="inbox"
        title="Inbox"
        lead={
          waiting.length
            ? `${live.length} messages sorted since yesterday. ${waiting.length} ${waiting.length === 1 ? "reply is" : "replies are"} drafted and waiting for you.`
            : `${live.length} messages sorted since yesterday. Nothing is waiting for you.`
        }
        badge={`${hours(minutesSaved)} saved this week`}
      />
      <ReconnectBanner accounts={["gmail"]} />

      <div className={styles.layout}>
        <section className={styles.listCard} aria-label="Messages">
          <div className={styles.listHead}>
            <label className={styles.search}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages" aria-label="Search messages" />
            </label>
            <div className={styles.filters} role="tablist" aria-label="Filter messages">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={cx(base.cat, f.id === "All" ? base.catAll : CATEGORY_STYLE[f.id], filter === f.id && styles.filterOn)}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} {shown(f.id)}
                </button>
              ))}
            </div>
          </div>

          <ul className={styles.threads}>
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={cx(styles.thread, selected?.id === t.id && styles.threadOn)}
                  onClick={() => select(t.id)}
                  aria-current={selected?.id === t.id ? "true" : undefined}
                >
                  {t.unread && <span className={styles.dot} aria-label="Unread" />}
                  <span className={base.who} style={{ background: t.color }}>{t.initial}</span>
                  <span className={styles.threadBody}>
                    <span className={styles.threadTop}>
                      <strong>{t.from}</strong>
                      <time>{t.time}</time>
                    </span>
                    <span className={styles.subject}>{t.subject}</span>
                    <span className={styles.preview}>{t.preview}</span>
                    <span className={styles.threadTags}>
                      <span className={cx(base.tag, CATEGORY_STYLE[t.category])}>{t.category}</span>
                      {approved.has(t.id) ? (
                        <span className={styles.ready}>✓ {SAVED_SHORT[t.delivery]}</span>
                      ) : hasDraft(t) ? (
                        <span className={styles.ready}>✓ Draft ready</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li>
                {q ? (
                  <EmptyState
                    compact
                    title={`No messages match “${query.trim()}”`}
                    action={<button type="button" className={base.mini} onClick={() => setQuery("")}>Clear search</button>}
                  >
                    Search looks at the sender, subject and preview.
                  </EmptyState>
                ) : (
                  <EmptyState compact title="Nothing here right now" color={GREEN} pattern={PATTERNS.inbox}>
                    New messages in this category will show up here, sorted and with replies drafted.
                  </EmptyState>
                )}
              </li>
            )}
          </ul>
        </section>

        {selected ? (
          <Reader
            key={selected.id}
            thread={selected}
            tone={toneFor(selected)}
            setTone={(tone) => {
              const hadEdits = edit(selected) !== undefined;
              setTyping(({ [selected.id]: _, ...rest }) => rest);
              updateThread(selected.id, hadEdits ? { tone, editedReply: null } : { tone });
              if (hadEdits) notify(`Switched to ${tone.toLowerCase()}; your edits were replaced`);
            }}
            hasDraft={hasDraft(selected)}
            autoOff={selected.draftReady && !autoDrafted(selected)}
            text={selected.drafts ? draftText(selected) : ""}
            edited={edit(selected) !== undefined}
            editing={editing === selected.id}
            onEdit={() => setEditing(selected.id)}
            onDoneEditing={() => {
              setEditing(null);
              const text = typing[selected.id];
              if (text !== undefined && text !== selected.editedReply) updateThread(selected.id, { editedReply: text });
              setTyping(({ [selected.id]: _, ...rest }) => rest);
            }}
            onChangeText={(value) => setTyping((s) => ({ ...s, [selected.id]: value }))}
            onUndoEdits={() => {
              setTyping(({ [selected.id]: _, ...rest }) => rest);
              if (selected.editedReply !== null) updateThread(selected.id, { editedReply: null });
              setEditing(null);
            }}
            isApproved={approved.has(selected.id)}
            regenerating={regenerating}
            onDraft={async () => {
              // Drafts written ahead (auto-drafts were off) just show;
              // otherwise the AI writes one now.
              if (selected.drafts) {
                updateThread(selected.id, { draftRequested: true });
                notify("Reply drafted in your tone");
                return;
              }
              setRegenerating(true);
              const ok = await regenerateDrafts(selected.id);
              setRegenerating(false);
              if (ok) notify("Reply drafted in your tone");
            }}
            onRegenerate={() => regenerate(selected)}
            onApprove={() => {
              setEditing(null);
              const text = typing[selected.id];
              if (text !== undefined && text !== selected.editedReply) updateThread(selected.id, { editedReply: text });
              setTyping(({ [selected.id]: _, ...rest }) => rest);
              approve([approvalFor(selected)]);
              notify(APPROVED_NOTE[selected.delivery]);
            }}
            onArchive={() => archive(selected)}
            onGmail={() => notify("This is a sample message, so there's nothing to open. Connect Gmail in Settings to see your own.")}
          />
        ) : (
          <section className={styles.reader}>
            <EmptyState
              title="Inbox zero"
              color={GREEN}
              pattern={PATTERNS.inbox}
              action={<Link className={base.btnDark} href="/dashboard">Back to Today</Link>}
            >
              Every message is answered or archived. Crevo will sort new ones as they arrive.
            </EmptyState>
          </section>
        )}
      </div>
    </>
  );
}

function Reader({
  thread: t,
  tone,
  setTone,
  hasDraft,
  autoOff,
  text,
  edited,
  editing,
  onEdit,
  onDoneEditing,
  onChangeText,
  onUndoEdits,
  isApproved,
  regenerating,
  onDraft,
  onRegenerate,
  onApprove,
  onArchive,
  onGmail,
}: {
  thread: InboxThread;
  tone: Tone;
  setTone: (tone: Tone) => void;
  hasDraft: boolean;
  autoOff: boolean;
  text: string;
  edited: boolean;
  editing: boolean;
  onEdit: () => void;
  onDoneEditing: () => void;
  onChangeText: (value: string) => void;
  onUndoEdits: () => void;
  isApproved: boolean;
  regenerating: boolean;
  onDraft: () => void;
  onRegenerate: () => void;
  onApprove: () => void;
  onArchive: () => void;
  onGmail: () => void;
}) {
  return (
    <section className={styles.reader} aria-labelledby="thread-title">
      <div className={styles.readerHead}>
        <div className={styles.chips}>
          <span className={cx(base.tag, CATEGORY_STYLE[t.category])}>{t.category}</span>
          <span className={base.tag}>{t.source}</span>
          <span className={cx(base.tag, base.mono)}>{t.time}</span>
        </div>
        <h2 id="thread-title" className={styles.title}>{t.subject}</h2>
        <div className={styles.sender}>
          <span className={cx(base.who, styles.senderAvatar)} style={{ background: t.color }}>{t.initial}</span>
          <strong>{t.from}</strong>
          <span className={styles.email}>{t.email}</span>
          <span className={styles.senderActions}>
            <button type="button" className={base.mini} onClick={onArchive}>Archive</button>
            {t.externalUrl ? (
              <a className={base.mini} href={t.externalUrl} target="_blank" rel="noopener noreferrer">Open in {t.source} ↗</a>
            ) : (
              <button type="button" className={base.mini} onClick={onGmail}>Open in {t.source} ↗</button>
            )}
          </span>
        </div>
      </div>

      <div className={styles.message}>
        {t.body.map((p, i) => <p key={i}><Rich text={p} /></p>)}
        <p className={styles.signOff}>— {t.signOff}</p>
      </div>

      {t.summary && (
        <div className={styles.summary}>
          <span className={styles.summaryIcon}><Pixels color={BLUE} pattern={PATTERNS.briefing} size={4} /></span>
          <div>
            <div className={styles.summaryLabel}>Crevo summary</div>
            <p>{t.summary}</p>
          </div>
          {t.dealSlug && (
            <Link className={base.miniDark} href={`/dashboard/deals?deal=${t.dealSlug}`}>Open deal →</Link>
          )}
        </div>
      )}

      {(t.drafts || t.category !== "Spam") && (
        <div className={styles.draft}>
          <div className={styles.draftHead}>
            <strong>Reply draft</strong>
            <span className={base.tag}>{edited ? "edited by you" : "written in your tone"}</span>
            {hasDraft && (
              <div className={styles.tones} role="radiogroup" aria-label="Tone">
                {TONES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={tone === option}
                    className={cx(styles.tone, tone === option && styles.toneOn)}
                    onClick={() => setTone(option)}
                    disabled={isApproved}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
          {hasDraft ? (
            <>
              {editing ? (
                <textarea
                  className={styles.draftEdit}
                  value={plain(text)}
                  onChange={(e) => onChangeText(e.target.value)}
                  rows={Math.max(8, plain(text).split("\n").length + 2)}
                  aria-label="Edit reply"
                  autoFocus
                />
              ) : (
                <div className={cx(styles.draftBody, regenerating && styles.draftBusy)} aria-label={plain(text)}>
                  <Rich text={text} />
                </div>
              )}
              <div className={styles.draftFoot}>
                <span className={styles.note}>Nothing is sent until you approve it.</span>
                {isApproved ? (
                  <span className={base.savedTag}>✓ {t.delivery === "gmail_draft" ? (t.delivered ? "Saved to Gmail drafts" : "Saving to Gmail drafts…") : t.delivery === "youtube_reply" ? (t.delivered ? "Reply posted on YouTube" : "Posting on YouTube…") : "Approved"}</span>
                ) : editing ? (
                  <>
                    {edited && <button type="button" className={base.btnGhost} onClick={onUndoEdits}>Undo edits</button>}
                    <button type="button" className={base.btnDark} onClick={onDoneEditing}>Done editing</button>
                  </>
                ) : (
                  <>
                    <button type="button" className={base.btnGhost} onClick={onEdit}>Edit</button>
                    <button type="button" className={base.btnGhost} onClick={onRegenerate} disabled={regenerating || edited}>
                      <RefreshIcon /> {regenerating ? "Rewriting…" : "Regenerate"}
                    </button>
                    <button type="button" className={base.btnDark} onClick={onApprove}>{APPROVE_LABEL[t.delivery]}</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noDraft}>
              <p>
                {autoOff
                  ? `Auto-drafts for ${t.category === "Fan question" ? "fan questions" : t.category === "Collab" ? "collabs" : "brand deals"} are off in Settings, so nothing was drafted.`
                  : "No reply drafted yet. This one needs your decision, so Crevo waited for you."}
              </p>
              <button type="button" className={base.btnDark} onClick={onDraft} disabled={regenerating}>{regenerating ? "Writing…" : "✦ Draft a reply"}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
