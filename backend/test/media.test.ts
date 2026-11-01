import { json, on } from "./helpers/setup";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { uploadGeminiFile } from "../src/lib/ai";
import { cameraPath, focusExpression, probe, qualityLabel, renderShort } from "../src/lib/ffmpeg";

// ffmpeg on a real (generated) video, and the Gemini Files API upload.

describe("media", () => {
  const dir = mkdtempSync(join(tmpdir(), "crevo-test-"));
  const source = join(dir, "source.mp4");

  before(() => {
    const ffmpeg = (require("ffmpeg-static") as string | null) ?? "ffmpeg";
    const made = spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "6", "-c:v", "libx264", "-c:a", "aac", "-shortest", source]);
    assert.equal(made.status, 0, made.stderr?.toString().slice(-300));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a video's length and size", async () => {
    const meta = await probe(source);
    assert.equal(meta.durationSec, 6);
    assert.equal(qualityLabel(meta.width, meta.height), "240p");
  });

  it("renders an exact vertical 9:16 short that follows the subject, with progress", async () => {
    const out = join(dir, "short.mp4");
    const seen: number[] = [];
    await renderShort({ input: source, startSec: 1, endSec: 4, width: 320, height: 240, focus: [{ sec: 1, x: 0.2 }, { sec: 3, x: 0.8 }], output: out, onProgress: (f) => seen.push(f) });
    const made = await probe(out);
    assert.equal(made.durationSec, 3);
    assert.deepEqual([made.width, made.height], [1080, 1920]);
    assert.equal(seen.at(-1), 1, "reports it finished");
  });

  it("smooths the camera path and eases between points", () => {
    // Clip time, jitter under 3% held still, a point every 3/4 s at most.
    const path = cameraPath([{ sec: 10, x: 0.3 }, { sec: 10.2, x: 0.9 }, { sec: 12, x: 0.31 }, { sec: 14, x: 0.7 }], 10, 6);
    assert.equal(path[0]!.t, 0);
    assert.ok(path.every((p, i) => i === 0 || p.t - path[i - 1]!.t >= 0.75));
    assert.equal(cameraPath(null, 0, 5).length, 1, "no focus: hold the middle");
    assert.match(focusExpression([{ t: 0, x: 0.2 }, { t: 2, x: 0.8 }]), /3-2\*/, "smoothstep easing");
  });

  it("uploads a file to Gemini with the resumable protocol", async () => {
    on("POST", "https://generativelanguage.googleapis.com/upload/v1beta/files", (req) => {
      assert.equal(req.headers.get("x-goog-upload-command"), "start");
      assert.equal(req.headers.get("x-goog-upload-header-content-length"), "5");
      return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example.test/session-1" } });
    });
    on("POST", "https://upload.example.test/session-1", (req) => {
      assert.equal(req.headers.get("x-goog-upload-command"), "upload, finalize");
      return json({ file: { name: "files/abc", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc", mimeType: "video/mp4", state: "ACTIVE" } });
    });
    const file = await uploadGeminiFile(new Uint8Array([1, 2, 3, 4, 5]), 5, "video/mp4", "clip.mp4");
    assert.equal(file.uri, "https://generativelanguage.googleapis.com/v1beta/files/abc");
  });
});
