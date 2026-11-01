"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import base from "../../dashboard.module.css";
import styles from "./publish.module.css";
import { PageHead, TopBar, useShell } from "../../_shell/AppShell";
import { ReconnectBanner } from "../../_shell/states";
import { PATTERNS, Pixels, RefreshIcon, YELLOW, cx } from "../../_shell/ui";
import { EmptyState } from "../../_shell/states";
import { ApiError, api } from "../../_shell/api";
import { MINUTES_SAVED_PER_CLIP, postSlots, publishPlatforms, type Clip, type PublishPlatform, type Video } from "../../data";

const STEPS = ["Upload", "Transcript", "Clips", "Captions", "Schedule"];
// Longest clip each platform accepts, in seconds.
const MAX_LENGTH: Record<PublishPlatform, number> = { reel: 90, short: 60, tiktok: 600 };

// A fixed, natural-looking waveform (no randomness, so server and client match).
const WAVE = Array.from({ length: 120 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.37) * 0.3 + Math.sin(i * 5.3) * 0.25);
  return Math.round(22 + Math.min(1, v) * 78);
});

type CaptionKey = `${string}:${PublishPlatform}`;
type Upload = { name: string; progress: number; phase: "uploading" | "transcribing" } | null;

function mmss(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

// Uploading the creator's own video: straight to Supabase Storage with a
// signed URL (with progress), then the API processes it and we poll.
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(file);
  });
}

type RealUpload = { name: string; progress: number; phase: "uploading" | "transcribing"; videoId?: string } | null;

