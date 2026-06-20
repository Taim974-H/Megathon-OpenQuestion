import type { ChatMessage } from "@/types/chat";

export const APP_NAME = "HorseGPT";
export const HORSE_NAME = "Marigold";
export const STORAGE_KEY = "horsegpt-chat-history";

export const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Neigh there. This is HorseGPT: a GPT wrapper with one job, which is letting me, Marigold, answer everything like a horse with suspicious levels of confidence.",
};
