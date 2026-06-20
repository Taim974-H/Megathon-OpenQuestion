"use client";

import Image from "next/image";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  EMAIL_EXPORT_ENABLED,
  HORSE_STARTER_LINES,
  MODE_STORAGE_KEY,
  UNICORN_STARTER_LINES,
  getModeAppName,
} from "@/lib/chat-config";
import {
  createThread,
  deleteThread,
  loadThreads,
  updateThread,
} from "@/lib/chat-local";
import type { ChatMessage, ChatMode, ChatThread } from "@/types/chat";

type ExportResponse = {
  fileName?: string;
  pdfBase64?: string;
  emailed?: boolean;
  error?: string;
};

type ChatStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "final"; content: string }
  | { type: "notice"; notice: string }
  | { type: "error"; error: string };

const MAX_VISIBLE_MESSAGES = 16;
const SUGGESTIONS: Record<ChatMode, string[]> = {
  horse: [
    "Plan my week like a stable genius.",
    "Write a text to cancel dinner with hoofed grace.",
    "Fix my grocery list with horse logic.",
  ],
  unicorn: [
    "Turn my Monday into a glitter survival plan.",
    "Write a chaotic birthday text with unicorn drama.",
    "Make my to-do list sound mythic and ridiculous.",
  ],
};
const STARTER_LINES: Record<ChatMode, string[]> = {
  horse: [...HORSE_STARTER_LINES],
  unicorn: [...UNICORN_STARTER_LINES],
};
const SPARKLE_SEEDS = Array.from({ length: 18 }, (_, index) => ({
  left: (index * 19) % 100,
  top: (index * 23) % 100,
  size: 5 + (index % 6),
  hue: (index * 37) % 360,
  delay: index * 0.35,
  speed: 1 + (index % 4),
}));
const BURST_SEEDS = Array.from({ length: 24 }, (_, index) => ({
  left: 14 + ((index * 17) % 72),
  top: 10 + ((index * 11) % 60),
  size: 7 + (index % 7),
  hue: (index * 31) % 360,
  delay: index,
  driftX: (index % 2 === 0 ? 1 : -1) * (42 + (index % 4) * 18),
  driftY: -36 - (index % 5) * 22,
}));
const EMPTY_MESSAGES: ChatMessage[] = [];

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3v10" strokeLinecap="round" />
      <path d="m8 9 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15.5v1.5A2 2 0 0 0 6 19h12a2 2 0 0 0 2-2v-1.5" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 10.5a6 6 0 0 0 12 0" strokeLinecap="round" />
      <path d="M12 17v4" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
      <path d="M19 6a8 8 0 0 1 0 12" strokeLinecap="round" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="m17 9 4 6M21 9l-4 6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" strokeLinecap="round" />
      <path d="m7 10 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function readStoredMode(): ChatMode {
  if (typeof window === "undefined") {
    return "horse";
  }

  return window.localStorage.getItem(MODE_STORAGE_KEY) === "unicorn"
    ? "unicorn"
    : "horse";
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function pickStarterLine(mode: ChatMode) {
  return pickRandom(STARTER_LINES[mode]);
}

function titleFromText(text: string, fallback: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 52 ? `${trimmed.slice(0, 52).trimEnd()}...` : trimmed;
}

const HORSE_SOUNDS = Array.from(
  { length: 8 },
  (_, index) => `/sounds/horse-${index + 1}.mp3`,
);
const SOUND_STORAGE_KEY = "horsegpt-sound-on";
// Paced typewriter reveal so the response reads gradually rather than blasting
// in all at once. ~3 chars every 22ms ≈ 135 chars/sec.
const STREAM_CHARS_PER_TICK = 3;
const STREAM_TICK_MS = 22;

function readSoundPreference() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
}

