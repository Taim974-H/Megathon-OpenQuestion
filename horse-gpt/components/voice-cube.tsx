"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  HORSE_STARTER_LINES,
  UNICORN_STARTER_LINES,
} from "@/lib/chat-config";
import { createThread, updateThread } from "@/lib/chat-local";
import type { ChatMessage, ChatMode } from "@/types/chat";

type CubeState = "" | "listening" | "thinking" | "speaking";
type VoiceCubeProps = {
  debug?: boolean;
};
type SpeechRecognitionAlternative = {
  transcript: string;
};
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type BrowserWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};
type ChatStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "final"; content: string }
  | { type: "notice"; notice: string }
  | { type: "error"; error: string };
type HorseSoundResult = { src: string; played: boolean } | null;

// Short whinnies (≤2s) to bracket the start of a turn, and longer 3–4s horse
// noises played once the reply has been spoken.
const HORSE_START_SOUNDS = Array.from(
  { length: 7 },
  (_, index) => `/sounds/start-${index + 1}.mp3`,
);
const HORSE_END_SOUNDS = Array.from(
  { length: 6 },
  (_, index) => `/sounds/end-${index + 1}.mp3`,
);
const START_SOUND_TAIL_PAUSE_MS: Record<string, number> = {
  "/sounds/start-1.mp3": 1700,
  "/sounds/start-2.mp3": 1200,
  "/sounds/start-3.mp3": 1000,
  "/sounds/start-4.mp3": 1000,
  "/sounds/start-5.mp3": 1800,
  "/sounds/start-6.mp3": 1350,
  "/sounds/start-7.mp3": 1650,
};
const MODE_STORAGE_KEY = "horsegpt-chat-mode";
// Stop a recording turn once the mic has been quiet for this long.
const SILENCE_MS = 720;
const LIVE_TRANSCRIPT_SILENCE_MS = 580;
const SPEECH_THRESHOLD = 0.03;
const RELEASE_THRESHOLD = 0.02;
const MAX_HISTORY = 16;
const MAX_SAVED_MESSAGES = 80;
const STARTER_LINES: Record<ChatMode, readonly string[]> = {
  horse: HORSE_STARTER_LINES,
  unicorn: UNICORN_STARTER_LINES,
};

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function getDefaultStarterLine(mode: ChatMode) {
  return STARTER_LINES[mode][0] ?? "Where should we gallop?";
}

