import { randomUUID } from "node:crypto";

/**
 * Minimal server-side client for the PixVerse Platform API (image-to-video).
 *
 * Docs: https://docs.platform.pixverse.ai/
 *   - Upload image:   POST /openapi/v2/image/upload       -> Resp.img_id
 *   - Generate video: POST /openapi/v2/video/img/generate -> Resp.video_id
 *   - Poll result:    GET  /openapi/v2/video/result/{id}  -> Resp.url + Resp.status
 *
 * The API key is read from PIXVERSE_API_KEY and must NEVER be exposed to the
 * browser. Only call this from server code (API routes / server actions).
 */

const PIXVERSE_BASE = "https://app-api.pixverse.ai/openapi/v2";

/** PixVerse generation status codes (from the result endpoint). */
export const PIXVERSE_STATUS = {
  SUCCESS: 1,
  IN_PROGRESS: 5,
  MODERATION_FAILED: 7,
  GENERATION_FAILED: 8,
} as const;

export type PixverseModel =
  | "v3.5"
  | "v4"
  | "v4.5"
  | "v5"
  | "v5.5"
  | "v5.6"
  | "v6"
  | "c1";

export type PixverseQuality = "360p" | "540p" | "720p" | "1080p";

export interface GenerateOptions {
  imgId: number;
  prompt: string;
  /** Defaults to v5.6. */
  model?: PixverseModel;
  /** Defaults to 720p. Note: 1080p restricts duration to 5s on most models. */
  quality?: PixverseQuality;
  /** Seconds. Allowed values depend on model (v5.6: 5/8/10). Defaults to 5. */
  duration?: number;
  /** Optional negative prompt. */
  negativePrompt?: string;
  seed?: number;
}

export interface PixverseResult {
  status: number;
  /** Final video URL — only populated when status === SUCCESS. */
  url: string | null;
}

class PixverseError extends Error {
  constructor(
    message: string,
    readonly errCode?: number,
  ) {
    super(message);
    this.name = "PixverseError";
  }
}

function getApiKey(): string {
  const key = process.env.PIXVERSE_API_KEY?.trim();
  if (!key) {
    throw new PixverseError(
      "PIXVERSE_API_KEY is not set. Add it to your environment (never commit it).",
    );
  }
  return key;
}

/** Each PixVerse request requires a unique Ai-trace-id. */
function baseHeaders(): Record<string, string> {
  return {
    "API-KEY": getApiKey(),
    "Ai-trace-id": randomUUID(),
  };
}

interface PixverseEnvelope<T> {
  ErrCode: number;
  ErrMsg: string;
  Resp: T;
}

async function parseEnvelope<T>(response: Response, context: string): Promise<T> {
  let json: PixverseEnvelope<T>;
  try {
    json = (await response.json()) as PixverseEnvelope<T>;
  } catch {
    throw new PixverseError(
      `${context}: PixVerse returned a non-JSON response (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || json.ErrCode !== 0) {
    throw new PixverseError(
      `${context} failed: ${json.ErrMsg || `HTTP ${response.status}`}`,
      json.ErrCode,
    );
  }

  return json.Resp;
}

/**
 * Upload an image and get back its numeric img_id, required for generation.
 * Accepts the raw bytes plus a filename + mime type.
 */
export async function uploadImage(
  bytes: Uint8Array | Buffer,
  filename: string,
  mimeType: string,
): Promise<number> {
  const form = new FormData();
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  form.append("image", blob, filename);

  const response = await fetch(`${PIXVERSE_BASE}/image/upload`, {
    method: "POST",
    headers: baseHeaders(), // do NOT set Content-Type; fetch sets the multipart boundary
    body: form,
  });

  const resp = await parseEnvelope<{ img_id: number; img_url?: string }>(
    response,
    "Image upload",
  );
  return resp.img_id;
}

/**
 * Kick off an image-to-video generation. Returns the video_id used for polling.
 */
export async function generateImageToVideo(
  options: GenerateOptions,
): Promise<number> {
  const body = {
    img_id: options.imgId,
    prompt: options.prompt,
    model: options.model ?? "v5.6",
    quality: options.quality ?? "720p",
    duration: options.duration ?? 5,
    ...(options.negativePrompt
      ? { negative_prompt: options.negativePrompt }
      : {}),
    ...(typeof options.seed === "number" ? { seed: options.seed } : {}),
  };

  const response = await fetch(`${PIXVERSE_BASE}/video/img/generate`, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const resp = await parseEnvelope<{ video_id: number }>(
    response,
    "Video generation",
  );
  return resp.video_id;
}

/** Fetch the current status (and URL when ready) for a generation. */
export async function getVideoResult(videoId: number): Promise<PixverseResult> {
  const response = await fetch(`${PIXVERSE_BASE}/video/result/${videoId}`, {
    method: "GET",
    headers: baseHeaders(),
  });

  const resp = await parseEnvelope<{ url?: string; status: number }>(
    response,
    "Video result",
  );
  return { status: resp.status, url: resp.url ?? null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until the generation succeeds or fails. Intended for server-side or
 * background use — for a browser flow, prefer returning the video_id and
 * polling the status route instead, so requests stay short.
 */
export async function pollUntilDone(
  videoId: number,
  { intervalMs = 5000, timeoutMs = 5 * 60_000 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { status, url } = await getVideoResult(videoId);

    if (status === PIXVERSE_STATUS.SUCCESS && url) return url;
    if (status === PIXVERSE_STATUS.MODERATION_FAILED) {
      throw new PixverseError("Generation rejected by content moderation.", 7);
    }
    if (status === PIXVERSE_STATUS.GENERATION_FAILED) {
      throw new PixverseError("Generation failed.", 8);
    }

    await sleep(intervalMs);
  }

  throw new PixverseError(`Timed out waiting for video ${videoId}.`);
}

export { PixverseError };
