import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ClientError,
  readClientAsset,
  requirePaidClient,
} from "@/lib/clients";
import {
  generateImageToVideo,
  PixverseError,
  uploadImage,
  type PixverseModel,
  type PixverseQuality,
} from "@/lib/pixverse";

export const runtime = "nodejs";
// Generation can take a few seconds to kick off; keep some headroom.
export const maxDuration = 60;

/**
 * Start an ad generation for a PAYING client.
 *
 * Pipeline (chosen approach: "animate horse, client image as end-card"):
 *   1. Verify the client has paid.
 *   2. Upload our brand horse image to PixVerse, get img_id.
 *   3. Start image-to-video on the horse with a branded prompt.
 *   4. Return { videoId, clientId, endCardAsset } — the browser then polls
 *      /api/ads/status/[videoId] which stitches the end-card when ready.
 *
 * Request JSON:
 *   {
 *     clientId: string,            // must match a paid private/clients/<id>
 *     endCardAsset: string,        // filename inside that client's folder
 *     prompt?: string,             // optional override for the horse animation
 *     model?, quality?, duration?  // optional PixVerse tuning
 *   }
 */

// Our brand horse base image, animated for every client's ad.
const HORSE_IMAGE = path.join(
  process.cwd(),
  "public",
  "horse_media",
  "horse_background.png",
);

const DEFAULT_PROMPT =
  "The cartoon horse mascot smiles and waves cheerfully at the camera, " +
  "gentle natural motion, lively and friendly, promotional advertisement vibe";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientId?: unknown;
      endCardAsset?: unknown;
      prompt?: unknown;
      model?: unknown;
      quality?: unknown;
      duration?: unknown;
    };

    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const endCardAsset =
      typeof body.endCardAsset === "string" ? body.endCardAsset : "";

    if (!clientId || !endCardAsset) {
      return NextResponse.json(
        { error: "clientId and endCardAsset are required." },
        { status: 400 },
      );
    }

    // 1. Payment gate + confirm the end-card asset belongs to this client.
    const client = await requirePaidClient(clientId);
    if (!client.assets.some((a) => a.file === endCardAsset)) {
      return NextResponse.json(
        { error: `Asset "${endCardAsset}" is not registered for this client.` },
        { status: 404 },
      );
    }
    // Touch the asset now so we fail fast if it's missing on disk.
    await readClientAsset(clientId, endCardAsset);

    // 2. Upload the horse base image.
    const horseBytes = await fs.readFile(HORSE_IMAGE);
    const imgId = await uploadImage(horseBytes, "horse.png", "image/png");

    // 3. Start generation.
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim().slice(0, 5000)
        : DEFAULT_PROMPT;

    const videoId = await generateImageToVideo({
      imgId,
      prompt,
      model: (body.model as PixverseModel) || undefined,
      quality: (body.quality as PixverseQuality) || undefined,
      duration:
        typeof body.duration === "number" ? body.duration : undefined,
    });

    return NextResponse.json({
      videoId,
      clientId,
      endCardAsset,
      status: "processing",
    });
  } catch (error) {
    if (error instanceof ClientError) {
      const status = error.kind === "payment_required" ? 402 : 404;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof PixverseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to start generation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
