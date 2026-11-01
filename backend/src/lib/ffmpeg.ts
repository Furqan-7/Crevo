import { spawn } from "child_process";
import { existsSync } from "fs";

// ffmpeg for reading a video's length and size, and cutting clips. Uses
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

function run(args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
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

// Cuts [start, end] into an MP4 (H.264/AAC), re-encoding so the cut is exact.
export async function cutClip(input: string, startSec: number, endSec: number, output: string) {
  const { code, stderr } = await run(
    ["-hide_banner", "-y", "-ss", String(startSec), "-i", input, "-t", String(endSec - startSec), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output],
    10 * 60_000,
  );
  if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-300)}`);
}
