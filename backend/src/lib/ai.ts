import type { z } from "zod";
import { env, features } from "../config/env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

// The one place the API talks to an AI model. Gemini (REST) is tried first;
// when it is missing or fails, Groq (OpenAI-compatible) takes over for text
// and tools. Embeddings and file input (PDF, video) need Gemini.

const GEMINI = "https://generativelanguage.googleapis.com";
const GROQ = "https://api.groq.com/openai/v1";
export const EMBEDDING_DIMENSIONS = 768;

export class AiUnavailableError extends AppError {
  constructor(message = "AI features aren't set up on this server yet (add GEMINI_API_KEY or GROQ_API_KEY).", code = "AI_NOT_CONFIGURED") {
    super(503, code, message);
  }
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };

export interface GenerateOptions {
  system?: string;
  prompt: string | Part[];
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
}

export interface Tool {
  name: string;
  description: string;
  // JSON Schema for the arguments (type "object").
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

class ProviderError extends Error {
  constructor(
    public readonly provider: "gemini" | "groq",
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const parts = (prompt: string | Part[]): Part[] => (typeof prompt === "string" ? [{ text: prompt }] : prompt);
const hasFiles = (prompt: string | Part[]) => parts(prompt).some((p) => !("text" in p));
const textOf = (prompt: string | Part[]) => parts(prompt).map((p) => ("text" in p ? p.text : "")).join("\n");

async function post<T>(provider: "gemini" | "groq", url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ProviderError(provider, 0, err instanceof Error ? err.message : "network error");
  }
  const text = await response.text();
  if (!response.ok) throw new ProviderError(provider, response.status, text.slice(0, 300));
  return JSON.parse(text) as T;
}

// ── Gemini ──────────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

async function gemini(contents: GeminiContent[], opts: { system?: string; temperature?: number; json?: boolean; tools?: Tool[]; timeoutMs: number }) {
  const body = {
    contents,
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    ...(opts.tools?.length ? { tools: [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] } : {}),
    generationConfig: { temperature: opts.temperature ?? 0.4, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
  };
  const data = await post<GeminiResponse>("gemini", `${GEMINI}/v1beta/models/${env.GEMINI_MODEL}:generateContent`, body, { "x-goog-api-key": env.GEMINI_API_KEY! }, opts.timeoutMs);
  const content = data.candidates?.[0]?.content;
  if (!content) throw new ProviderError("gemini", 200, data.promptFeedback?.blockReason ? `blocked: ${data.promptFeedback.blockReason}` : "empty response");
  return content;
}

const geminiText = (content: GeminiContent) =>
  content.parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();

// ── Groq ────────────────────────────────────────────────────────────────────

type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface GroqResponse {
  choices?: { message: { content: string | null; tool_calls?: GroqToolCall[] } }[];
}

async function groq(messages: GroqMessage[], opts: { temperature?: number; json?: boolean; tools?: Tool[]; timeoutMs: number }) {
  const body = {
    model: env.GROQ_MODEL,
    messages,
    temperature: opts.temperature ?? 0.4,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(opts.tools?.length ? { tools: opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
  };
  const data = await post<GroqResponse>("groq", `${GROQ}/chat/completions`, body, { Authorization: `Bearer ${env.GROQ_API_KEY}` }, opts.timeoutMs);
  const message = data.choices?.[0]?.message;
  if (!message) throw new ProviderError("groq", 200, "empty response");
  return message;
}

// ── Public API ──────────────────────────────────────────────────────────────

function unavailable(errors: ProviderError[]): never {
  for (const e of errors) logger.warn("ai provider failed", { provider: e.provider, status: e.status, error: e.message });
  throw new AiUnavailableError("The AI service didn't answer. Try again in a minute.", "AI_UNAVAILABLE");
}

// Plain text (or JSON text with `json`), with the Gemini → Groq fallback.
export async function generateText(opts: GenerateOptions): Promise<string> {
  if (!features.ai) throw new AiUnavailableError();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const errors: ProviderError[] = [];
  if (env.GEMINI_API_KEY) {
    try {
      const content = await gemini([{ role: "user", parts: parts(opts.prompt) as GeminiPart[] }], { ...opts, timeoutMs });
      const text = geminiText(content);
      if (text) return text;
      throw new ProviderError("gemini", 200, "no text in response");
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      errors.push(err);
    }
  }
  if (env.GROQ_API_KEY && !hasFiles(opts.prompt)) {
    try {
      const messages: GroqMessage[] = [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []), { role: "user", content: textOf(opts.prompt) }];
      const message = await groq(messages, { ...opts, timeoutMs });
      if (message.content?.trim()) return message.content.trim();
      throw new ProviderError("groq", 200, "no text in response");
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      errors.push(err);
    }
  }
  if (errors.length === 0) throw new AiUnavailableError("Reading files needs GEMINI_API_KEY on this server.");
  return unavailable(errors);
}

export function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

// JSON validated against a Zod schema. One retry when the model's answer
// doesn't parse or doesn't match.
export async function generateJson<T>(opts: GenerateOptions, schema: z.ZodType<T>): Promise<T> {
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateText({ ...opts, json: true, prompt: attempt === 0 ? opts.prompt : [...parts(opts.prompt), { text: `\n\nYour last answer was not valid (${lastProblem}). Reply with JSON only, matching the format exactly.` }] });
    try {
      const result = schema.safeParse(parseJson(text));
      if (result.success) return result.data;
      lastProblem = result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastProblem = "not JSON";
    }
  }
  logger.warn("ai returned invalid json twice", { problem: lastProblem });
  throw new AiUnavailableError("The AI service gave an answer we couldn't use. Try again.", "AI_BAD_RESPONSE");
}

// A conversation where the model may call tools (our own services) before
// answering. Up to `maxSteps` rounds of tool calls.
export async function runWithTools(opts: { system: string; turns: ChatTurn[]; tools: Tool[]; maxSteps?: number }): Promise<string> {
  if (!features.ai) throw new AiUnavailableError();
  const maxSteps = opts.maxSteps ?? 5;
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = byName.get(name);
    if (!tool) return { error: `unknown tool ${name}` };
    try {
      return await tool.run(args);
    } catch (err) {
      logger.warn("copilot tool failed", { tool: name, error: err instanceof Error ? err.message : String(err) });
      return { error: "tool failed" };
    }
  };
  const errors: ProviderError[] = [];

  if (env.GEMINI_API_KEY) {
    try {
      const contents: GeminiContent[] = opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
      for (let step = 0; step <= maxSteps; step++) {
        const content = await gemini(contents, { system: opts.system, tools: step < maxSteps ? opts.tools : undefined, timeoutMs: 60_000, temperature: 0.2 });
        const calls = content.parts.filter((p) => p.functionCall);
        if (calls.length === 0) {
          const text = geminiText(content);
          if (text) return text;
          throw new ProviderError("gemini", 200, "no text in response");
        }
        contents.push(content);
        const responses: GeminiPart[] = [];
        for (const p of calls) {
          const result = await call(p.functionCall!.name, p.functionCall!.args ?? {});
          responses.push({ functionResponse: { name: p.functionCall!.name, response: { result } } });
        }
        contents.push({ role: "user", parts: responses });
      }
      throw new ProviderError("gemini", 200, "too many tool calls");
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      errors.push(err);
    }
  }

  if (env.GROQ_API_KEY) {
    try {
      const messages: GroqMessage[] = [{ role: "system", content: opts.system }, ...opts.turns.map((t) => (t.role === "user" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: t.text }))];
      for (let step = 0; step <= maxSteps; step++) {
        const message = await groq(messages, { tools: step < maxSteps ? opts.tools : undefined, timeoutMs: 60_000, temperature: 0.2 });
        if (!message.tool_calls?.length) {
          if (message.content?.trim()) return message.content.trim();
          throw new ProviderError("groq", 200, "no text in response");
        }
        messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });
        for (const tc of message.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            // Bad arguments: the tool runs with none and says what it can.
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(await call(tc.function.name, args)) });
        }
      }
      throw new ProviderError("groq", 200, "too many tool calls");
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      errors.push(err);
    }
  }
  return unavailable(errors);
}