function useVideoUpload(onReady: () => void) {
  const { notify, integrations, pendingVideo, refreshVideo } = useShell();
  const [realUpload, setRealUpload] = useState<RealUpload>(
    pendingVideo?.status === "processing" ? { name: pendingVideo.fileName, progress: 100, phase: "transcribing", videoId: pendingVideo.id } : null,
  );
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const id = realUpload?.videoId;
    if (!id) return;
    const timer = setInterval(async () => {
      const v = await api.video(id).catch(() => null);
      if (!v || v.status === "processing") return;
      clearInterval(timer);
      setRealUpload(null);
      if (v.status === "ready") {
        await refreshVideo();
        ready.current();
        notify(`${v.fileName}: transcript ready and ${v.clips.length} clips found`);
      } else {
        notify(`${v.fileName} couldn't be processed${v.error ? `: ${v.error}` : ""}`);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [realUpload?.videoId, refreshVideo, notify]);

  async function uploadFile(file: File) {
    if (!integrations.features.storage) {
      notify("Video uploads aren't set up on this server yet. Try the sample vlog.");
      return;
    }
    setRealUpload({ name: file.name, progress: 0, phase: "uploading" });
    try {
      const target = await api.createVideoUpload({ fileName: file.name, size: file.size, mimeType: file.type || "video/mp4" });
      await putWithProgress(target.signedUrl, file, (p) => setRealUpload({ name: file.name, progress: p, phase: "uploading" }));
      await api.processVideo(target.videoId);
      setRealUpload({ name: file.name, progress: 100, phase: "transcribing", videoId: target.videoId });
    } catch (err) {
      setRealUpload(null);
      notify(err instanceof ApiError ? err.message : "The upload didn't finish. Try again.");
    }
  }
  return { realUpload, uploadFile };
}

export default function Publish({ initialClip }: { initialClip?: string }) {
  const { video } = useShell();
  if (!video || video.clips.length === 0) return <FirstUpload />;
  return <Editor video={video} initialClip={initialClip} />;
}

function FirstUpload() {
  const input = useRef<HTMLInputElement>(null);
  const { realUpload, uploadFile } = useVideoUpload(() => undefined);
  return (
    <>
      <TopBar />
      <PageHead eyebrow="publish" title="Publish" lead="Upload a video and Crevo transcribes it, finds the clips worth posting and writes captions for every platform." />
      <EmptyState
        title={realUpload ? (realUpload.phase === "uploading" ? `Uploading ${realUpload.name} · ${realUpload.progress}%` : `Transcribing ${realUpload.name}…`) : "No video yet"}
        color={YELLOW}
        pattern={PATTERNS.publish}
        action={!realUpload && <button type="button" className={base.btnDark} onClick={() => input.current?.click()}>Choose a video</button>}
      >
        {realUpload ? "You can leave this page; it keeps going." : "MP4, MOV or WebM, up to 2 GB."}
      </EmptyState>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
    </>
  );
}

// How a scheduled clip's posts went.
function PostStatus({ clip, notify }: { clip: Clip; notify: (m: string) => void }) {
  const label = (p: Clip["posts"][number]) => publishPlatforms.find((x) => x.id === p.platform)!.label;
  const done = clip.posts.filter((p) => p.status === "published");
  const manual = clip.posts.filter((p) => p.status === "needs_manual");
  const failed = clip.posts.filter((p) => p.status === "failed");
  async function download(id: string) {
    try {
      window.location.href = (await api.postDownload(id)).url;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Couldn't get the clip. Try again.");
    }
  }
  if (done.length === 0 && manual.length === 0 && failed.length === 0) return <span className={base.savedTag}>✓ Scheduled</span>;
  return (
    <span className={styles.postStatus}>
      {done.map((p) => (
        <a key={p.id} className={base.savedTag} href={p.externalUrl ?? undefined} target="_blank" rel="noopener noreferrer">✓ {label(p)} live ↗</a>
      ))}
      {manual.map((p) =>
        p.hasClipFile ? (
          <button key={p.id} type="button" className={base.mini} onClick={() => download(p.id)} title={p.error ?? "Post it yourself"}>↓ {label(p)} clip</button>
        ) : (
          <span key={p.id} className={base.tag} title={p.error ?? ""}>{label(p)}: post it yourself</span>
        ),
      )}
      {failed.map((p) => (
        <span key={p.id} className={cx(base.tag, styles.postFailed)} title={p.error ?? ""}>{label(p)} failed</span>
      ))}
    </span>
  );
}

function Editor({ video, initialClip }: { video: Video; initialClip?: string }) {
  const router = useRouter();
  const { notify, scheduledClips: scheduled, scheduleClip, updateClip, updateCaption, rewriteCaption, integrations } = useShell();
  const { clips, transcript } = video;
  const TICKS = ["0:00", mmss(video.lengthSec / 4), mmss(video.lengthSec / 2), mmss((video.lengthSec * 3) / 4), video.length];
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(3);
  const [reached, setReached] = useState(3);
  const [upload, setUpload] = useState<Upload>(null);
  const { realUpload, uploadFile } = useVideoUpload(() => {
    setStep(1);
    setReached(1);
  });
  const [captionBusy, setCaptionBusy] = useState(false);
  const [fileName, setFileName] = useState(video.file);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [clipId, setClipId] = useState(clips.some((c) => c.id === initialClip) ? initialClip! : clips[0].id);
  const [platform, setPlatform] = useState<PublishPlatform>("reel");
  // The caption being typed; saved half a second after the last keystroke.
  const [typed, setTyped] = useState<Partial<Record<CaptionKey, string>>>({});
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Steps the simulated upload, then transcription, then opens the Transcript.
  useEffect(() => {
    if (!upload) return;
    const t = setTimeout(() => {
      if (upload.progress < 100) {
        setUpload({ ...upload, progress: Math.min(100, upload.progress + (upload.phase === "uploading" ? 7 : 12)) });
      } else if (upload.phase === "uploading") {
        setUpload({ ...upload, phase: "transcribing", progress: 0 });
      } else {
        setUpload(null);
        setStep(1);
        setReached(1);
        notify(`${upload.name}: transcript ready and ${clips.length} clips found`);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [upload, notify]);

  useEffect(() => {
    const pending = Object.entries(typed) as [CaptionKey, string][];
    if (pending.length === 0) return;
    const t = setTimeout(() => {
      pending.forEach(([k, text]) => {
        const [id, p] = k.split(":") as [string, PublishPlatform];
        updateCaption(id, p, { text });
      });
      setTyped({});
    }, 500);
    return () => clearTimeout(t);
  }, [typed, updateCaption]);

  const span = (c: Clip) => ({ start: c.startSec, end: c.endSec });
  const trimmed = (c: Clip) => c.startSec !== c.suggestedStartSec || c.endSec !== c.suggestedEndSec;
  const skipped = new Set(clips.filter((c) => c.skipped).map((c) => c.id));
  const kept = clips.filter((c) => !c.skipped);
  const clip = clips.find((c) => c.id === clipId) ?? clips[0];
  const clipNumber = clips.indexOf(clip) + 1;
  const slots = postSlots(clipNumber - 1);
  const key: CaptionKey = `${clip.id}:${platform}`;
  const saved = clip.captions[platform];
  const options = saved.options;
  const caption = typed[key] ?? saved.text ?? options[saved.variant % Math.max(1, options.length)] ?? "";
  const limit = publishPlatforms.find((p) => p.id === platform)!.limit;
  const tags = clip.hashtags;
  const isScheduled = scheduled.has(clip.id);
  const allScheduled = kept.length > 0 && kept.every((c) => scheduled.has(c.id));
  const { start, end } = span(clip);

  function go(next: number) {
    setStep(next);
    setReached((r) => Math.max(r, next));
  }

  function pickClip(id: string) {
    setClipId(id);
    setAdding(false);
    router.replace(`/dashboard/publish?clip=${id}`, { scroll: false });
  }

  // The sample vlog: a simulated upload, moved along by the effect above.
  function startUpload(name: string) {
    setFileName(name);
    setStep(0);
    setReached(0);
    setUpload({ name, progress: 0, phase: "uploading" });
  }

  function nudge(edge: "start" | "end", by: number) {
    const s = span(clip);
    const next = { ...s, [edge]: s[edge] + by };
    if (next.end - next.start < 5 || next.start < 0 || next.end > video.lengthSec) return;
    updateClip(clip.id, { startSec: next.start, endSec: next.end });
  }

  function toggleKeep() {
    updateClip(clip.id, { skipped: !clip.skipped });
  }

  async function rewrite() {
    setTyped(({ [key]: _, ...rest }) => rest);
    // With AI: a fresh caption. Without: the next option already written.
    if (integrations.features.ai) {
      setCaptionBusy(true);
      const ok = await rewriteCaption(clip.id, platform);
      setCaptionBusy(false);
      if (ok) notify(`New ${publishPlatforms.find((p) => p.id === platform)!.label} caption, written in your tone`);
      return;
    }
    updateCaption(clip.id, platform, { variant: saved.variant + 1, text: null });
    notify(`New ${publishPlatforms.find((p) => p.id === platform)!.label} caption, written in your tone`);
  }

  function addTag() {
    const clean = newTag.trim().replace(/^#*/, "").replace(/\s+/g, "");
    if (clean) {
      const tag = `#${clean.toLowerCase().replace(/[^a-z0-9_]/g, "")}`;
      if (tag.length > 1 && !tags.includes(tag)) updateClip(clip.id, { hashtags: [...tags, tag] });
    }
    setNewTag("");
    setAdding(false);
  }

  function removeTag(tag: string) {
    updateClip(clip.id, { hashtags: tags.filter((t) => t !== tag) });
  }

  function schedule(c: Clip = clip) {
    const n = clips.indexOf(c) + 1;
    // Save a caption still being typed first; writes go out in order.
    (Object.entries(typed) as [CaptionKey, string][]).forEach(([k, text]) => {
      const [id, p] = k.split(":") as [string, PublishPlatform];
      updateCaption(id, p, { text });
    });
    setTyped({});
    scheduleClip(c.id, postSlots(n - 1).map((slot) => ({ platform: slot.platform, date: slot.date, minutes: slot.minutes, why: slot.why })));
    notify(`Clip ${n} scheduled: ${postSlots(n - 1).map((t) => `${t.label} ${t.when}`).join(", ")}`);
    setReached((r) => Math.max(r, 4));
  }

  const stepDone = (i: number) => (i === 4 ? allScheduled : i < reached && !(i === 0 && upload));

  const videoCard = (
    <section className={styles.card} aria-labelledby="video-title">
      <div className={styles.videoHead}>
        <span className={base.icon}><Pixels color={YELLOW} pattern={PATTERNS.publish} /></span>
        <h2 id="video-title">{fileName}</h2>
        <span className={cx(base.tag, base.mono)}>{video.length} · {video.quality}</span>
      </div>

      <button type="button" className={styles.player} onClick={() => notify(`Playing clip ${clipNumber}: ${mmss(start)} – ${mmss(end)}`)} aria-label={`Play clip ${clipNumber}`}>
        <span className={styles.play} aria-hidden="true" />
        <span className={styles.subtitle}>“{clip.quote}”</span>
      </button>

      <div className={styles.timeline}>
        <div className={styles.wave} aria-hidden="true">
          {WAVE.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
        </div>
        {clips.map((c, i) => {
          const s = span(c);
          return (
            <button
              key={c.id}
              type="button"
              className={cx(styles.segment, c.id === clip.id && styles.segmentOn, skipped.has(c.id) && styles.segmentOff)}
              style={{
                left: `${(s.start / video.lengthSec) * 100}%`,
                width: `max(30px, ${((s.end - s.start) / video.lengthSec) * 100}%)`,
                borderColor: c.color,
                background: `${c.color}1f`,
              }}
              onClick={() => pickClip(c.id)}
              aria-label={`Clip ${i + 1}: ${mmss(s.start)} to ${mmss(s.end)}`}
            >
              <span style={{ background: c.color }}>{i + 1}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.ticks} aria-hidden="true">
        {TICKS.map((t) => <span key={t}>{t}</span>)}
      </div>

      <ul className={styles.clips}>
        {clips.map((c, i) => {
          const s = span(c);
          return (
            <li key={c.id}>
              <button type="button" className={cx(styles.clip, c.id === clip.id && styles.clipOn, skipped.has(c.id) && styles.clipOff)} onClick={() => pickClip(c.id)}>
                <span className={styles.clipNum} style={{ background: c.color }}>{i + 1}</span>
                <span className={styles.clipText}>
                  <strong>{c.title}</strong>
                  <small>{mmss(s.start)} – {mmss(s.end)} · {skipped.has(c.id) ? "skipped" : c.why}</small>
                </span>
                {scheduled.has(c.id) && <span className={base.tag}>scheduled</span>}
                <span className={styles.hook}>hook {c.hook}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <>
      <TopBar>
        <button type="button" className={base.btnDark} onClick={() => fileInput.current?.click()}>＋ Upload video</button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
      </TopBar>

      <PageHead
        eyebrow="publish"
        title="Create once, publish everywhere"
        lead={`One 14-minute vlog became ${clips.length} clips with captions for every platform.`}
        badge={`${MINUTES_SAVED_PER_CLIP} min saved per clip`}
      />
      <ReconnectBanner accounts={["youtube"]} />

      <ol className={styles.stepper} aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={cx(styles.step, stepDone(i) && styles.stepDone, i === step && styles.stepNow)} aria-current={i === step ? "step" : undefined}>
            <button type="button" onClick={() => setStep(i)} disabled={i > reached || Boolean(upload)}>
              <span className={styles.stepMark}>{stepDone(i) && i !== step ? "✓" : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className={cx(styles.card, styles.single)} aria-label="Upload">
          {realUpload ? (
            <div className={styles.progress} role="status">
              <strong>{realUpload.phase === "uploading" ? `Uploading ${realUpload.name}` : `Transcribing ${realUpload.name} and finding clips`}</strong>
              <span className={styles.bar}><i style={{ width: `${realUpload.phase === "uploading" ? realUpload.progress : 100}%` }} /></span>
              <small>{realUpload.phase === "uploading" ? `${realUpload.progress}% · keep this tab open until it reaches 100%` : "This takes a few minutes. You can leave this page; it keeps going."}</small>
            </div>
          ) : upload ? (
            <div className={styles.progress}>
              <strong>{upload.phase === "uploading" ? `Uploading ${upload.name}` : "Transcribing and finding clips"}</strong>
              <span className={styles.bar}><i style={{ width: `${upload.progress}%` }} /></span>
              <small>
                {upload.phase === "uploading"
                  ? `${upload.progress}% · you can leave this page, it keeps going`
                  : "Listening for strong hooks, questions your audience asked and quick payoffs"}
              </small>
            </div>
          ) : (
            <div
              className={cx(styles.drop, dragging && styles.dropOn)}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) uploadFile(file);
              }}
            >
              <span className={styles.dropIcon}><Pixels color={YELLOW} pattern={PATTERNS.publish} size={5} /></span>
              <strong>Drop a video here</strong>
              <small>MP4, MOV or WebM, up to 2 GB. Crevo transcribes it and suggests clips for Reels, Shorts and TikTok.</small>
              <div className={styles.dropActions}>
                <button type="button" className={base.btnDark} onClick={() => fileInput.current?.click()}>Choose a file</button>
                <button type="button" className={base.btnGhost} onClick={() => startUpload(video.file)}>Use the sample vlog</button>
              </div>
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section className={cx(styles.card, styles.single)} aria-labelledby="transcript-title">
          <div className={styles.capHead}>
            <h2 id="transcript-title">Transcript · {fileName}</h2>
            <span className={base.tag}>{transcript.length} lines · {video.length}</span>
          </div>
          <label className={styles.search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the transcript" aria-label="Search the transcript" />
          </label>
          <ol className={styles.lines}>
            {transcript
              .filter((l) => !query.trim() || l.text.toLowerCase().includes(query.trim().toLowerCase()))
              .map((l) => {
                const inClip = clips.find((c) => l.sec >= span(c).start && l.sec <= span(c).end);
                return (
                  <li key={l.sec} style={inClip ? { background: `${inClip.color}14`, boxShadow: `inset 3px 0 0 ${inClip.color}` } : undefined}>
                    <time className={base.mono}>{mmss(l.sec)}</time>
                    <span>{l.text}</span>
                    {inClip && <span className={styles.lineTag} style={{ color: inClip.color }}>clip {clips.indexOf(inClip) + 1}</span>}
                  </li>
                );
              })}
          </ol>
          <div className={styles.foot}>
            <span className={styles.note}>Tinted lines are where Crevo found clips.</span>
            <button type="button" className={base.btnDark} onClick={() => go(2)}>Review {clips.length} clips →</button>
          </div>
        </section>
      )}

      {(step === 2 || step === 3) && (
        <div className={styles.layout}>
          {videoCard}

          {step === 2 ? (
            <section className={styles.card} aria-labelledby="trim-title">
              <div className={styles.capHead}>
                <h2 id="trim-title">Clip {clipNumber} · {clip.title.replace(/[“”]/g, "")}</h2>
                <span className={styles.hook}>hook {clip.hook}</span>
              </div>
              <p className={styles.why}>Why this clip: {clip.why}.</p>

              <div className={styles.trim}>
                {(["start", "end"] as const).map((edge) => (
                  <div key={edge} className={styles.trimBox}>
                    <span>{edge === "start" ? "Starts" : "Ends"}</span>
                    <strong className={base.mono}>{mmss(span(clip)[edge])}</strong>
                    <div className={styles.nudges}>
                      <button type="button" className={base.mini} onClick={() => nudge(edge, -1)} aria-label={`${edge} one second earlier`}>−1s</button>
                      <button type="button" className={base.mini} onClick={() => nudge(edge, 1)} aria-label={`${edge} one second later`}>+1s</button>
                    </div>
                  </div>
                ))}
                <div className={styles.trimBox}>
                  <span>Length</span>
                  <strong className={base.mono}>{end - start}s</strong>
                  <small>{trimmed(clip) ? "trimmed by you" : "as suggested"}</small>
                </div>
              </div>

              <div className={styles.fieldHead}><span>Fits</span></div>
              <ul className={styles.fits}>
                {publishPlatforms.map((p) => {
                  const ok = end - start <= MAX_LENGTH[p.id];
                  return (
                    <li key={p.id}>
                      <span className={styles.swatch} style={{ background: p.swatch }} />
                      {p.label}
                      <span className={ok ? styles.fitOk : styles.fitBad}>{ok ? "✓ fits" : `over ${MAX_LENGTH[p.id]}s`}</span>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.foot}>
                <button type="button" className={base.btnGhost} onClick={toggleKeep}>{skipped.has(clip.id) ? "Keep this clip" : "Skip this clip"}</button>
                {trimmed(clip) && (
                  <button type="button" className={base.btnGhost} onClick={() => updateClip(clip.id, { startSec: clip.suggestedStartSec, endSec: clip.suggestedEndSec })}>Reset times</button>
                )}
                <button type="button" className={base.btnDark} onClick={() => { if (skipped.has(clip.id) && kept[0]) pickClip(kept[0].id); go(3); }} disabled={kept.length === 0}>
                  Write captions for {kept.length} {kept.length === 1 ? "clip" : "clips"} →
                </button>
              </div>
            </section>
          ) : (
            <section className={styles.card} aria-labelledby="captions-title">
              <div className={styles.capHead}>
                <h2 id="captions-title">Clip {clipNumber} · captions for each platform</h2>
                <span className={base.tag}>written in your tone</span>
              </div>

              {skipped.has(clip.id) ? (
                <p className={styles.why}>This clip is skipped. Pick another clip, or keep it again in the Clips step.</p>
              ) : (
                <>
                  <div className={styles.platforms} role="tablist" aria-label="Platform">
                    {publishPlatforms.map((p) => (
                      <button key={p.id} type="button" role="tab" aria-selected={platform === p.id} className={cx(styles.platform, platform === p.id && styles.platformOn)} onClick={() => setPlatform(p.id)}>
                        <span className={styles.swatch} style={{ background: p.swatch }} />
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.fieldHead}>
                    <label htmlFor="caption">Caption</label>
                    <span className={cx(styles.counter, caption.length > limit && styles.over)}>{caption.length.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}</span>
                  </div>
                  <textarea
                    id="caption"
                    className={styles.caption}
                    value={caption}
                    onChange={(e) => setTyped((s) => ({ ...s, [key]: e.target.value }))}
                    rows={4}
                    disabled={isScheduled}
                  />

                  <div className={styles.fieldHead}>
                    <span>Hashtags</span>
                    <span className={styles.counter}>{tags.length} {tags.length === 1 ? "tag" : "tags"}</span>
                  </div>
                  <div className={styles.tags}>
                    {tags.map((t) => (
                      <button key={t} type="button" className={styles.hashtag} onClick={() => removeTag(t)} disabled={isScheduled} title={`Remove ${t}`}>
                        {t}
                      </button>
                    ))}
                    {adding ? (
                      <form className={styles.addForm} onSubmit={(e) => { e.preventDefault(); addTag(); }}>
                        <input autoFocus value={newTag} onChange={(e) => setNewTag(e.target.value)} onBlur={addTag} placeholder="#hashtag" aria-label="New hashtag" />
                      </form>
                    ) : (
                      !isScheduled && <button type="button" className={styles.addTag} onClick={() => setAdding(true)}>+ add</button>
                    )}
                  </div>

                  <div className={styles.fieldHead}>
                    <span>Best times to post</span>
                    <span className={styles.counter}>from your last 30 days</span>
                  </div>
                  <div className={styles.times}>
                    {slots.map((t) => (
                      <div key={t.platform} className={cx(styles.time, t.platform === platform && styles.timeOn)}>
                        <strong>
                          <span className={styles.swatchSmall} style={{ background: publishPlatforms.find((p) => p.id === t.platform)!.swatch }} />
                          {t.label}
                        </strong>
                        <span className={base.mono}>{t.when}</span>
                        <small>{t.why}</small>
                      </div>
                    ))}
                  </div>

                  <div className={styles.foot}>
                    <span className={styles.note}>{isScheduled ? "Scheduled. Every post is now in your calendar." : "Nothing posts until you approve."}</span>
                    {isScheduled ? (
                      <>
                        <span className={base.savedTag}>✓ {slots.length} posts scheduled</span>
                        <button type="button" className={base.btnGhost} onClick={() => go(4)}>See schedule →</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={base.btnGhost} onClick={rewrite} disabled={captionBusy}><RefreshIcon /> {captionBusy ? "Writing…" : "Rewrite"}</button>
                        <button type="button" className={base.btnDark} onClick={() => schedule()}>Approve and schedule {slots.length} posts</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {step === 4 && (
        <section className={cx(styles.card, styles.single)} aria-labelledby="schedule-title">
          <div className={styles.capHead}>
            <h2 id="schedule-title">Schedule</h2>
            <span className={base.tag}>{kept.filter((c) => scheduled.has(c.id)).length} of {kept.length} clips scheduled</span>
          </div>
          <ul className={styles.schedule}>
            {kept.map((c) => {
              const n = clips.indexOf(c) + 1;
              const done = scheduled.has(c.id);
              return (
                <li key={c.id}>
                  <span className={styles.clipNum} style={{ background: c.color }}>{n}</span>
                  <span className={styles.clipText}>
                    <strong>{c.short}</strong>
                    <small>{postSlots(n - 1).map((s) => `${s.label} ${s.when}`).join(" · ")}</small>
                  </span>
                  {done ? (
                    <PostStatus clip={c} notify={notify} />
                  ) : (
                    <>
                      <button type="button" className={base.mini} onClick={() => { pickClip(c.id); setStep(3); }}>Review captions</button>
                      <button type="button" className={base.miniDark} onClick={() => schedule(c)}>Approve</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={styles.foot}>
            <span className={styles.note}>Scheduled posts appear in your calendar and go out at these times.</span>
            <Link className={base.btnGhost} href={`/dashboard/calendar?date=${postSlots(0)[0].date}`}>Open calendar →</Link>
          </div>
        </section>
      )}
    </>
  );
}