function titleFromText(text: string, fallback: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 52 ? `${trimmed.slice(0, 52).trimEnd()}...` : trimmed;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function waitForStartSoundTail(sound: HorseSoundResult) {
  if (!sound?.played) {
    return;
  }

  await wait(START_SOUND_TAIL_PAUSE_MS[sound.src] ?? 1000);
}

function readStoredMode(): ChatMode {
  if (typeof window === "undefined") {
    return "horse";
  }
  return window.localStorage.getItem(MODE_STORAGE_KEY) === "unicorn"
    ? "unicorn"
    : "horse";
}

export function VoiceCube({ debug = false }: VoiceCubeProps) {
  const [cubeState, setCubeState] = useState<CubeState>("");
  const [transcript, setTranscript] = useState(
    "Ready when you are",
  );
  const [liveUserText, setLiveUserText] = useState("");
  const [convoMode, setConvoMode] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("horse");

  // Mutable refs so async loops always see current values.
  const convoModeRef = useRef(false);
  const busyRef = useRef(false);
  const sessionRef = useRef(0);
  const historyRef = useRef<ChatMessage[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const horseSoundRef = useRef<HTMLAudioElement | null>(null);
  const soundCacheRef = useRef<Record<string, HTMLAudioElement>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const liveTextRef = useRef("");
  const savedMessagesRef = useRef<ChatMessage[]>([]);
  const voiceThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      conversationEndRef.current?.scrollIntoView({ block: "end" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [history, liveUserText, cubeState]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        const storedMode = readStoredMode();

        setMode(storedMode);
        document.documentElement.dataset.mode = storedMode;
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const setState = useCallback((next: CubeState) => {
    setCubeState(next);
  }, []);

  const isSessionActive = useCallback(
    (sessionId: number) =>
      convoModeRef.current && sessionRef.current === sessionId,
    [],
  );

  const persistVoiceThread = useCallback(
    (messages: ChatMessage[], firstUserText: string) => {
      try {
        const starterLine = getDefaultStarterLine(mode);
        const threadId = voiceThreadIdRef.current;

        if (!threadId) {
          const thread = createThread({ mode, starterLine });
          voiceThreadIdRef.current = thread.id;
          updateThread(thread.id, {
            title: titleFromText(firstUserText, starterLine),
            mode,
            messages,
          });
          return;
        }

        if (!updateThread(threadId, { mode, messages })) {
          const thread = createThread({ mode, starterLine });
          voiceThreadIdRef.current = thread.id;
          updateThread(thread.id, {
            title: titleFromText(firstUserText, starterLine),
            mode,
            messages,
          });
        }
      } catch {
        setError("Conversation could not be saved locally.");
      }
    },
    [mode],
  );

  // ── Play a random horse clip from the start/end pool, resolve when done ──
  const playHorseSound = useCallback((phase: "start" | "end" = "start") => {
    if (typeof Audio === "undefined") {
      return Promise.resolve(null);
    }
    const pool = phase === "end" ? HORSE_END_SOUNDS : HORSE_START_SOUNDS;
    const src = pickRandom(pool);
    let audio = soundCacheRef.current[src];
    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      soundCacheRef.current[src] = audio;
    }
    return new Promise<HorseSoundResult>((resolve) => {
      let settled = false;
      const done = (played: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        if (horseSoundRef.current === audio) {
          horseSoundRef.current = null;
        }
        resolve({ src, played });
      };
      const onEnded = () => done(true);
      const onError = () => done(false);

      horseSoundRef.current = audio;
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);
      audio.currentTime = 0;
      const played = audio.play();
      if (played && typeof played.catch === "function") {
        played.catch(() => done(false));
      }
    });
  }, []);

  // ── ElevenLabs TTS via /api/speak ──
  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (horseSoundRef.current) {
        horseSoundRef.current.pause();
        horseSoundRef.current.currentTime = 0;
        horseSoundRef.current = null;
      }
      setState("speaking");
      try {
        const url = `/api/speak?mode=${encodeURIComponent(mode)}&text=${encodeURIComponent(text)}`;
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          audio.preload = "auto";
          currentAudioRef.current = audio;
          const done = () => {
            audio.removeEventListener("ended", done);
            audio.removeEventListener("error", done);
            if (currentAudioRef.current === audio) {
              currentAudioRef.current = null;
            }
            resolve();
          };
          audio.addEventListener("ended", done);
          audio.addEventListener("error", done);
          audio.play().catch(done);
        });
      } catch {
        // ignore TTS failure
      }
    },
    [mode, setState],
  );

  // ── Whisper STT: record until silence, return transcript ──
  const recordUntilSilence = useCallback(
    async (sessionId: number): Promise<string> => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error("Microphone not supported in this browser.");
      }

      const activeStream =
        streamRef.current?.active &&
        streamRef.current.getAudioTracks().some((track) => track.readyState === "live")
          ? streamRef.current
          : null;
      const stream =
        activeStream ??
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }));
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const browserWindow = window as BrowserWindow;
      const Recognition =
        browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
      let liveTranscript = "";
      let hasDetectedSpeech = false;
      let resolveRecognitionDone: () => void = () => {};
      let recognitionResolved = false;
      const recognitionDone = new Promise<void>((resolve) => {
        resolveRecognitionDone = () => {
          if (!recognitionResolved) {
            recognitionResolved = true;
            resolve();
          }
        };
      });

      const blob = await new Promise<Blob>((resolve) => {
        let silenceStart = Date.now();
        let spoke = false;
        let raf = 0;
        let finished = false;
        const recognition = Recognition ? new Recognition() : null;
        let pendingTranscriptFrame = 0;

        const finish = () => {
          if (finished) {
            return;
          }
          finished = true;
          cancelAnimationFrame(raf);
          cancelAnimationFrame(pendingTranscriptFrame);
          if (recognition && recognitionRef.current === recognition) {
            try {
              recognition.stop();
            } catch {
              resolveRecognitionDone();
            }
          } else {
            resolveRecognitionDone();
          }
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        };

        recorder.addEventListener("dataavailable", (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        });
        recorder.addEventListener("stop", async () => {
          await recognitionDone;
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        });

        if (recognition) {
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";
          recognition.onresult = (event) => {
            let nextFinal = "";
            let nextInterim = "";
            for (let i = 0; i < event.results.length; i += 1) {
              const result = event.results[i];
              const chunk = result[0]?.transcript.trim();
              if (!chunk) {
                continue;
              }
              if (result.isFinal) {
                nextFinal = `${nextFinal} ${chunk}`.trim();
              } else {
                nextInterim = `${nextInterim} ${chunk}`.trim();
              }
            }
            const nextTranscript = `${nextFinal} ${nextInterim}`.trim();
            if (!nextTranscript) {
              return;
            }
            hasDetectedSpeech = true;
            silenceStart = Date.now();
            spoke = true;
            if (liveTextRef.current === nextTranscript) {
              liveTranscript = nextTranscript;
              return;
            }
            liveTranscript = nextTranscript;
            liveTextRef.current = nextTranscript;
            cancelAnimationFrame(pendingTranscriptFrame);
            pendingTranscriptFrame = requestAnimationFrame(() => {
              setTranscript("Listening");
              setLiveUserText(nextTranscript);
            });
          };
          recognition.onerror = () => {
            resolveRecognitionDone();
          };
          recognition.onend = () => {
            if (recognitionRef.current === recognition) {
              recognitionRef.current = null;
            }
            resolveRecognitionDone();
          };
          recognitionRef.current = recognition;
          try {
            recognition.start();
          } catch {
            recognitionRef.current = null;
            resolveRecognitionDone();
          }
        } else {
          resolveRecognitionDone();
        }

        const monitor = () => {
          if (!isSessionActive(sessionId)) {
            finish();
            return;
          }
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);

          if (rms > SPEECH_THRESHOLD) {
            if (!spoke && debug && !hasDetectedSpeech) {
              setTranscript("Speech detected");
            }
            spoke = true;
            hasDetectedSpeech = true;
            silenceStart = Date.now();
          } else if (spoke && rms < RELEASE_THRESHOLD) {
            const silenceWindow = liveTranscript
              ? LIVE_TRANSCRIPT_SILENCE_MS
              : SILENCE_MS;

            if (Date.now() - silenceStart > silenceWindow) {
              setTranscript("Transcribing");
              finish();
              return;
            }
          } else if (spoke) {
            silenceStart = Date.now();
          }
          raf = requestAnimationFrame(monitor);
        };

        recorder.start();
        raf = requestAnimationFrame(monitor);
      });

      recorderRef.current = null;
      void ctx.close().catch(() => {});
      audioCtxRef.current = null;
      if (!isSessionActive(sessionId)) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) {
          streamRef.current = null;
        }
      }

      if (!blob.size) {
        return "";
      }
      if (!isSessionActive(sessionId)) {
        return "";
      }
      if (liveTranscript.trim()) {
        return liveTranscript.trim();
      }

      setTranscript("Transcribing");
      const form = new FormData();
      form.append(
        "audio",
        new File([blob], "turn.webm", { type: blob.type || "audio/webm" }),
      );
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!isSessionActive(sessionId)) {
        return "";
      }
      if (!res.ok) {
        throw new Error(json.error ?? "Transcription failed.");
      }
      return (json.text ?? "").trim();
    },
    [debug, isSessionActive],
  );

  const streamReply = useCallback(async (
    messages: ChatMessage[],
    onContent: (content: string) => void,
  ): Promise<string> => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, mode: readStoredMode() }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      throw new Error(data?.error ?? "The stable line dropped.");
    }
    if (!res.body) {
      throw new Error("The response stream was empty.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as ChatStreamEvent;
      if (event.type === "delta") {
        assistantText += event.delta;
        onContent(assistantText);
      }
      if (event.type === "final") {
        assistantText = event.content;
        onContent(assistantText);
      }
      if (event.type === "error") throw new Error(event.error);
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
    if (buffer.trim()) handleLine(buffer);

    return assistantText.trim();
  }, []);

  // ── One full turn: listen → think → horse sound → speak → horse sound ──
  const runTurn = useCallback(async (sessionId: number) => {
    if (busyRef.current || !isSessionActive(sessionId)) {
      return;
    }
    busyRef.current = true;
    let shouldContinue = false;
    let latestReplyText = "";
    let pendingReplyFrame = 0;
    let turnFailed = false;

    try {
      setState("listening");
      setTranscript("Listening");
      setLiveUserText("");
      liveTextRef.current = "";
      const userText = await recordUntilSilence(sessionId);

      if (!isSessionActive(sessionId)) {
        return;
      }
      if (!userText) {
        setTranscript("I didn't catch that");
        shouldContinue = true;
        return;
      }

      setLiveUserText("");
      liveTextRef.current = "";
      const userMessage: ChatMessage = { role: "user", content: userText };
      const firstUserText =
        savedMessagesRef.current.find((message) => message.role === "user")
          ?.content ?? userText;
      const savedTurnMessages = [
        ...savedMessagesRef.current,
        userMessage,
      ].slice(-MAX_SAVED_MESSAGES);
      const turnMessages = savedTurnMessages.slice(-MAX_HISTORY);
      const pendingMessages = [
        ...turnMessages,
        { role: "assistant" as const, content: "" },
      ].slice(-MAX_HISTORY);

      historyRef.current = pendingMessages;
      savedMessagesRef.current = savedTurnMessages;
      setHistory(pendingMessages);
      persistVoiceThread(savedTurnMessages, firstUserText);

      setState("thinking");
      setTranscript("Thinking");
      let canRevealReply = false;
      const startCuePromise = playHorseSound();
      const showReplyText = (content: string) => {
        setTranscript("Responding");
        setHistory((current) => {
          const nextMessages = [...current];
          let replaced = false;

          for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
            if (nextMessages[index]?.role === "assistant") {
              nextMessages[index] = { role: "assistant", content };
              replaced = true;
              break;
            }
          }

          if (!replaced) {
            nextMessages.push({ role: "assistant", content });
          }

          const next = nextMessages.slice(-MAX_HISTORY);
          historyRef.current = next;

          return next;
        });
      };
      const queueReplyText = () => {
        if (!canRevealReply || !latestReplyText || pendingReplyFrame) {
          return;
        }

        pendingReplyFrame = requestAnimationFrame(() => {
          pendingReplyFrame = 0;
          showReplyText(latestReplyText);
        });
      };
      const revealGate = startCuePromise
        .then(waitForStartSoundTail)
        .then(() => {
          if (turnFailed || !isSessionActive(sessionId)) {
            return;
          }
          canRevealReply = true;
          queueReplyText();
        });

      const reply = await streamReply(turnMessages, (content) => {
        latestReplyText = content;
        queueReplyText();
      });
      await revealGate;
      if (pendingReplyFrame) {
        cancelAnimationFrame(pendingReplyFrame);
        pendingReplyFrame = 0;
        showReplyText(latestReplyText || reply);
      }
      if (!isSessionActive(sessionId)) {
        return;
      }

      if (!reply) {
        throw new Error("The stable line dropped.");
      }

      const finalSavedMessages = [
        ...savedTurnMessages,
        { role: "assistant" as const, content: reply },
      ].slice(-MAX_SAVED_MESSAGES);
      const finalVisibleMessages = finalSavedMessages.slice(-MAX_HISTORY);

      savedMessagesRef.current = finalSavedMessages;
      historyRef.current = finalVisibleMessages;
      setHistory(finalVisibleMessages);
      persistVoiceThread(finalSavedMessages, firstUserText);
      setTranscript("Speaking");

      await speak(reply);
      if (!isSessionActive(sessionId)) return;

      shouldContinue = isSessionActive(sessionId);
    } catch (err) {
      turnFailed = true;
      if (pendingReplyFrame) {
        cancelAnimationFrame(pendingReplyFrame);
      }
      setHistory((current) => {
        const lastMessage = current[current.length - 1];
        const next =
          lastMessage?.role === "assistant" && !lastMessage.content
            ? current.slice(0, -1)
            : current;
        historyRef.current = next;

        return next;
      });
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("");
    } finally {
      busyRef.current = false;
      if (shouldContinue && isSessionActive(sessionId)) {
        void runTurn(sessionId);
      } else if (!isSessionActive(sessionId)) {
        setState("");
      }
    }
  }, [
    isSessionActive,
    persistVoiceThread,
    playHorseSound,
    recordUntilSilence,
    setState,
    speak,
    streamReply,
  ]);

  const stopEverything = useCallback(() => {
    sessionRef.current += 1;
    convoModeRef.current = false;
    busyRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (horseSoundRef.current) {
      horseSoundRef.current.pause();
      horseSoundRef.current.currentTime = 0;
      horseSoundRef.current = null;
    }
    Object.values(soundCacheRef.current).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLiveUserText("");
    setState("");
  }, [setState]);

  const toggleConvo = useCallback(() => {
    if (convoMode) {
      setConvoMode(false);
      stopEverything();
      setTranscript("The conversation has ended.");
      return;
    }
    setError(null);
    setHistory([]);
    setLiveUserText("");
    setConvoMode(true);
    historyRef.current = [];
    savedMessagesRef.current = [];
    voiceThreadIdRef.current = null;
    liveTextRef.current = "";
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;
    convoModeRef.current = true;
    setState("listening");
    setTranscript("Listening");
    void runTurn(sessionId);
  }, [convoMode, runTurn, setState, stopEverything]);

  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, [stopEverything]);

  return (
    <div className={`cube-wrap ${mode === "unicorn" ? "unicorn-mode" : "horse-mode"}`}>
      <div className={`ambient-glow ${cubeState}`} />

      <section className="voice-panel" aria-label="Voice controls">
        <div className="horse-stage">
        <svg
          className={`horse ${cubeState}`}
          viewBox="0 0 200 200"
          role="img"
          aria-label={mode === "unicorn" ? "UnicornGPT" : "HorseGPT"}
        >
          <defs>
            <linearGradient id="unicornManeGradient" x1="60" y1="50" x2="140" y2="122" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff4f8b" />
              <stop offset="18%" stopColor="#ff9f1c" />
              <stop offset="34%" stopColor="#ffe45e" />
              <stop offset="50%" stopColor="#47e07f" />
              <stop offset="68%" stopColor="#43c7ff" />
              <stop offset="84%" stopColor="#8f7aff" />
              <stop offset="100%" stopColor="#f45dff" />
            </linearGradient>
            <linearGradient id="unicornHornGradient" x1="92" y1="21" x2="112" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fff6a6" />
              <stop offset="38%" stopColor="#ff91d8" />
              <stop offset="72%" stopColor="#8bdcff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          {/* Soft shadow under the horse */}
          <ellipse className="horse-shadow" cx="100" cy="182" rx="46" ry="9" />

          {/* The whole head bobs / nods as one group */}
          <g className="horse-head">
            <path className="horn" d="M100 20 L111 66 L89 66 Z" />
            <path className="horn-ridge" d="M96 34 C101 38 105 40 109 43M94 47 C100 50 105 52 111 55" />

            {/* Ears */}
            <g className="ear ear-left">
              <path d="M70 58 L60 22 L86 50 Z" />
              <path className="ear-inner" d="M71 52 L66 33 L80 49 Z" />
            </g>
            <g className="ear ear-right">
              <path d="M130 58 L140 22 L114 50 Z" />
              <path className="ear-inner" d="M129 52 L134 33 L120 49 Z" />
            </g>

            {/* Mane */}
            <path
              className="mane"
              d="M64 56 C58 70 56 92 60 120 C70 104 74 104 80 116 C84 96 90 92 96 110 C100 88 108 86 112 108 C120 96 126 100 134 118 C140 92 140 70 134 56 Z"
            />

            {/* Face / muzzle */}
            <path
              className="face"
              d="M70 56 C70 48 130 48 130 56 C136 74 134 104 124 128 C118 144 110 156 100 156 C90 156 82 144 76 128 C66 104 64 74 70 56 Z"
            />

            {/* Cheek light */}
            <path className="cheek" d="M82 92 C88 86 96 86 100 92 C96 104 86 104 82 92 Z" />

            {/* Eyes */}
            <g className="eye eye-left">
              <ellipse className="eye-white" cx="84" cy="86" rx="9" ry="10" />
              <circle className="pupil" cx="85" cy="87" r="5" />
              <circle className="glint" cx="83" cy="84" r="1.8" />
              <rect className="lid" x="74" y="74" width="20" height="24" rx="9" />
            </g>
            <g className="eye eye-right">
              <ellipse className="eye-white" cx="116" cy="86" rx="9" ry="10" />
              <circle className="pupil" cx="115" cy="87" r="5" />
              <circle className="glint" cx="113" cy="84" r="1.8" />
              <rect className="lid" x="106" y="74" width="20" height="24" rx="9" />
            </g>

            {/* Muzzle + nostrils + mouth */}
            <g className="muzzle">
              <ellipse className="muzzle-base" cx="100" cy="130" rx="22" ry="20" />
              <ellipse className="nostril" cx="91" cy="128" rx="3.4" ry="5" />
              <ellipse className="nostril" cx="109" cy="128" rx="3.4" ry="5" />
              <path className="mouth" d="M88 142 Q100 150 112 142" />
            </g>
          </g>
        </svg>
        </div>

        <div className="status-area">
          <div className="cube-transcript">{transcript}</div>
          {error ? <div className="cube-error">{error}</div> : null}
        </div>

        <div className="cube-controls">
          <button
            type="button"
            className={`convo-btn ${convoMode ? "active" : ""}`}
            onClick={() => void toggleConvo()}
          >
            {convoMode ? "End Conversation" : "Start Conversation"}
          </button>
          <Link href="/" className="cube-link">
            Back to chat
          </Link>
        </div>
      </section>

      <section className="conversation-panel" aria-label="Conversation transcript">
        <div className="conversation-header">
          <span>Conversation</span>
          <span className={`conversation-state ${cubeState || "idle"}`}>
            {convoMode ? transcript : "Idle"}
          </span>
        </div>
        <div
          className="conversation-log"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {history.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`voice-message ${message.role}`}
              aria-label={message.role === "user" ? "You" : "HorseGPT"}
            >
              <div className="voice-bubble">
                {message.content ? (
                  message.content
                ) : (
                  <span className="thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            </div>
          ))}
          {liveUserText ? (
            <div className="voice-message user live" aria-label="You">
              <div className="voice-bubble">{liveUserText}</div>
            </div>
          ) : null}
          <div ref={conversationEndRef} />
        </div>
      </section>

      <style jsx>{`
        .cube-wrap {
          position: relative;
          display: grid;
          grid-template-columns: minmax(280px, 0.92fr) minmax(320px, 1fr);
          grid-template-areas: "conversation voice";
          align-items: center;
          justify-items: stretch;
          height: 100dvh;
          overflow: hidden;
          gap: clamp(18px, 3vw, 40px);
          padding: clamp(16px, 4vh, 40px);
        }
        .cube-wrap.unicorn-mode {
          background:
            linear-gradient(120deg, rgba(255, 79, 139, 0.18), rgba(255, 159, 28, 0.12) 18%, rgba(255, 228, 94, 0.14) 34%, rgba(71, 224, 127, 0.12) 50%, rgba(67, 199, 255, 0.14) 68%, rgba(143, 122, 255, 0.16) 84%, rgba(244, 93, 255, 0.18)),
            radial-gradient(ellipse at top, rgba(255, 255, 255, 0.86), transparent 52%),
            #fff5fc;
        }
        .cube-wrap.unicorn-mode::before {
          content: "";
          position: absolute;
          inset: -18% -12%;
          pointer-events: none;
          background:
            repeating-linear-gradient(
              105deg,
              rgba(255, 79, 139, 0.16) 0 22px,
              rgba(255, 159, 28, 0.13) 22px 44px,
              rgba(255, 228, 94, 0.13) 44px 66px,
              rgba(71, 224, 127, 0.12) 66px 88px,
              rgba(67, 199, 255, 0.13) 88px 110px,
              rgba(143, 122, 255, 0.14) 110px 132px,
              rgba(244, 93, 255, 0.16) 132px 154px
            );
          filter: saturate(1.25);
          opacity: 0.55;
          transform: rotate(-6deg);
          animation: rainbowDrift 16s linear infinite;
        }
        .cube-wrap.unicorn-mode::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.54), transparent 32%),
            radial-gradient(ellipse at 50% 110%, rgba(255, 231, 94, 0.2), transparent 48%);
        }
        .voice-panel {
          grid-area: voice;
          position: relative;
          z-index: 2;
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: clamp(12px, 2vh, 24px);
        }
        .ambient-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(124, 92, 246, 0.18) 0%,
            rgba(236, 72, 153, 0.1) 40%,
            transparent 70%
          );
          filter: blur(60px);
          pointer-events: none;
          transition: transform 0.6s ease, opacity 0.6s ease;
          opacity: 0.5;
        }
        .unicorn-mode .ambient-glow {
          background:
            conic-gradient(
              from 90deg,
              rgba(255, 79, 139, 0.28),
              rgba(255, 228, 94, 0.24),
              rgba(71, 224, 127, 0.22),
              rgba(67, 199, 255, 0.25),
              rgba(143, 122, 255, 0.26),
              rgba(244, 93, 255, 0.28),
              rgba(255, 79, 139, 0.28)
            );
          filter: blur(70px) saturate(1.35);
          opacity: 0.9;
          animation: rainbowSpin 18s linear infinite;
        }
        .conversation-panel {
          grid-area: conversation;
          position: relative;
          z-index: 2;
          display: flex;
          min-width: 0;
          height: min(72dvh, 720px);
          min-height: 420px;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--border, rgba(84, 63, 48, 0.12));
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.62), transparent 28%),
            var(--surface-strong, rgba(255, 251, 247, 0.88));
          backdrop-filter: blur(22px) saturate(1.2);
          -webkit-backdrop-filter: blur(22px) saturate(1.2);
        }
        .unicorn-mode .conversation-panel {
          border-color: rgba(255, 91, 208, 0.24);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.18) 36%),
            linear-gradient(135deg, rgba(255, 84, 172, 0.16), rgba(77, 204, 255, 0.14) 48%, rgba(255, 226, 94, 0.16)),
            rgba(255, 248, 255, 0.82);
        }
        .conversation-header {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 18px 12px;
          border-bottom: 1px solid var(--border, rgba(84, 63, 48, 0.12));
          color: var(--foreground, #1a140e);
          font-size: 14px;
          font-weight: 650;
        }
        .unicorn-mode .conversation-header {
          border-bottom-color: rgba(214, 29, 149, 0.16);
          color: #451154;
        }
        .conversation-state {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          max-width: 46%;
          overflow: hidden;
          border-radius: 999px;
          padding: 5px 10px;
          background: rgba(255, 255, 255, 0.48);
          color: var(--muted, #8a7a6a);
          font-size: 12px;
          font-weight: 550;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .conversation-state::before {
          content: "";
          flex: 0 0 auto;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: currentColor;
          opacity: 0.45;
        }
        .conversation-state.listening {
          color: #2563eb;
        }
        .conversation-state.listening::before {
          animation: statusPulse 0.9s ease-in-out infinite;
        }
        .conversation-state.thinking {
          color: #925f18;
        }
        .conversation-state.thinking::before {
          animation: statusPulse 1.1s ease-in-out infinite;
        }
        .conversation-state.speaking {
          color: var(--accent, #8d5f42);
        }
        .conversation-state.speaking::before {
          animation: statusPulse 0.7s ease-in-out infinite;
        }
        .unicorn-mode .conversation-state {
          background:
            linear-gradient(white, white) padding-box,
            linear-gradient(90deg, #ff4f8b, #ffe45e, #47e07f, #43c7ff, #f45dff) border-box;
          border: 1px solid transparent;
          color: #c01786;
        }
        .conversation-log {
          display: flex;
          min-height: 0;
          flex: 1 1 auto;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          padding: 18px;
          scroll-behavior: smooth;
          scrollbar-width: thin;
        }
        .voice-message {
          display: flex;
          width: 100%;
          animation: messageIn 160ms ease-out;
        }
        .voice-message.assistant {
          justify-content: flex-start;
        }
        .voice-message.user {
          justify-content: flex-end;
        }
        .voice-bubble {
          max-width: min(82%, 32rem);
          border-radius: 18px;
          padding: 10px 13px;
          color: var(--foreground, #1a140e);
          font-size: 15px;
          line-height: 1.45;
          overflow-wrap: anywhere;
          transition:
            background 140ms ease,
            border-color 140ms ease,
            opacity 140ms ease;
        }
        .voice-message.assistant .voice-bubble {
          border: 1px solid var(--border, rgba(84, 63, 48, 0.12));
          background: var(--assistant-bubble, rgba(255, 250, 245, 0.78));
        }
        .unicorn-mode .voice-message.assistant .voice-bubble {
          border-color: rgba(255, 91, 208, 0.24);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 236, 250, 0.74)),
            rgba(255, 234, 248, 0.84);
        }
        .voice-message.user .voice-bubble {
          background: var(--user-bubble, #8d5f42);
          color: var(--user-text, #fff9f4);
        }
        .unicorn-mode .voice-message.user .voice-bubble {
          background: linear-gradient(135deg, #ff4f8b, #8f7aff 48%, #43c7ff);
          color: #fff;
        }
        .voice-message.live .voice-bubble {
          opacity: 0.92;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.24) inset;
        }
        .thinking-dots {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-width: 34px;
          height: 18px;
        }
        .thinking-dots span {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: currentColor;
          opacity: 0.38;
          animation: dotPulse 1s ease-in-out infinite;
        }
        .thinking-dots span:nth-child(2) {
          animation-delay: 0.14s;
        }
        .thinking-dots span:nth-child(3) {
          animation-delay: 0.28s;
        }
        .ambient-glow.speaking {
          transform: scale(1.3);
          opacity: 0.95;
        }
        .ambient-glow.listening {
          transform: scale(1);
          opacity: 0.7;
        }
        .ambient-glow.thinking {
          opacity: 0.8;
        }
        .horse-stage {
          --horse-size: clamp(180px, 34vh, 300px);
          width: var(--horse-size);
          height: var(--horse-size);
          position: relative;
          z-index: 2;
          flex-shrink: 0;
        }
        .unicorn-mode .horse-stage {
          filter:
            drop-shadow(0 22px 36px rgba(214, 29, 149, 0.16))
            drop-shadow(0 0 22px rgba(67, 199, 255, 0.16));
        }
        .horse {
          width: 100%;
          height: 100%;
          overflow: visible;
          /* Gentle idle breathing for the whole horse. */
          animation: horseBreathe 4.5s ease-in-out infinite;
        }

        .horse-shadow {
          fill: rgba(84, 63, 48, 0.18);
          animation: shadowBreathe 4.5s ease-in-out infinite;
        }
        .unicorn-mode .horse-shadow {
          fill: rgba(166, 51, 173, 0.16);
        }

        /* ── Palette (warm horse) ── */
        .face {
          fill: #b07d4f;
        }
        .mane {
          fill: #6f4a2c;
        }
        .horn {
          display: none;
          fill: url(#unicornHornGradient);
          stroke: rgba(177, 94, 255, 0.34);
          stroke-width: 1.2;
        }
        .horn-ridge {
          display: none;
          fill: none;
          stroke: rgba(255, 255, 255, 0.88);
          stroke-width: 2;
          stroke-linecap: round;
        }
        .cheek {
          fill: rgba(255, 233, 204, 0.35);
        }
        .muzzle-base {
          fill: #9c6a3e;
        }
        .nostril {
          fill: #4a3320;
          transform-box: fill-box;
          transform-origin: center;
        }
        .mouth {
          fill: none;
          stroke: #4a3320;
          stroke-width: 2.4;
          stroke-linecap: round;
        }
        .ear path {
          fill: #a9743f;
        }
        .ear .ear-inner {
          fill: #d9a36c;
        }
        .unicorn-mode .face {
          fill: #fffafd;
          stroke: rgba(255, 111, 214, 0.24);
          stroke-width: 1.8;
        }
        .unicorn-mode .mane {
          fill: url(#unicornManeGradient);
          filter: drop-shadow(0 0 10px rgba(244, 93, 255, 0.24));
        }
        .unicorn-mode .horn,
        .unicorn-mode .horn-ridge {
          display: block;
        }
        .unicorn-mode .cheek {
          fill: rgba(255, 125, 208, 0.18);
        }
        .unicorn-mode .muzzle-base {
          fill: #fff1fb;
          stroke: rgba(119, 213, 255, 0.22);
          stroke-width: 1.3;
        }
        .unicorn-mode .nostril {
          fill: #6e2a7d;
        }
        .unicorn-mode .mouth {
          stroke: #b51f91;
        }
        .unicorn-mode .ear path {
          fill: #fffafd;
          stroke: rgba(255, 111, 214, 0.22);
          stroke-width: 1;
        }
        .unicorn-mode .ear .ear-inner {
          fill: #ffd9f4;
          stroke: none;
        }
        .eye-white {
          fill: #fffaf4;
        }
        .pupil {
          fill: #2a1c12;
        }
        .glint {
          fill: #fff;
        }
        .lid {
          fill: #b07d4f;
          transform-box: fill-box;
          transform-origin: center;
          transform: scaleY(0);
          animation: blink 5.2s ease-in-out infinite;
        }
        .eye-right .lid {
          animation-delay: 0.04s;
        }
        .unicorn-mode .pupil {
          fill: #351152;
        }
        .unicorn-mode .lid {
          fill: #fffafd;
        }

        /* The head group bobs gently; nods faster while speaking. */
        .horse-head {
          transform-box: fill-box;
          transform-origin: 100px 60px;
          animation: headBob 4.5s ease-in-out infinite;
        }

        /* Ears flick subtly, out of phase. */
        .ear {
          transform-box: fill-box;
          transform-origin: bottom center;
        }
        .ear-left {
          animation: earFlickL 6s ease-in-out infinite;
        }
        .ear-right {
          animation: earFlickR 6.8s ease-in-out infinite;
        }

        .muzzle {
          transform-box: fill-box;
          transform-origin: 100px 130px;
        }

        /* ── State reactions ── */
        /* Listening: head tilts attentively, ears perk. */
        .horse.listening .horse-head {
          animation: headListen 3s ease-in-out infinite;
        }
        /* Thinking: slow side-to-side ponder. */
        .horse.thinking .horse-head {
          animation: headThink 2.4s ease-in-out infinite;
        }
        /* Speaking: lively nod + mouth/nostril movement. */
        .horse.speaking .horse-head {
          animation: headNod 0.5s ease-in-out infinite;
        }
        .horse.speaking .muzzle {
          animation: muzzleTalk 0.34s ease-in-out infinite;
        }
        .horse.speaking .nostril {
          animation: nostrilFlare 0.34s ease-in-out infinite;
        }

        @keyframes horseBreathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.018);
          }
        }
        @keyframes shadowBreathe {
          0%,
          100% {
            transform: scaleX(1);
            opacity: 0.18;
          }
          50% {
            transform: scaleX(1.06);
            opacity: 0.24;
          }
        }
        @keyframes headBob {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-3px) rotate(0deg);
          }
        }
        @keyframes blink {
          0%,
          92%,
          100% {
            transform: scaleY(0);
          }
          95%,
          97% {
            transform: scaleY(1);
          }
        }
        @keyframes earFlickL {
          0%,
          70%,
          100% {
            transform: rotate(0deg);
          }
          78% {
            transform: rotate(-9deg);
          }
        }
        @keyframes earFlickR {
          0%,
          60%,
          100% {
            transform: rotate(0deg);
          }
          68% {
            transform: rotate(9deg);
          }
        }
        @keyframes headListen {
          0%,
          100% {
            transform: rotate(-4deg) translateY(0);
          }
          50% {
            transform: rotate(-4deg) translateY(-2px);
          }
        }
        @keyframes headThink {
          0%,
          100% {
            transform: rotate(-3deg);
          }
          50% {
            transform: rotate(3deg);
          }
        }
        @keyframes headNod {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(2.5px) rotate(1deg);
          }
        }
        @keyframes muzzleTalk {
          0%,
          100% {
            transform: scaleY(1) translateY(0);
          }
          50% {
            transform: scaleY(1.16) translateY(1.5px);
          }
        }
        @keyframes nostrilFlare {
          0%,
          100% {
            transform: scaleX(1);
          }
          50% {
            transform: scaleX(1.25);
          }
        }
        @keyframes messageIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes dotPulse {
          0%,
          100% {
            opacity: 0.28;
            transform: translateY(0);
          }
          50% {
            opacity: 0.72;
            transform: translateY(-2px);
          }
        }
        @keyframes statusPulse {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(1);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.45);
          }
        }
        @keyframes rainbowDrift {
          from {
            transform: translateX(-5%) rotate(-6deg);
          }
          to {
            transform: translateX(5%) rotate(-6deg);
          }
        }
        @keyframes rainbowSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes rainbowButton {
          from {
            background-position: 0% 50%;
          }
          to {
            background-position: 180% 50%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .cube-wrap.unicorn-mode::before,
          .unicorn-mode .ambient-glow,
          .unicorn-mode .convo-btn,
          .horse,
          .horse-head,
          .horse-shadow,
          .lid,
          .ear,
          .muzzle,
          .nostril,
          .voice-message,
          .thinking-dots span,
          .conversation-state::before {
            animation: none !important;
          }
        }
        .status-area {
          text-align: center;
          z-index: 2;
          max-width: min(540px, 90vw);
        }
        .status-label {
          font-size: 11px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: var(--muted, #8a7a6a);
          margin-bottom: 8px;
        }
        .cube-transcript {
          min-height: 1.45em;
          font-size: clamp(15px, 2.2vh, 18px);
          line-height: 1.45;
          color: var(--foreground, #1a140e);
        }
        .cube-error {
          margin-top: 8px;
          font-size: 13px;
          color: #dc2626;
        }
        .cube-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          z-index: 2;
        }
        .convo-btn {
          padding: 12px 28px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #8a5a2b, #b4824a);
          transition:
            transform 0.15s ease,
            filter 0.15s ease,
            box-shadow 0.15s ease;
        }
        .unicorn-mode .convo-btn {
          background: linear-gradient(90deg, #ff4f8b, #ff9f1c, #ffe45e, #47e07f, #43c7ff, #8f7aff, #f45dff);
          background-size: 180% 100%;
          color: #fff;
          box-shadow: 0 12px 28px rgba(214, 29, 149, 0.2);
          animation: rainbowButton 8s linear infinite;
        }
        .convo-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }
        .convo-btn:active {
          transform: translateY(0) scale(0.98);
        }
        .convo-btn:focus-visible,
        .cube-link:focus-visible {
          outline: 2px solid var(--accent, #8d5f42);
          outline-offset: 4px;
        }
        .convo-btn.active {
          background: linear-gradient(135deg, #dc2626, #f87171);
          box-shadow: 0 10px 26px rgba(220, 38, 38, 0.18);
        }
        .unicorn-mode .convo-btn.active {
          background: linear-gradient(90deg, #d61d95, #8f7aff, #43c7ff);
          box-shadow: 0 12px 28px rgba(214, 29, 149, 0.24);
        }
        .cube-link {
          font-size: 14px;
          color: var(--muted, #8a7a6a);
          text-decoration: underline;
        }
        .unicorn-mode .cube-link,
        .unicorn-mode .cube-transcript {
          color: #6d217c;
        }
        @media (max-width: 860px) {
          .cube-wrap {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto minmax(0, 1fr);
            grid-template-areas:
              "voice"
              "conversation";
            gap: 12px;
            padding: 14px;
          }
          .voice-panel {
            gap: 10px;
          }
          .horse-stage {
            --horse-size: clamp(150px, 26vh, 220px);
          }
          .conversation-panel {
            height: auto;
            min-height: 0;
            align-self: stretch;
            border-radius: 20px;
          }
          .conversation-header {
            padding: 12px 14px 10px;
          }
          .conversation-log {
            padding: 14px;
          }
          .voice-bubble {
            max-width: 88%;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}
