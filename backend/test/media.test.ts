import { json, on } from "./helpers/setup";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { uploadGeminiFile } from "../src/lib/ai";
import { cutClip, probe, qualityLabel } from "../src/lib/ffmpeg";

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

  it("cuts an exact clip", async () => {
    const out = join(dir, "clip.mp4");
    await cutClip(source, 1, 4, out);
    assert.equal((await probe(out)).durationSec, 3);
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
