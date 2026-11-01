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
import { MINUTES_SAVED_PER_CLIP, TODAY_ISO, addDays, clock, dayLabel, localParts, postSlots, publishPlatforms, type Clip, type PostSlot, type PublishPlatform, type Video } from "../../data";

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

// An upload of the creator's own video. progress: the file upload's %
// while uploading, then the server's processing % (and stage).
type RealUpload = { name: string; progress: number; phase: "uploading" | "transcribing"; stage?: string; videoId?: string } | null;

// One bar for the whole job: the upload is the first 15%, processing
// (transcript, clips, captions, vertical shorts) the rest.
const overall = (u: NonNullable<RealUpload>) => Math.round(u.phase === "uploading" ? u.progress * 0.15 : 15 + u.progress * 0.85);

function UploadProgress({ upload }: { upload: NonNullable<RealUpload> }) {
  const percent = overall(upload);
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.progressHead}>
        <strong>{upload.phase === "uploading" ? `Uploading ${upload.name}` : upload.stage || "Processing your video"}</strong>
        <span className={styles.percent}>{percent}%</span>
      </div>
      <span className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Progress">
        <i style={{ width: `${Math.max(2, percent)}%` }} />
      </span>
      <ol className={styles.stages}>
        {PROGRESS_STAGES.map((st) => {
          const state = percent >= st.until ? "done" : percent >= st.from ? "now" : "next";
          return (
            <li key={st.label} className={cx(state === "done" && styles.stageDone, state === "now" && styles.stageNow)}>
              <span aria-hidden="true">{state === "done" ? "✓" : state === "now" ? "•" : ""}</span>
              {st.label}
            </li>
          );
        })}
      </ol>
      <small>{upload.phase === "uploading" ? "Keep this tab open until the upload finishes." : "This takes a few minutes. You can leave this page; it keeps going."}</small>
    </div>
  );
}

// The stages, by where they sit on the overall bar (see overall()).
const PROGRESS_STAGES = [
  { label: "Upload", from: 0, until: 15 },
  { label: "Send to the AI", from: 15, until: 40 },
  { label: "Transcript and best moments", from: 40, until: 71 },
  { label: "Captions", from: 71, until: 74 },
  { label: "Vertical shorts", from: 74, until: 100 },
];

function useVideoUpload(onReady: () => void) {
  const { notify, integrations, pendingVideo, refreshVideo } = useShell();
  const [realUpload, setRealUpload] = useState<RealUpload>(
    pendingVideo?.status === "processing" ? { name: pendingVideo.fileName, progress: pendingVideo.progress, stage: pendingVideo.stage, phase: "transcribing", videoId: pendingVideo.id } : null,
  );
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const id = realUpload?.videoId;
    if (!id) return;
    const timer = setInterval(async () => {
      const v = await api.video(id).catch(() => null);
      if (!v) return;
      if (v.status === "processing" || v.status === "uploading") {
        setRealUpload((u) => (u && u.videoId === id ? { ...u, progress: v.progress, stage: v.stage } : u));
        return;
      }
      clearInterval(timer);
      setRealUpload(null);
      if (v.status === "ready") {
        await refreshVideo();
        ready.current();
        const made = v.clips.filter((c) => c.render.status === "ready").length;
        notify(`${v.fileName}: ${v.clips.length} clips found${made ? `, ${made} vertical ${made === 1 ? "short" : "shorts"} ready` : ""}`);
      } else {
        notify(`${v.fileName} couldn't be processed${v.error ? `: ${v.error}` : ""}`);
      }
    }, 2000);
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
      const started = await api.processVideo(target.videoId);
      setRealUpload({ name: file.name, progress: started.progress, stage: started.stage, phase: "transcribing", videoId: target.videoId });
    } catch (err) {
      setRealUpload(null);
      notify(err instanceof ApiError ? err.message : "The upload didn't finish. Try again.");
    }
  }
  return { realUpload, uploadFile };
}

