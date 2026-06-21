import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Append a static branded "end-card" (the client's image) onto a generated
 * horse video using ffmpeg.
 *
 * ffmpeg is NOT available by default in serverless environments (e.g. Vercel
 * functions). The binary path is configurable via FFMPEG_PATH; if ffmpeg is
 * missing or fails, callers should fall back to the raw horse video URL.
 */

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export class FfmpegUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FfmpegUnavailableError";
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(
          new FfmpegUnavailableError(
            `ffmpeg not found (tried "${cmd}"). Set FFMPEG_PATH or skip the end-card.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

export interface EndCardOptions {
  /** URL of the generated horse video (from PixVerse). */
  horseVideoUrl: string;
  /** Bytes of the client's end-card image. */
  endCardImage: Buffer;
  endCardImageName: string;
  /** Seconds the end-card stays on screen. */
  endCardSeconds?: number;
  /** Absolute path to write the final mp4. */
  outputPath: string;
}

/**
 * Produces a single mp4: [horse clip][client end-card] and writes it to
 * outputPath. Throws FfmpegUnavailableError if ffmpeg can't run, so the caller
 * can degrade to returning horseVideoUrl directly.
 */
export async function appendEndCard(opts: EndCardOptions): Promise<string> {
  const { horseVideoUrl, endCardImage, endCardImageName, outputPath } = opts;
  const seconds = opts.endCardSeconds ?? 2;

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "horse-ad-"));
  const horsePath = path.join(work, "horse.mp4");
  const imgExt = path.extname(endCardImageName) || ".png";
  const imgPath = path.join(work, `endcard${imgExt}`);
  const cardClip = path.join(work, "endcard.mp4");
  const listFile = path.join(work, `concat-${randomUUID()}.txt`);

  try {
    await download(horseVideoUrl, horsePath);
    await fs.writeFile(imgPath, endCardImage);

    // Build the end-card as a video clip that matches the horse clip's
    // resolution/fps/SAR so concat works without re-encoding surprises.
    await run(FFMPEG, [
      "-y",
      "-loop", "1",
      "-i", imgPath,
      "-f", "lavfi",
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-t", String(seconds),
      "-vf",
      // Scale to fit even dimensions; pad to keep aspect ratio on a black bg.
      "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-c:a", "aac",
      "-shortest",
      cardClip,
    ]);

    await fs.writeFile(
      listFile,
      `file '${horsePath.replace(/\\/g, "/")}'\nfile '${cardClip.replace(/\\/g, "/")}'\n`,
    );

    // Re-encode on concat to avoid codec/timebase mismatches between sources.
    await run(FFMPEG, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      outputPath,
    ]);

    return outputPath;
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
