import type { ChatMode } from "@/types/chat";

export const APP_NAME = "HorseGPT";
export const ASSISTANT_NAME = "HorseGPT";
export const MODE_STORAGE_KEY = "horsegpt-chat-mode";
export const EMAIL_FROM_NAME = "HorseGPT";
export const EMAIL_FROM_ADDRESS = "chatgptasahorse@outlook.com";

export function getModeAppName(mode: ChatMode) {
  return mode === "unicorn" ? "UnicornGPT" : APP_NAME;
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