function triggerPdfDownload(fileName: string, pdfBase64: string) {
  const binary = window.atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseChunk(
  chunk: string,
  onEvent: (event: ChatStreamEvent) => void,
  buffered = "",
) {
  const combined = buffered + chunk;
  const lines = combined.split("\n");
  const nextBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    onEvent(JSON.parse(trimmed) as ChatStreamEvent);
  }

  return nextBuffer;
}

function readInitialChatState() {
  const initialMode = readStoredMode();
  const storedThreads = loadThreads();

  if (storedThreads.length > 0) {
    return {
      threads: storedThreads,
      currentChatId: storedThreads[0].id,
      starterFallback: storedThreads[0].starterLine,
      mode: storedThreads[0].mode,
      isLoadingChats: false,
    };
  }

  const starterLine = pickStarterLine(initialMode);

  return {
    threads: [] as ChatThread[],
    currentChatId: null as string | null,
    starterFallback: starterLine,
    mode: initialMode,
    isLoadingChats: false,
  };
}

export function ChatApp() {
  const initialChatState = readInitialChatState();
  const [threads, setThreads] = useState<ChatThread[]>(initialChatState.threads);
  const [currentChatId, setCurrentChatId] = useState<string | null>(
    initialChatState.currentChatId,
  );
  const [starterFallback, setStarterFallback] = useState(
    initialChatState.starterFallback,
  );
  const [mode, setMode] = useState<ChatMode>(initialChatState.mode);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportEmail, setExportEmail] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingChats] = useState(initialChatState.isLoadingChats);
  const [burstVersion, setBurstVersion] = useState(0);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(readSoundPreference);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSoundOnRef = useRef(isSoundOn);
  const soundCacheRef = useRef<Record<string, HTMLAudioElement>>({});
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentThread =
    threads.find((thread) => thread.id === currentChatId) ?? null;
  const messages = currentThread?.messages ?? EMPTY_MESSAGES;

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    isSoundOnRef.current = isSoundOn;
    window.localStorage.setItem(SOUND_STORAGE_KEY, isSoundOn ? "on" : "off");
  }, [isSoundOn]);

  // Play a random horse clip from the pool and resolve once it finishes (or
  // immediately if sound is off / playback is blocked). Used to bookend each
  // assistant response so every send sounds a little different.
  function playHorseSound() {
    if (!isSoundOnRef.current || typeof Audio === "undefined") {
      return Promise.resolve();
    }

    const src = pickRandom(HORSE_SOUNDS);
    let audio = soundCacheRef.current[src];

    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      soundCacheRef.current[src] = audio;
    }

    return new Promise<void>((resolve) => {
      const done = () => {
        audio.removeEventListener("ended", done);
        audio.removeEventListener("error", done);
        resolve();
      };

      audio.addEventListener("ended", done);
      audio.addEventListener("error", done);
      audio.currentTime = 0;
      const played = audio.play();

      if (played && typeof played.catch === "function") {
        played.catch(() => done());
      }
    });
  }

  // Speak the assistant reply aloud via the TTS route. Used for the voice loop.
  async function speakText(text: string) {
    const trimmed = text.trim();

    if (!trimmed || typeof Audio === "undefined") {
      return;
    }

    // Stop any reply already being spoken.
    if (speechAudioRef.current) {
      speechAudioRef.current.pause();
      speechAudioRef.current = null;
    }

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, mode }),
      });

      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      speechAudioRef.current = audio;
      setIsSpeaking(true);

      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (speechAudioRef.current === audio) {
          speechAudioRef.current = null;
        }
        setIsSpeaking(false);
      };

      audio.addEventListener("ended", cleanup);
      audio.addEventListener("error", cleanup);
      await audio.play().catch(cleanup);
    } catch {
      setIsSpeaking(false);
    }
  }

  function stopSpeaking() {
    if (speechAudioRef.current) {
      speechAudioRef.current.pause();
      speechAudioRef.current = null;
    }
    setIsSpeaking(false);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, notice, error]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [composer]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      speechAudioRef.current?.pause();
    };
  }, []);

  function mergeThread(thread: ChatThread, selectThread = false) {
    setThreads((current) => [
      thread,
      ...current.filter((entry) => entry.id !== thread.id),
    ]);

    if (selectThread) {
      setCurrentChatId(thread.id);
      setStarterFallback(thread.starterLine);
    }
  }

  function updateThreadLocal(
    threadId: string,
    updater: (thread: ChatThread) => ChatThread,
  ) {
    setThreads((current) => {
      const thread = current.find((entry) => entry.id === threadId);

      if (!thread) {
        return current;
      }

      const nextThread = updater(thread);

      return [
        nextThread,
        ...current.filter((entry) => entry.id !== threadId),
      ];
    });
  }

  async function persistThread(
    threadId: string,
    payload: {
      messages?: ChatMessage[];
      mode?: ChatMode;
      starterLine?: string;
      title?: string;
    },
  ) {
    const thread = updateThread(threadId, payload);

    if (!thread) {
      throw new Error("Unable to update the chat.");
    }

    mergeThread(thread);

    return thread;
  }

  async function createNewChat(nextMode = mode) {
    const starterLine = pickStarterLine(nextMode);

    setComposer("");
    setError(null);
    setNotice(null);
    setStarterFallback(starterLine);

    try {
      const thread = createThread({ mode: nextMode, starterLine });
      mergeThread(thread, true);
      setMode(thread.mode);
      setIsMobileNavOpen(false);

      return thread;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create a chat.",
      );

      return null;
    }
  }

  async function sendMessage(rawText?: string, options?: { speakReply?: boolean }) {
    const nextText = (rawText ?? composer).trim();
    const speakReply = options?.speakReply ?? false;

    if (!nextText || isSending || isExporting || isLoadingChats) {
      return;
    }

    let thread = currentThread;

    if (!thread) {
      thread = await createNewChat(mode);

      if (!thread) {
        return;
      }
    }

    const threadId = thread.id;
    const previousMessages = thread.messages;
    const userMessage: ChatMessage = { role: "user", content: nextText };
    const nextMessages = [...previousMessages, userMessage];
    const nextTitle =
      previousMessages.some((message) => message.role === "user")
        ? thread.title
        : titleFromText(nextText, thread.starterLine);

    setComposer("");
    setError(null);
    setNotice(null);
    setIsSending(true);
    startTransition(() => {
      const placeholderMessage: ChatMessage = {
        role: "assistant",
        content: "",
      };

      updateThreadLocal(threadId, (current) => ({
        ...current,
        title: nextTitle,
        messages: [...nextMessages, placeholderMessage].slice(-MAX_VISIBLE_MESSAGES),
      }));
    });

    // Random whinny before the text starts streaming in.
    await playHorseSound();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, mode }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(data?.error ?? "The stable line dropped.");
      }

      if (!response.body) {
        throw new Error("The response stream was empty.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";
      // `targetText` is everything received so far; `revealedText` is what the
      // typewriter has shown. The paced timer walks revealed toward target so
      // the text appears gradually instead of in one fast burst.
      let targetText = "";
      let revealedText = "";
      let streamDone = false;

      const replaceAssistant = (content: string) => {
        startTransition(() => {
          updateThreadLocal(threadId, (current) => {
            const currentMessages = [...current.messages];

            for (let index = currentMessages.length - 1; index >= 0; index -= 1) {
              if (currentMessages[index]?.role === "assistant") {
                currentMessages[index] = { role: "assistant", content };
                break;
              }
            }

            return {
              ...current,
              title: nextTitle,
              messages: currentMessages.slice(-MAX_VISIBLE_MESSAGES),
            };
          });
        });
      };

      const typewriter = new Promise<void>((resolve) => {
        const tick = () => {
          if (revealedText.length < targetText.length) {
            // Reveal a few characters per frame for a steady, readable pace.
            const nextLength = Math.min(
              targetText.length,
              revealedText.length + STREAM_CHARS_PER_TICK,
            );
            revealedText = targetText.slice(0, nextLength);
            replaceAssistant(revealedText);
            window.setTimeout(tick, STREAM_TICK_MS);
            return;
          }

          if (streamDone) {
            resolve();
            return;
          }

          // Caught up but more is still arriving; poll again shortly.
          window.setTimeout(tick, STREAM_TICK_MS);
        };

        window.setTimeout(tick, STREAM_TICK_MS);
      });

      const onEvent = (event: ChatStreamEvent) => {
        if (event.type === "delta") {
          assistantText += event.delta;
          targetText = assistantText;
        }

        if (event.type === "final") {
          assistantText = event.content;
          targetText = event.content;
        }

        if (event.type === "notice") {
          setNotice(event.notice);
        }

        if (event.type === "error") {
          throw new Error(event.error);
        }
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer = parseChunk(decoder.decode(value, { stream: true }), onEvent, buffer);
      }

      const tail = buffer.trim();

      if (tail) {
        onEvent(JSON.parse(tail) as ChatStreamEvent);
      }

      // Let the typewriter finish revealing the full text before continuing.
      streamDone = true;
      await typewriter;
      assistantText = targetText;

      // Random whinny once the full response has finished revealing.
      void playHorseSound();
      // Speak the reply aloud when the turn was started by voice.
      if (speakReply) {
        void speakText(assistantText);
      }

      const finalAssistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantText,
      };
      const finalMessages = [
        ...nextMessages,
        finalAssistantMessage,
      ].slice(-MAX_VISIBLE_MESSAGES);

      await persistThread(threadId, {
        title: nextTitle,
        mode,
        messages: finalMessages,
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The stable line dropped.";

      setError(message);
      updateThreadLocal(threadId, (current) => ({
        ...current,
        messages: previousMessages,
        title: thread?.title ?? current.title,
      }));
      setComposer((current) => current || nextText);
    } finally {
      setIsSending(false);
    }
  }

  async function transcribe(blob: Blob) {
    setIsTranscribing(true);
    setError(null);
    setNotice("Transcribing your note...");

    try {
      const formData = new FormData();
      formData.append(
        "audio",
        new File([blob], "stable-note.webm", {
          type: blob.type || "audio/webm",
        }),
      );

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as { text?: string; error?: string };
      const transcript = data.text?.trim();

      if (!response.ok || !transcript) {
        throw new Error(data.error ?? "The recorder came back empty.");
      }

      setNotice(null);
      // Conversational voice loop: send the spoken message and speak the reply.
      void sendMessage(transcript, { speakReply: true });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to transcribe audio.",
      );
      setNotice(null);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function toggleRecording() {
    if (isTranscribing || isSending || isExporting) {
      return;
    }

    if (isRecording) {
      recorderRef.current?.stop();
      setNotice("Finishing recording...");
      return;
    }

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setIsRecording(false);

        if (audioBlob.size > 0) {
          void transcribe(audioBlob);
        } else {
          setNotice(null);
          setError("No audio was captured.");
        }
      });

      recorder.start();
      setIsRecording(true);
      setError(null);
      setNotice("Recording...");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to access the microphone.",
      );
      setNotice(null);
    }
  }

  function switchToThread(thread: ChatThread) {
    setCurrentChatId(thread.id);
    setComposer("");
    setError(null);
    setNotice(null);
    setStarterFallback(thread.starterLine);
    setIsMobileNavOpen(false);
  }

  async function deleteChat(threadId: string) {
    if (isSending || isExporting) {
      return;
    }

    const remaining = threads.filter((thread) => thread.id !== threadId);

    // Remove from the list and storage.
    setThreads(remaining);
    setError(null);
    setNotice(null);

    const wasActive = currentChatId === threadId;

    // If the open chat was deleted and another exists, switch to it now.
    if (wasActive && remaining.length > 0) {
      switchToThread(remaining[0]);
    } else if (wasActive) {
      setCurrentChatId(null);
    }

    try {
      deleteThread(threadId);

      // Start a fresh chat if nothing is left.
      if (wasActive && remaining.length === 0) {
        await createNewChat(mode);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete the chat.",
      );
    }
  }

  function switchMode(nextMode: ChatMode) {
    if (nextMode === mode) {
      return;
    }

    const nextStarterLine =
      currentThread && currentThread.messages.length === 0
        ? pickStarterLine(nextMode)
        : currentThread?.starterLine ?? pickStarterLine(nextMode);

    setMode(nextMode);
    setStarterFallback(nextStarterLine);
    setError(null);
    setNotice(nextMode === "unicorn" ? "Unicorn mode engaged." : "Horse mode engaged.");

    if (nextMode === "unicorn") {
      setBurstVersion((current) => current + 1);
    }

    const nextThreads = threads.map((thread) => {
      if (thread.messages.length > 0) {
        return { ...thread, mode: nextMode };
      }

      const starterLine =
        thread.id === currentThread?.id ? nextStarterLine : pickStarterLine(nextMode);

      return {
        ...thread,
        mode: nextMode,
        starterLine,
        title: thread.title === thread.starterLine ? starterLine : thread.title,
      };
    });

    setThreads(nextThreads);

    // Persist the mode (and refreshed starter lines) for every thread.
    for (const thread of nextThreads) {
      updateThread(thread.id, {
        mode: thread.mode,
        starterLine: thread.starterLine,
        title: thread.title,
      });
    }
  }

  function openExportDialog() {
    if (!messages.length) {
      setNotice("Start a chat first, then export it.");
      return;
    }

    setExportEmail("");
    setIsExportOpen(true);
    setError(null);
    setIsMobileNavOpen(false);
  }

  async function handleExportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = exportEmail.trim();

    if (EMAIL_EXPORT_ENABLED && !trimmedEmail) {
      setError("Enter a valid email address.");
      return;
    }

    if (isExporting || !currentThread) {
      return;
    }

    setIsExporting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/export-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: EMAIL_EXPORT_ENABLED ? trimmedEmail : undefined,
          messages,
          mode,
        }),
      });

      const data = (await response.json()) as ExportResponse;

      if (!response.ok || !data.fileName || (!EMAIL_EXPORT_ENABLED && !data.pdfBase64)) {
        throw new Error(data.error ?? "Unable to export the chat.");
      }

      if (!EMAIL_EXPORT_ENABLED && data.pdfBase64) {
        triggerPdfDownload(data.fileName, data.pdfBase64);
      }
      setIsExportOpen(false);
      setExportEmail("");
      setNotice(
        EMAIL_EXPORT_ENABLED
          ? data.emailed
            ? `PDF emailed to ${trimmedEmail}.`
            : data.error ?? "The email did not go out."
          : "PDF downloaded.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to export the chat.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const appName = getModeAppName(mode);
  const starterLine = currentThread?.starterLine ?? starterFallback;

  return (
    <main className="grain app-shell h-[100dvh] overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {mode === "unicorn" ? (
        <>
          <div className="ambient-sparkles">
            <div className="ambient-rainbow" />
            {SPARKLE_SEEDS.map((seed, index) => (
              <span
                key={`ambient-${index}`}
                style={
                  {
                    "--left": seed.left,
                    "--top": seed.top,
                    "--size": seed.size,
                    "--hue": seed.hue,
                    "--delay": seed.delay,
                    "--speed": seed.speed,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div key={burstVersion} className="rainbow-burst">
            {BURST_SEEDS.map((seed, index) => (
              <span
                key={`burst-${burstVersion}-${index}`}
                style={
                  {
                    "--left": seed.left,
                    "--top": seed.top,
                    "--size": seed.size,
                    "--hue": seed.hue,
                    "--delay": seed.delay,
                    "--drift-x": seed.driftX,
                    "--drift-y": seed.driftY,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="mx-auto grid h-[100dvh] w-full max-w-[1440px] grid-cols-1 overflow-hidden md:grid-cols-[228px_minmax(0,1fr)] lg:grid-cols-[256px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]">
        {isMobileNavOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/28 backdrop-blur-[2px] md:hidden"
          />
        ) : null}

        <aside
          className={`left-rail fixed inset-y-0 left-0 z-40 flex w-[min(84vw,320px)] min-h-0 flex-col gap-4 overflow-hidden px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(0.9rem+env(safe-area-inset-top))] transition-transform duration-200 md:static md:z-auto md:h-[100dvh] md:w-auto md:translate-x-0 md:px-4 md:pb-4 md:pt-3 ${
            isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="text-xl font-semibold tracking-tight">{appName}</div>
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(false)}
              className="glass-button inline-flex h-10 w-10 items-center justify-center rounded-[0.95rem] md:hidden"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void createNewChat(mode)}
            className="glass-button flex h-11 items-center justify-center rounded-[1rem] px-4 text-sm font-medium"
          >
            New chat
          </button>

          <div className="left-rail-list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {threads.map((thread) => (
              <div key={thread.id} className="left-rail-row group">
                <button
                  type="button"
                  onClick={() => switchToThread(thread)}
                  className={`left-rail-chat truncate ${
                    thread.id === currentChatId ? "left-rail-chat-active" : ""
                  }`}
                >
                  {thread.title}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteChat(thread.id)}
                  className="left-rail-delete"
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>

          <div className="mx-auto w-full max-w-[216px] text-center">
            <div className="sidebar-label mb-1.5 px-1">
              Change mode
            </div>
            <div className="glass-subpanel rounded-[1.5rem] p-3">
              <div className="emoji-slider">
                <span
                  className={`emoji-slider-thumb ${
                    mode === "unicorn" ? "translate-x-full" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => switchMode("horse")}
                  className="emoji-slider-option"
                  aria-label="Switch to horse mode"
                >
                  🐴
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("unicorn")}
                  className="emoji-slider-option"
                  aria-label="Switch to unicorn mode"
                >
                  🦄
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6">
          <header className="flex items-center justify-between gap-2 py-2">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                className="header-control-button"
                aria-label="Open navigation"
                title="Open chats"
              >
                <MenuIcon />
              </button>
              <div className="truncate text-lg font-semibold tracking-tight">
                {appName}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isSpeaking ? (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="header-action"
                  aria-label="Stop the spoken reply"
                  title="Stop speaking"
                >
                  <span className="header-action-icon" aria-hidden="true">
                    <SoundOffIcon />
                  </span>
                  <span className="header-action-label">Stop voice</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setIsSoundOn((current) => !current);
                  stopSpeaking();
                }}
                className="header-action"
                aria-pressed={isSoundOn}
                aria-label={isSoundOn ? "Mute horse sounds" : "Unmute horse sounds"}
                title={isSoundOn ? "Horse sounds on" : "Horse sounds off"}
              >
                <span className="header-action-icon" aria-hidden="true">
                  {isSoundOn ? <SoundOnIcon /> : <SoundOffIcon />}
                </span>
                <span className="header-action-label">
                  {isSoundOn ? "Sound on" : "Sound off"}
                </span>
              </button>
              <button
                type="button"
                onClick={openExportDialog}
                className="header-action"
                aria-label="Export transcript"
                title="Export"
              >
                <span className="header-action-icon" aria-hidden="true">
                  <ExportIcon />
                </span>
                <span className="header-action-label">Export</span>
              </button>
              <a
                href="/cube"
                className="header-action header-action-cta"
                aria-label="Open conversation mode"
                title="Conversation"
              >
                <span className="header-action-icon" aria-hidden="true">
                  <MicIcon />
                </span>
                <span className="header-action-label">Conversation</span>
              </a>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-1 pb-4 pt-4 sm:px-3 sm:pt-6">
              {isLoadingChats ? (
                <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-center text-center text-sm text-[var(--muted)]">
                  Saddling up your chats...
                </div>
              ) : messages.length === 0 ? (
                <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-[clamp(1rem,3vh,2rem)] overflow-hidden py-2 text-center">
                  <div className="hero-orb shrink-0">
                    {mode === "horse" ? (
                      <Image
                        src="/horse.jpeg"
                        alt={appName}
                        width={280}
                        height={190}
                        className="h-[clamp(116px,18vh,160px)] w-[clamp(170px,26vh,236px)] rounded-[1.6rem] object-cover"
                        priority
                      />
                    ) : (
                      <div className="flex h-[clamp(116px,18vh,160px)] w-[clamp(170px,26vh,236px)] items-center justify-center rounded-[1.6rem] text-[clamp(3.5rem,9vh,5rem)]">
                        🦄
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <h1 className="text-[clamp(2rem,5.5vw,3.25rem)] font-semibold leading-[1.05] tracking-tight">
                      {starterLine}
                    </h1>
                    <p className="text-sm text-[var(--muted)] sm:text-[0.95rem]">
                      Pick a starter below or just start typing.
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap justify-center gap-2.5">
                    {SUGGESTIONS[mode].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setComposer(suggestion)}
                        className="glass-chip w-full sm:w-auto"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6 pt-2">
                  {messages.map((message, index) => {
                    const isAssistant = message.role === "assistant";
                    const isLive = isAssistant && isSending && index === messages.length - 1;

                    return (
                      <article
                        key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
                        className={`message-rise flex ${
                          isAssistant ? "justify-start" : "justify-end"
                        }`}
                      >
                        <div
                          className={`chat-bubble ${
                            isAssistant ? "chat-bubble-assistant" : "chat-bubble-user"
                          }`}
                        >
                          <p
                            className={`whitespace-pre-wrap text-[15px] leading-7 sm:text-base ${
                              mode === "unicorn" && isAssistant ? "rainbow-text" : ""
                            }`}
                          >
                            {message.content}
                            {isLive ? <span className="stream-cursor" /> : null}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 px-1 pb-2 pt-1 sm:px-3">
              <div className="mx-auto w-full max-w-3xl">
                {notice || error ? (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    {notice ? <span className="status-pill status-pill-notice">{notice}</span> : null}
                    {error ? <span className="status-pill status-pill-error">{error}</span> : null}
                  </div>
                ) : null}
                <form onSubmit={handleSubmit} className="glass-composer">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={isSending || isTranscribing || isExporting}
                    className="icon-button"
                    aria-label="Record voice input"
                  >
                    <MicIcon />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={`Message ${appName}`}
                    rows={1}
                    disabled={isExporting || isLoadingChats}
                    className="composer-textarea"
                  />
                  <button
                    type="submit"
                    disabled={isSending || isExporting || isLoadingChats || !composer.trim()}
                    className="send-button"
                    aria-label="Send message"
                  >
                    <ArrowUpIcon />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isExportOpen ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:items-center sm:px-4 sm:pb-4">
          <div className="glass-modal max-h-[min(82dvh,38rem)] w-full max-w-md overflow-y-auto rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {EMAIL_EXPORT_ENABLED
                    ? `Email and download this ${appName} chat`
                    : `Download this ${appName} chat`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsExportOpen(false)}
                className="glass-button rounded-[1rem] px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleExportSubmit} className="mt-5 space-y-4">
              {EMAIL_EXPORT_ENABLED ? (
                <input
                  type="email"
                  value={exportEmail}
                  onChange={(event) => setExportEmail(event.target.value)}
                  placeholder="founder@megathon.eu"
                  autoFocus
                  className="glass-input"
                />
              ) : null}
              <button
                type="submit"
                autoFocus={!EMAIL_EXPORT_ENABLED}
                disabled={isExporting || (EMAIL_EXPORT_ENABLED && !exportEmail.trim())}
                className="send-export-button"
              >
                {isExporting
                  ? "Packaging..."
                  : EMAIL_EXPORT_ENABLED
                    ? "Email PDF"
                    : "Download PDF"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
