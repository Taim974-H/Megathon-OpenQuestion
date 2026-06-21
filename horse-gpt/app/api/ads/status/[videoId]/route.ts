import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { readClientAsset } from "@/lib/clients";
import {
  getVideoResult,
  PixverseError,
  PIXVERSE_STATUS,
} from "@/lib/pixverse";
import { appendEndCard, FfmpegUnavailableError } from "@/lib/video-endcard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Poll the status of an ad generation and, once PixVerse is done, stitch the
 * client's end-card onto the horse clip. Proxies PixVerse so the API key never
 * reaches the browser.
 *
 * GET /api/ads/status/<videoId>?clientId=<id>&endCardAsset=<file>
 *
 * Response shapes:
 *   { status: "processing" }
 *   { status: "ready", url, endCard: true|false }   // url is app-relative or PixVerse
 *   { status: "failed", error }
 */

const ADS_DIR = path.join(process.cwd(), "public", "horse_media", "ads");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const { videoId: videoIdRaw } = await params;
    const videoId = Number(videoIdRaw);
    if (!Number.isInteger(videoId) || videoId <= 0) {
      return NextResponse.json({ error: "Invalid videoId." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") ?? "";
    const endCardAsset = searchParams.get("endCardAsset") ?? "";

    const result = await getVideoResult(videoId);

    if (result.status === PIXVERSE_STATUS.IN_PROGRESS) {
      return NextResponse.json({ status: "processing" });
    }
    if (result.status === PIXVERSE_STATUS.MODERATION_FAILED) {
      return NextResponse.json(
        { status: "failed", error: "Rejected by content moderation." },
        { status: 200 },
      );
    }
    if (result.status === PIXVERSE_STATUS.GENERATION_FAILED || !result.url) {
      return NextResponse.json(
        { status: "failed", error: "Generation failed." },
        { status: 200 },
      );
    }

    // Horse video is ready. Try to append the client's end-card.
    if (clientId && endCardAsset) {
      try {
        const endCardImage = await readClientAsset(clientId, endCardAsset);
        await fs.mkdir(ADS_DIR, { recursive: true });
        const outName = `ad-${clientId}-${videoId}.mp4`;
        const outPath = path.join(ADS_DIR, outName);

        await appendEndCard({
          horseVideoUrl: result.url,
          endCardImage,
          endCardImageName: endCardAsset,
          outputPath: outPath,
        });

        return NextResponse.json({
          status: "ready",
          url: `/horse_media/ads/${outName}`,
          endCard: true,
        });
      } catch (err) {
        // ffmpeg missing (e.g. Vercel) or compositing failed: fall back to the
        // raw horse video so the flow still returns something usable.
        if (!(err instanceof FfmpegUnavailableError)) {
          console.error("End-card compositing failed:", err);
        }
        return NextResponse.json({
          status: "ready",
          url: result.url,
          endCard: false,
        });
      }
    }

    // No end-card requested: return the horse video directly.
    return NextResponse.json({ status: "ready", url: result.url, endCard: false });
  } catch (error) {
    if (error instanceof PixverseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to check status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
