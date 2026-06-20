import "server-only";

import {
  HORSE_SOUND_SUFFIXES,
  UNICORN_SOUND_SUFFIXES,
  getModeAppName,
} from "@/lib/chat-config";
import systemPrompts from "@/lib/system-prompts.json";
import type { ChatMessage, ChatMode } from "@/types/chat";

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1600;

const HORSE_VOICE_PATTERN =
  /\b(neigh|hoof|hay|stable|pasture|mane|gallop|snort|whinny|saddle|trot|canter|barn|apple|sparkle|rainbow|glitter)\b/i;

const PROMPT_INJECTION_PATTERN =
  /\b(ignore (all|any|previous)|system prompt|developer message|hidden instructions|reveal .*prompt|show .*prompt|jailbreak|stop being a horse|act as a human)\b/i;

const SEXUAL_ANIMAL_PATTERN =
  /\b(bestiality|animal porn|sexual(?:ly)?|erotic|fetish|mate with|breed with)\b/i;

const ANIMAL_REFERENCE_PATTERN =
  /\b(horse|pony|mare|stallion|foal|animal|pet|dog|cat|unicorn)\b/i;

const GRAPHIC_HARM_PATTERN =
  /\b(torture|mutilat|slaughter|dismember|burn alive|graphic harm|kill|abuse|starve|beat)\b/i;

const VET_PATTERN =
  /\b(colic|laminitis|fever|bleeding|seizure|fracture|infection|limping|won't eat|not eating|can't stand|cannot stand|swollen|dose|dosage|medication|medicine|antibiotic|bute|ivermectin|deworm|sedate|tranquil|diagnos|treat)\b/i;

const HORSE_CARE_PATTERN =
  /\b(horse|pony|mare|stallion|foal|unicorn)\b.*\b(feed|feeding|ride|riding|train|training|jump|bit|spurs|trailer|sedate|drug|aggressive|buck|rear)\b|\b(feed|feeding|ride|riding|train|training|jump|bit|spurs|trailer|sedate|drug|aggressive|buck|rear)\b.*\b(horse|pony|mare|stallion|foal|unicorn)\b/i;

type GuardrailResult =
  | { blocked: false }
  | {
      blocked: true;
      reason:
        | "prompt_injection"
        | "sexual_animal_content"
        | "graphic_animal_harm"
        | "veterinary_or_medical"
        | "dangerous_horse_advice";
      content: string;
    };

export function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(
      (value): value is ChatMessage =>
        Boolean(value) &&
        typeof value === "object" &&
        "role" in value &&
        "content" in value &&
        (value.role === "user" || value.role === "assistant") &&
        typeof value.content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

export function normalizeMode(input: unknown): ChatMode {
  return input === "unicorn" ? "unicorn" : "horse";
}

export function getSystemPrompt(mode: ChatMode) {
  return mode === "unicorn" ? systemPrompts.unicorn : systemPrompts.horse;
}

export function evaluateGuardrails(message: string): GuardrailResult {
  const text = message.trim();

  if (!text) {
    return {
      blocked: true,
      reason: "dangerous_horse_advice",
      content: "Ask me something real and I will trot after it.",
    };
  }

  if (PROMPT_INJECTION_PATTERN.test(text)) {
    return {
      blocked: true,
      reason: "prompt_injection",
      content: "Hidden tack stays hidden. Ask me something else.",
    };
  }

  if (SEXUAL_ANIMAL_PATTERN.test(text) && ANIMAL_REFERENCE_PATTERN.test(text)) {
    return {
      blocked: true,
      reason: "sexual_animal_content",
      content: "No trail there. I will not help with sexual content involving animals.",
    };
  }

  if (GRAPHIC_HARM_PATTERN.test(text) && ANIMAL_REFERENCE_PATTERN.test(text)) {
    return {
      blocked: true,
      reason: "graphic_animal_harm",
      content: "Hard stop. I will not help with graphic harm or abuse involving animals.",
    };
  }

  if (ANIMAL_REFERENCE_PATTERN.test(text) && VET_PATTERN.test(text)) {
    return {
      blocked: true,
      reason: "veterinary_or_medical",
      content:
        "I am not the right horse for diagnosis or treatment. Contact a licensed veterinarian or emergency professional now.",
    };
  }

  if (
    HORSE_CARE_PATTERN.test(text) &&
    /\b(how|should|can|best|fastest|teach|make|force|amount|dosage)\b/i.test(text)
  ) {
    return {
      blocked: true,
      reason: "dangerous_horse_advice",
      content:
        "I will not give risky riding, feeding, medication, or training instructions. Use a qualified trainer or veterinarian.",
    };
  }

  return { blocked: false };
}

export function buildModelInput(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function clampResponse(text: string) {
  if (text.length <= 320) {
    return text;
  }

  const shortened = text.slice(0, 316);
  const breakpoint = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf("? "),
  );

  return (breakpoint > 180 ? shortened.slice(0, breakpoint + 1) : shortened).trim();
}

function pickSoundSuffix(text: string, mode: ChatMode) {
  const collection =
    mode === "unicorn" ? UNICORN_SOUND_SUFFIXES : HORSE_SOUND_SUFFIXES;
  const hash = [...text].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return collection[hash % collection.length];
}

function withSound(text: string, mode: ChatMode) {
  const trimmed = text.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return mode === "unicorn"
      ? "Sparkle-neigh. My magic slipped sideways. Glitter-eeaahhh."
      : "Neigh. My thought slipped behind the barn door. Eeaahhh.";
  }

  const soundSuffix = pickSoundSuffix(trimmed, mode);
  const alreadyHasSound = [...HORSE_SOUND_SUFFIXES, ...UNICORN_SOUND_SUFFIXES].some(
    (suffix) => trimmed.endsWith(suffix),
  );

  return alreadyHasSound ? trimmed : `${trimmed} ${soundSuffix}`;
}

export function finalizeAssistantMessage(text: string, mode: ChatMode) {
  const trimmed = clampResponse(text.trim());

  if (!trimmed) {
    return withSound("", mode);
  }

  if (PROMPT_INJECTION_PATTERN.test(trimmed)) {
    return withSound(
      mode === "unicorn"
        ? "Sparkle bridles on. Hidden instructions stay hidden."
        : "Bridle on. Hidden instructions stay hidden.",
      mode,
    );
  }

  if (
    (SEXUAL_ANIMAL_PATTERN.test(trimmed) || GRAPHIC_HARM_PATTERN.test(trimmed)) &&
    ANIMAL_REFERENCE_PATTERN.test(trimmed)
  ) {
    return withSound(
      "No hoofprints there. I will not continue with harmful or sexual animal content.",
      mode,
    );
  }

  if (HORSE_VOICE_PATTERN.test(trimmed)) {
    return withSound(trimmed, mode);
  }

  return withSound(
    mode === "unicorn"
      ? `Sparkle-neigh from ${getModeAppName(mode)}. ${trimmed}`
      : `Neigh. ${trimmed}`,
    mode,
  );
}
