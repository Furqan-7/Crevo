import { spawn } from "child_process";
import { existsSync } from "fs";

// ffmpeg for reading a video's length and size, and rendering vertical shorts. Uses
// the binary from ffmpeg-static, or a system ffmpeg when that's missing.

function binary(): string {
  try {
    const path = require("ffmpeg-static") as string | null;
    if (path && existsSync(path)) return path;
  } catch {
    // Not installed: fall through.
  }
  return "ffmpeg";
}

function run(args: string[], timeoutMs: number, onStdout?: (text: string) => void): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(), args, { stdio: ["ignore", onStdout ? "pipe" : "ignore", "pipe"] });
    if (onStdout) child.stdout!.on("data", (d: Buffer) => onStdout(d.toString()));
    let stderr = "";
    child.stderr!.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-20_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

// Length in seconds and frame size, read from ffmpeg's stream summary.
export async function probe(input: string): Promise<{ durationSec: number; width: number | null; height: number | null }> {
  const { stderr } = await run(["-hide_banner", "-i", input], 60_000);
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!d) throw new Error("couldn't read the video's length");
  const size = stderr.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  return {
    durationSec: Math.round(Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])),
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
  };
}

// "1080p" from the shorter side (vertical video is still 1080p).
export const qualityLabel = (w: number | null, h: number | null) => (w && h ? `${Math.min(w, h)}p` : "");

// ── Vertical shorts ─────────────────────────────────────────────────────────

export interface FocusPoint {
  // Seconds into the source video, and where the subject is across the frame
  // (0 = left edge, 1 = right edge).
  sec: number;
  x: number;
}

const OUT_W = 1080;
const OUT_H = 1920;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const num = (n: number) => (Math.round(n * 10_000) / 10_000).toString();

// Keyframes for the camera, in clip time: inside the clip, smoothed so the
// frame glides instead of twitching, and with tiny moves dropped.
export function cameraPath(focus: FocusPoint[] | null | undefined, startSec: number, durationSec: number): { t: number; x: number }[] {
  const points = (focus ?? [])
    .filter((p) => Number.isFinite(p.sec) && Number.isFinite(p.x))
    .map((p) => ({ t: p.sec - startSec, x: clamp01(p.x) }))
    .filter((p) => p.t >= -1 && p.t <= durationSec + 1)
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return [{ t: 0, x: 0.5 }];
  // Light moving average against jitter in the model's estimates.
  const smooth = points.map((p, i) => {
    const near = points.slice(Math.max(0, i - 1), i + 2);
    return { t: Math.min(durationSec, Math.max(0, p.t)), x: near.reduce((s, q) => s + q.x, 0) / near.length };
  });
  const out: { t: number; x: number }[] = [];
  for (const p of smooth) {
    const last = out.at(-1);
    if (last && p.t - last.t < 0.75) continue; // at most ~one move per 3/4 s
    if (last && Math.abs(p.x - last.x) < 0.03) continue; // hold still for small shifts
    out.push(p);
  }
  if (out[0]!.t > 0) out.unshift({ t: 0, x: out[0]!.x });
  return out.slice(0, 40);
}

// An ffmpeg expression for the subject's x (0-1) at clip time t: eased
// (smoothstep) between keyframes, so each move starts and stops gently.
export function focusExpression(path: { t: number; x: number }[]): string {
  if (path.length === 1) return num(path[0]!.x);
  let expr = num(path.at(-1)!.x);
  for (let i = path.length - 2; i >= 0; i--) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const span = Math.max(0.01, b.t - a.t);
    const p = `((t-${num(a.t)})/${num(span)})`;
    expr = `if(lt(t,${num(b.t)}),${num(a.x)}+(${num(b.x - a.x)})*${p}*${p}*(3-2*${p}),${expr})`;
  }
  return `if(lt(t,${num(path[0]!.t)}),${num(path[0]!.x)},${expr})`;
}

// Cuts [start, end] into a 1080x1920 vertical short (H.264/AAC). Wide video
// is cropped to 9:16 with the frame following the subject (focus), plus a
// slow push-in; tall or square video is fitted. Reports progress 0-1.
export async function renderShort(opts: {
  input: string;
  startSec: number;
  endSec: number;
  width: number | null;
  height: number | null;
  focus?: FocusPoint[] | null;
  output: string;
  onProgress?: (fraction: number) => void;
}) {
  const duration = Math.max(1, opts.endSec - opts.startSec);
  const wide = !opts.width || !opts.height || (opts.width * OUT_H) / opts.height >= OUT_W;
  // A 6% push-in over the clip keeps a static shot alive.
  const zoom = `(1+0.06*t/${num(duration)})`;
  const filter = wide
    ? [
        `scale=w='trunc(iw*${OUT_H}/ih*${zoom}/2)*2':h='trunc(${OUT_H}*${zoom}/2)*2':eval=frame`,
        `crop=${OUT_W}:${OUT_H}:x='max(0,min(iw-${OUT_W},(${focusExpression(cameraPath(opts.focus, opts.startSec, duration))})*iw-${OUT_W / 2}))':y='(ih-${OUT_H})/2'`,
        "setsar=1",
      ].join(",")
    : // Taller than 9:16: fill the width and crop the middle; never letterbox.
      `scale=${OUT_W}:-2,crop=${OUT_W}:'min(ih,${OUT_H})',pad=${OUT_W}:${OUT_H}:0:'(oh-ih)/2':color=black,setsar=1`;

  let buffer = "";
  const { code, stderr } = await run(
    [
      "-hide_banner", "-y", "-nostats", "-progress", "pipe:1",
      "-ss", String(opts.startSec), "-i", opts.input, "-t", String(duration),
      "-vf", filter, "-r", "30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-ac", "2",
      "-movflags", "+faststart", opts.output,
    ],
    20 * 60_000,
    (text) => {
      buffer = (buffer + text).slice(-2_000);
      const done = [...buffer.matchAll(/out_time_us=(\d+)/g)].at(-1);
      if (done && opts.onProgress) opts.onProgress(Math.min(1, Number(done[1]) / 1e6 / duration));
    },
  );
  if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-300)}`);
  opts.onProgress?.(1);
}
