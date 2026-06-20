import type { ChatMode } from "@/types/chat";

export const APP_NAME = "HorseGPT";
export const ASSISTANT_NAME = "HorseGPT";
export const MODE_STORAGE_KEY = "horsegpt-chat-mode";
export const EMAIL_FROM_NAME = "HorseGPT";
export const EMAIL_FROM_ADDRESS = "chatgptasahorse@outlook.com";
export const HORSE_STARTER_LINES = [
  "Where should we gallop?",
  "Which haywire problem are we trotting into?",
  "What chaos needs a horse today?",
  "Which stable-grade life mess are we fixing?",
] as const;
export const UNICORN_STARTER_LINES = [
  "Which rainbow are we galloping toward?",
  "What glitter emergency are we charging into?",
  "Which cosmic mess needs a unicorn hoof?",
  "Where should this magical stampede begin?",
] as const;

function parseFlag(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

export const EMAIL_EXPORT_ENABLED = parseFlag(
  process.env.NEXT_PUBLIC_TRANSCRIPT_EMAIL_ENABLED,
);

export function isServerEmailExportEnabled() {
  return parseFlag(
    process.env.TRANSCRIPT_EMAIL_ENABLED ??
      process.env.NEXT_PUBLIC_TRANSCRIPT_EMAIL_ENABLED,
  );
}

export function getModeAppName(mode: ChatMode) {
  return mode === "unicorn" ? "UnicornGPT" : APP_NAME;
}

export function getStarterLines(mode: ChatMode) {
  return mode === "unicorn" ? UNICORN_STARTER_LINES : HORSE_STARTER_LINES;
}

export const HORSE_SOUND_SUFFIXES = [
  "Eeaahhh.",
  "Hrrr-eeaahhh.",
  "Neee-eeaahhh.",
  "Prrf-eeaahhh.",
];

export const UNICORN_SOUND_SUFFIXES = [
  "Sparkle-eeaahhh.",
  "Rainbow-eeaahhh.",
  "Glitter-eeaahhh.",
  "Twinkle-eeaahhh.",
];

export const MEGATHON_COPY = {
  title: "MEGATHON",
  subtitle: "The stage Europe never built. Until now.",
  builtWith: ["Codex by OpenAI", "Base44", "Vapi"],
  stats: ["500+ BUILDERS", "EUR100K+ PRIZE POOL", "3 DAYS"],
  manifesto: [
    "3 days. 500 builders. One mission:",
    "Unite Europe.",
    "Ship real startups.",
    "Build something undeniable.",
  ],
};
