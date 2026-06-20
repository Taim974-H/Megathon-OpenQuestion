import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const START_URL = process.argv[2] ?? "https://free-sound-effects.net/horse";
const OUTPUT_DIR = path.resolve(process.cwd(), "horse_sound_collection");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const FORCE = process.argv.includes("--force");

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTags(rawTags) {
  return rawTags
    .split(",")
    .map((tag) => decodeHtml(tag.trim()))
    .filter(Boolean);
}

function buildName(title, tags, index, url) {
  const genericTitles = new Set([
    "animals,barnyard",
    "horse",
    "sports,racing",
  ]);
  const cleanTitle = decodeHtml(title.trim());
  const uniqueTags = [...new Set(tags)];
  const baseLabel = genericTitles.has(cleanTitle.toLowerCase())
    ? uniqueTags.join(" ")
    : cleanTitle;
  const fallbackLabel = baseLabel || uniqueTags.join(" ") || `horse-sound-${index + 1}`;
  const ext = path.extname(new URL(url).pathname) || ".mp3";
  const slug = slugify(fallbackLabel).slice(0, 80) || `horse-sound-${index + 1}`;

  return `${String(index + 1).padStart(3, "0")}-${slug}${ext}`;
}

function parseCards(html) {
  const cards = [];
  const cardPattern =
    /<button\s+[^>]*class="download-btn[\s\S]*?data-download="([^"]+)"[\s\S]*?data-title="([^"]*)"[\s\S]*?data-tags="([^"]*)"[\s\S]*?<\/button>/g;

  for (const match of html.matchAll(cardPattern)) {
    const [, downloadUrl, title, rawTags] = match;
    cards.push({
      url: decodeHtml(downloadUrl),
      title: decodeHtml(title),
      tags: parseTags(rawTags),
    });
  }

  return cards;
}

function isHorseEntry(entry) {
  const haystack = `${entry.title} ${entry.tags.join(" ")}`.toLowerCase();
  const includeTerms = [
    "horse",
    "hoof",
    "hoofbeat",
    "whinny",
    "neigh",
    "snort",
    "gallop",
    "trotting",
    "grunting",
    "rodeo",
    "ranch",
    "wagon",
    "cart",
    "buggy",
    "horse race",
  ];
  const excludeTerms = [
    "camel",
    "truck",
    "countdown",
    "synthesized",
    "sfx",
  ];

  return (
    includeTerms.some((term) => haystack.includes(term)) &&
    !excludeTerms.some((term) => haystack.includes(term))
  );
}

function parseNextPage(html, currentUrl) {
  const match = html.match(
    /<a\s+href="([^"]+)"[^>]*>\s*Next\s*&gt;\s*<\/a>/i,
  );

  if (!match) {
    return null;
  }

  return new URL(match[1], currentUrl).toString();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "HorseGPT downloader/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "HorseGPT downloader/1.0",
      referer: "https://free-sound-effects.net/horse",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectEntries(startUrl) {
  const allEntries = [];
  const seenPageUrls = new Set();
  const seenDownloadUrls = new Set();
  let pageUrl = startUrl;

  while (pageUrl && !seenPageUrls.has(pageUrl)) {
    seenPageUrls.add(pageUrl);
    const html = await fetchText(pageUrl);
    const entries = parseCards(html).filter(isHorseEntry);

    for (const entry of entries) {
      if (seenDownloadUrls.has(entry.url)) {
        continue;
      }
      seenDownloadUrls.add(entry.url);
      allEntries.push(entry);
    }

    pageUrl = parseNextPage(html, pageUrl);
  }

  return allEntries;
}

async function readExistingManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const existingManifest = await readExistingManifest();
  const existingByUrl = new Map(existingManifest.map((item) => [item.url, item]));
  const entries = await collectEntries(START_URL);
  const manifest = [];
  let downloaded = 0;
  let reused = 0;

  for (const [index, entry] of entries.entries()) {
    const existing = existingByUrl.get(entry.url);
    const fileName = existing?.fileName ?? buildName(entry.title, entry.tags, index, entry.url);
    const filePath = path.join(OUTPUT_DIR, fileName);

    if (!FORCE && (await fileExists(filePath))) {
      reused += 1;
    } else {
      const bytes = await fetchBuffer(entry.url);
      await writeFile(filePath, bytes);
      downloaded += 1;
    }

    manifest.push({
      fileName,
      title: entry.title,
      tags: entry.tags,
      url: entry.url,
    });
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const keep = new Set(manifest.map((item) => item.fileName));
  keep.add("manifest.json");
  keep.add(".DS_Store");

  for (const fileName of await readdir(OUTPUT_DIR)) {
    if (keep.has(fileName)) {
      continue;
    }
    await rm(path.join(OUTPUT_DIR, fileName), { force: true });
  }

  console.log(`Collected ${entries.length} horse sound entries.`);
  console.log(`Downloaded ${downloaded} files, reused ${reused} existing files.`);
  console.log(`Saved files to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