// Embeddings for RAG (Gemini only; Groq has no embeddings API). Vectors are
// L2-normalised, as Gemini recommends below its full 3072 dimensions.
export async function embed(texts: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  if (!features.embeddings) throw new AiUnavailableError("Search embeddings need GEMINI_API_KEY on this server.");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const data = await post<{ embeddings?: { values: number[] }[] }>(
      "gemini",
      `${GEMINI}/v1beta/models/${env.GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
      { requests: batch.map((text) => ({ model: `models/${env.GEMINI_EMBEDDING_MODEL}`, content: { parts: [{ text }] }, taskType: task, outputDimensionality: EMBEDDING_DIMENSIONS })) },
      { "x-goog-api-key": env.GEMINI_API_KEY! },
      60_000,
    ).catch((err: unknown) => {
      if (err instanceof ProviderError) unavailable([err]);
      throw err;
    });
    if (!data.embeddings || data.embeddings.length !== batch.length) unavailable([new ProviderError("gemini", 200, "embedding count mismatch")]);
    for (const e of data.embeddings) {
      const norm = Math.sqrt(e.values.reduce((s, v) => s + v * v, 0)) || 1;
      out.push(e.values.map((v) => v / norm));
    }
  }
  return out;
}

// Uploads a file to the Gemini Files API (for video, which is too large to
// send inline) and waits until Gemini has processed it.
export async function uploadGeminiFile(stream: ReadableStream<Uint8Array> | Uint8Array, size: number, mimeType: string, displayName: string): Promise<{ uri: string; mimeType: string; name: string }> {
  if (!env.GEMINI_API_KEY) throw new AiUnavailableError("Processing video needs GEMINI_API_KEY on this server.");
  const start = await fetch(`${GEMINI}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": env.GEMINI_API_KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`gemini file upload start failed: ${start.status}`);

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Length": String(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: stream as RequestInit["body"],
    // Node needs this to send a stream as the body.
    ...({ duplex: "half" } as object),
  });
  if (!upload.ok) throw new Error(`gemini file upload failed: ${upload.status}`);
  let file = ((await upload.json()) as { file: { name: string; uri: string; mimeType: string; state: string } }).file;

  for (let i = 0; file.state === "PROCESSING" && i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const res = await fetch(`${GEMINI}/v1beta/${file.name}`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    if (!res.ok) throw new Error(`gemini file status failed: ${res.status}`);
    file = (await res.json()) as typeof file;
  }
  if (file.state !== "ACTIVE") throw new Error(`gemini file ended in state ${file.state}`);
  return { uri: file.uri, mimeType: file.mimeType, name: file.name };
}
