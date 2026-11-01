import { createWriteStream } from "fs";
import { once } from "events";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, features } from "../config/env";
import { AppError } from "../utils/AppError";

// Supabase Storage for uploaded videos, contracts and cut clips. Files live
// in one private bucket under the owner's id ("<user id>/videos/..."), and
// the browser only ever gets short-lived signed URLs for its own paths.
// Needs SUPABASE_SERVICE_ROLE_KEY, which never leaves this server.

let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!features.storage) throw new AppError(503, "STORAGE_NOT_CONFIGURED", "File uploads aren't set up on this server yet (add SUPABASE_SERVICE_ROLE_KEY).");
  if (!admin) admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

const bucket = () => supabaseAdmin().storage.from(env.STORAGE_BUCKET);

// Creates the bucket on first use (private, so nothing is public).
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const client = supabaseAdmin();
  const { data } = await client.storage.getBucket(env.STORAGE_BUCKET);
  if (!data) {
    const { error } = await client.storage.createBucket(env.STORAGE_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(`storage bucket: ${error.message}`);
  }
  bucketReady = true;
}

export const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80) || "file";

export async function signedUpload(path: string) {
  await ensureBucket();
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`signed upload: ${error?.message}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function signedDownload(path: string, expiresInSec = 3600, download?: string) {
  const { data, error } = await bucket().createSignedUrl(path, expiresInSec, download ? { download } : undefined);
  if (error || !data) throw new Error(`signed download: ${error?.message}`);
  return data.signedUrl;
}

// Downloads a stored file to a local path (ffmpeg then reads it from disk:
// the bundled static ffmpeg can't look up host names, so it never gets URLs).
export async function downloadToFile(path: string, dest: string, onProgress?: (fraction: number) => void) {
  const response = await fetch(await signedDownload(path, 3600));
  if (!response.ok || !response.body) throw new Error(`couldn't read the upload (${response.status})`);
  const total = Number(response.headers.get("content-length") ?? 0);
  let done = 0;
  const out = createWriteStream(dest);
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      done += value.byteLength;
      if (!out.write(value)) await once(out, "drain");
      if (total > 0) onProgress?.(Math.min(1, done / total));
    }
  } finally {
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  }
  return done;
}

export async function fileInfo(path: string): Promise<{ size: number; mimeType: string } | null> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await bucket().list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  if (error) throw new Error(`storage list: ${error.message}`);
  const file = data?.find((f) => f.name === path.slice(slash + 1));
  if (!file) return null;
  const meta = (file.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: meta.size ?? 0, mimeType: meta.mimetype ?? "application/octet-stream" };
}

export async function uploadFile(path: string, bytes: Uint8Array, contentType: string) {
  await ensureBucket();
  const { error } = await bucket().upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);
}

// Deletes everything under a prefix ("<user id>/"), page by page.
export async function removePrefix(prefix: string) {
  const client = supabaseAdmin();
  const walk = async (dir: string): Promise<string[]> => {
    const { data, error } = await client.storage.from(env.STORAGE_BUCKET).list(dir, { limit: 1000 });
    if (error || !data) return [];
    const out: string[] = [];
    for (const item of data) {
      const full = `${dir}/${item.name}`;
      if (item.id === null) out.push(...(await walk(full)));
      else out.push(full);
    }
    return out;
  };
  const paths = await walk(prefix.replace(/\/$/, ""));
  for (let i = 0; i < paths.length; i += 100) await bucket().remove(paths.slice(i, i + 100));
}