// The clip's vertical 9:16 short: a player once it's rendered, progress
// while it renders, and a retry if it failed.
function ShortPreview({ clip, number, notify, onRetry }: { clip: Clip; number: number; notify: (text: string) => void; onRetry: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const ready = clip.render.status === "ready" && !clip.render.stale;
  useEffect(() => {
    setUrl(null);
    if (!ready) return;
    let live = true;
    api.clipShort(clip.id).then((r) => live && setUrl(r.url)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [clip.id, ready, clip.startSec, clip.endSec]);

  async function download() {
    try {
      window.location.href = (await api.clipShort(clip.id, true)).url;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Couldn't download the short. Try again.");
    }
  }

  return (
    <div className={styles.shortWrap}>
      <div className={styles.shortFrame}>
        {ready && url ? (
          <video key={url} className={styles.shortVideo} src={url} controls playsInline preload="metadata" aria-label={`Vertical short for clip ${number}`} />
        ) : clip.render.status === "failed" ? (
          <div className={styles.shortState}>
            <strong>This short didn&apos;t render</strong>
            <small>{clip.render.error ?? "Something went wrong."}</small>
            <button type="button" className={base.miniDark} onClick={onRetry}>Try again</button>
          </div>
        ) : (
          <div className={styles.shortState} role="status">
            <strong>{clip.render.stale ? "Updating after your trim" : "Making the vertical short"}</strong>
            <span className={styles.shortPercent}>{ready ? "…" : `${clip.render.progress}%`}</span>
            <span className={styles.bar}><i style={{ width: `${Math.max(3, ready ? 100 : clip.render.progress)}%` }} /></span>
            <small>9:16, following the speaker</small>
          </div>
        )}
      </div>
      <div className={styles.shortInfo}>
        <strong>Clip {number} · vertical short</strong>
        <small>{mmss(clip.startSec)} – {mmss(clip.endSec)} · {clip.endSec - clip.startSec}s · 1080×1920</small>
        <span className={styles.subtitleText}>“{clip.quote}”</span>
        <button type="button" className={base.btnLine} onClick={download} disabled={!ready}>Download short</button>
      </div>
    </div>
  );
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
      {realUpload ? (
        <section className={cx(styles.card, styles.single)} aria-label="Upload progress">
          <UploadProgress upload={realUpload} />
        </section>
      ) : (
        <EmptyState
          title="No video yet"
          color={YELLOW}
          pattern={PATTERNS.publish}
          action={<button type="button" className={base.btnDark} onClick={() => input.current?.click()}>Choose a video</button>}
        >
          MP4, MOV or WebM, up to 2 GB. Crevo turns it into vertical shorts with captions.
        </EmptyState>
      )}
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
  const { notify, scheduledClips: scheduled, scheduleClip, updateClip, updateCaption, rewriteCaption, integrations, refreshVideo } = useShell();
  const { clips, transcript } = video;
  const TICKS = ["0:00", mmss(video.lengthSec / 4), mmss(video.lengthSec / 2), mmss((video.lengthSec * 3) / 4), video.length];
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(3);
  const [reached, setReached] = useState(3);
  const [upload, setUpload] = useState<Upload>(null);
  const { realUpload, uploadFile: startRealUpload } = useVideoUpload(() => {
    setStep(1);
    setReached(1);
  });
  // The progress shows on the Upload step, so go there when one starts.
  const uploadFile = (file: File) => {
    setStep(0);
    void startRealUpload(file);
  };
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
  // Times the creator picked instead of the suggested ones, per clip.
  const [picked, setPicked] = useState<Record<string, Partial<Record<PublishPlatform, { date: string; minutes: number }>>>>({});

  // A clip's post times: what's saved once it's scheduled, otherwise the
  // suggested best times with any the creator changed.
  function slotsFor(c: Clip): PostSlot[] {
    const n = clips.indexOf(c);
    const now = localParts(new Date().toISOString());
    return postSlots(Math.max(0, n)).map((suggested) => {
      // A suggestion whose time has already passed today moves to tomorrow.
      const passed = suggested.date < now.iso || (suggested.date === now.iso && suggested.minutes <= now.minutes);
      const date = passed ? addDays(now.iso, 1) : suggested.date;
      const slot = passed ? { ...suggested, date, when: `${dayLabel(date)} ${clock(suggested.minutes)}` } : suggested;
      const saved = c.posts.find((p) => p.platform === slot.platform);
      const chosen = saved ? localParts(saved.scheduledAt) : picked[c.id]?.[slot.platform] ? { iso: picked[c.id]![slot.platform]!.date, minutes: picked[c.id]![slot.platform]!.minutes } : null;
      if (!chosen) return slot;
      const custom = !saved && Boolean(picked[c.id]?.[slot.platform]);
      return { ...slot, date: chosen.iso, minutes: chosen.minutes, when: `${dayLabel(chosen.iso)} ${clock(chosen.minutes)}`, why: custom ? "Picked by you" : slot.why };
    });
  }

  function pickTime(c: Clip, platform: PublishPlatform, date: string, minutes: number) {
    setPicked((all) => ({ ...all, [c.id]: { ...all[c.id], [platform]: { date, minutes } } }));
  }

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

  // While any short renders (after upload or a trim), refresh to show progress.
  const rendering = clips.some((c) => c.render.status === "rendering" || c.render.stale);
  useEffect(() => {
    if (!rendering) return;
    const t = setInterval(() => void refreshVideo().catch(() => undefined), 3000);
    return () => clearInterval(t);
  }, [rendering, refreshVideo]);
  const hasShorts = clips.some((c) => c.render.status !== "none");

  async function retryShort(c: Clip) {
    try {
      await api.renderClip(c.id);
      await refreshVideo();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Couldn't start the short. Try again.");
    }
  }

  const span = (c: Clip) => ({ start: c.startSec, end: c.endSec });
  const trimmed = (c: Clip) => c.startSec !== c.suggestedStartSec || c.endSec !== c.suggestedEndSec;
  const skipped = new Set(clips.filter((c) => c.skipped).map((c) => c.id));
  const kept = clips.filter((c) => !c.skipped);
  const clip = clips.find((c) => c.id === clipId) ?? clips[0];
  const clipNumber = clips.indexOf(clip) + 1;
  const slots = slotsFor(clip);
  // A post can't be scheduled in the past.
  const nowMinutes = localParts(new Date().toISOString()).minutes;
  const pastSlot = slots.find((t) => t.date < TODAY_ISO || (t.date === TODAY_ISO && t.minutes <= nowMinutes));
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
    const times = slotsFor(c);
    // Save a caption still being typed first; writes go out in order.
    (Object.entries(typed) as [CaptionKey, string][]).forEach(([k, text]) => {
      const [id, p] = k.split(":") as [string, PublishPlatform];
      updateCaption(id, p, { text });
    });
    setTyped({});
    scheduleClip(c.id, times.map((slot) => ({ platform: slot.platform, date: slot.date, minutes: slot.minutes, why: slot.why })));
    notify(`Clip ${n} scheduled: ${times.map((t) => `${t.label} ${t.when}`).join(", ")}`);
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

      {hasShorts ? (
        <ShortPreview clip={clip} number={clipNumber} notify={notify} onRetry={() => retryShort(clip)} />
      ) : (
        <button type="button" className={styles.player} onClick={() => notify(`The sample vlog has no video file. Upload your own video to get real vertical shorts.`)} aria-label={`Play clip ${clipNumber}`}>
          <span className={styles.play} aria-hidden="true" />
          <span className={styles.subtitle}>“{clip.quote}”</span>
        </button>
      )}

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
                {c.render.status === "rendering" && <span className={base.tag}>short {c.render.progress}%</span>}
                {c.render.status === "failed" && <span className={base.tag}>short failed</span>}
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
        lead={`${fileName} (${video.length}) became ${clips.length} ${clips.length === 1 ? "clip" : "clips"} with captions for every platform.`}
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
            <UploadProgress upload={realUpload} />
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
                    <span>{isScheduled ? "Scheduled for" : "When to post"}</span>
                    <span className={styles.counter}>{isScheduled ? "in your calendar" : "suggested from your last 30 days · change any time"}</span>
                  </div>
                  <div className={styles.times}>
                    {slots.map((t) => (
                      <div key={t.platform} className={cx(styles.time, t.platform === platform && styles.timeOn)}>
                        <strong>
                          <span className={styles.swatchSmall} style={{ background: publishPlatforms.find((p) => p.id === t.platform)!.swatch }} />
                          {t.label}
                        </strong>
                        {isScheduled ? (
                          <span className={base.mono}>{t.when}</span>
                        ) : (
                          <span className={styles.timeInputs}>
                            <input
                              type="date"
                              value={t.date}
                              min={TODAY_ISO}
                              onChange={(e) => e.target.value && pickTime(clip, t.platform, e.target.value, t.minutes)}
                              aria-label={`${t.label} date`}
                            />
                            <input
                              type="time"
                              value={`${String(Math.floor(t.minutes / 60)).padStart(2, "0")}:${String(t.minutes % 60).padStart(2, "0")}`}
                              onChange={(e) => {
                                const [h, m] = e.target.value.split(":").map(Number);
                                if (Number.isFinite(h) && Number.isFinite(m)) pickTime(clip, t.platform, t.date, h! * 60 + m!);
                              }}
                              aria-label={`${t.label} time`}
                            />
                          </span>
                        )}
                        <small>{t.why}</small>
                      </div>
                    ))}
                  </div>
                  {pastSlot && !isScheduled && <p className={styles.timeWarn} role="alert">{pastSlot.label} is set to a time that has passed. Pick a later time.</p>}

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
                        <button type="button" className={base.btnDark} onClick={() => schedule()} disabled={Boolean(pastSlot)}>Approve and schedule {slots.length} posts</button>
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
                    <small>{slotsFor(c).map((s) => `${s.label} ${s.when}`).join(" · ")}</small>
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
