"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage, ChatMode } from "@/types/chat";

type CubeState = "" | "listening" | "thinking" | "speaking";

const HORSE_SOUNDS = Array.from(
  { length: 8 },
  (_, index) => `/sounds/horse-${index + 1}.mp3`,
);
const MODE_STORAGE_KEY = "horsegpt-chat-mode";
// Stop a recording turn once the mic has been quiet for this long.
const SILENCE_MS = 1500;
const SILENCE_THRESHOLD = 0.012;
const MAX_HISTORY = 16;

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function readStoredMode(): ChatMode {
  if (typeof window === "undefined") {
    return "horse";
  }
  return window.localStorage.getItem(MODE_STORAGE_KEY) === "unicorn"
    ? "unicorn"
    : "horse";
}

export function VoiceCube() {
  const [cubeState, setCubeState] = useState<CubeState>("");
  const [statusLabel, setStatusLabel] = useState("IDLE");
  const [transcript, setTranscript] = useState(
    "Press Start Conversation and talk to the horse",
  );
  const [convoMode, setConvoMode] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode] = useState<ChatMode>(readStoredMode);

  // Mutable refs so async loops always see current values.
  const convoModeRef = useRef(false);
  const busyRef = useRef(false);
  const historyRef = useRef<ChatMessage[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundCacheRef = useRef<Record<string, HTMLAudioElement>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const setState = useCallback((next: CubeState) => {
    setCubeState(next);
    setStatusLabel(next ? next.toUpperCase() : "IDLE");
  }, []);

  // ── Play a random horse clip, resolve when it finishes ──
  const playHorseSound = useCallback(() => {
    if (typeof Audio === "undefined") {
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
  }, []);

  // ── ElevenLabs TTS via /api/speak ──
  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }
      setState("speaking");
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, mode }),
        });
        if (!res.ok) {
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          currentAudioRef.current = audio;
          const done = () => {
            URL.revokeObjectURL(url);
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
  const recordUntilSilence = useCallback(async (): Promise<string> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      throw new Error("Microphone not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];

    // Silence detection via Web Audio analyser.
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

    const blob = await new Promise<Blob>((resolve) => {
      let silenceStart = Date.now();
      let spoke = false;
      let raf = 0;

      const finish = () => {
        cancelAnimationFrame(raf);
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      });
      recorder.addEventListener("stop", () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      });

      const monitor = () => {
        if (!convoModeRef.current) {
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

        if (rms > SILENCE_THRESHOLD) {
          spoke = true;
          silenceStart = Date.now();
        } else if (spoke && Date.now() - silenceStart > SILENCE_MS) {
          finish();
          return;
        }
        raf = requestAnimationFrame(monitor);
      };

      recorder.start();
      raf = requestAnimationFrame(monitor);
    });

    // Cleanup audio resources.
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    void ctx.close().catch(() => {});
    audioCtxRef.current = null;

    if (!blob.size) {
      return "";
    }

    const form = new FormData();
    form.append(
      "audio",
      new File([blob], "turn.webm", { type: blob.type || "audio/webm" }),
    );
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const json = (await res.json()) as { text?: string; error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Transcription failed.");
    }
    return (json.text ?? "").trim();
  }, []);

  // ── Get the horse's reply from /api/chat (collect the full stream) ──
  const getReply = useCallback(async (userText: string): Promise<string> => {
    const messages = [
      ...historyRef.current,
      { role: "user" as const, content: userText },
    ].slice(-MAX_HISTORY);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, mode: readStoredMode() }),
    });
    if (!res.ok || !res.body) {
      throw new Error("The stable line dropped.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final = "";
    let assembled = "";

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as
        | { type: "delta"; delta: string }
        | { type: "final"; content: string }
        | { type: "notice"; notice: string }
        | { type: "error"; error: string };
      if (event.type === "delta") assembled += event.delta;
      if (event.type === "final") final = event.content;
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

    return (final || assembled).trim();
  }, []);

  // ── One full turn: listen → think → horse sound → speak → horse sound ──
  const runTurn = useCallback(async () => {
    if (busyRef.current || !convoModeRef.current) {
      return;
    }
    busyRef.current = true;

    try {
      // 1. Listen until the person finishes.
      setState("listening");
      setTranscript("Listening…");
      const userText = await recordUntilSilence();

      if (!convoModeRef.current) {
        return;
      }
      if (!userText) {
        // Heard nothing — loop back to listening.
        busyRef.current = false;
        if (convoModeRef.current) void runTurn();
        return;
      }

      setTranscript(`"${userText}"`);
      setHistory((h) =>
        [...h, { role: "user" as const, content: userText }].slice(-MAX_HISTORY),
      );

      // 2. Think (get the reply).
      setState("thinking");
      const reply = await getReply(userText);
      if (!convoModeRef.current) {
        return;
      }

      setHistory((h) =>
        [...h, { role: "assistant" as const, content: reply }].slice(-MAX_HISTORY),
      );
      setTranscript(reply.length > 200 ? `${reply.slice(0, 200)}…` : reply);

      // 3. Random horse sound BEFORE the speech.
      await playHorseSound();
      if (!convoModeRef.current) return;

      // 4. Speak the reply (ElevenLabs).
      await speak(reply);
      if (!convoModeRef.current) return;

      // 5. Random horse sound AFTER the speech.
      await playHorseSound();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("");
    } finally {
      busyRef.current = false;
      // 6. Repeat: listen again.
      if (convoModeRef.current) {
        void runTurn();
      } else {
        setState("");
      }
    }
  }, [getReply, playHorseSound, recordUntilSilence, setState, speak]);

  const stopEverything = useCallback(() => {
    convoModeRef.current = false;
    busyRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setState("");
  }, [setState]);

  const toggleConvo = useCallback(async () => {
    if (convoMode) {
      setConvoMode(false);
      stopEverything();
      setTranscript("The conversation has ended.");
      return;
    }
    setError(null);
    setConvoMode(true);
    convoModeRef.current = true;
    // A horse sound to kick things off, then start the loop.
    setState("speaking");
    await playHorseSound();
    void runTurn();
  }, [convoMode, playHorseSound, runTurn, setState, stopEverything]);

  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, [stopEverything]);

  const cubeFaces = [
    "face-front",
    "face-back",
    "face-left",
    "face-right",
    "face-top",
    "face-bottom",
  ];

  return (
    <div className="cube-wrap">
      <div className={`ambient-glow ${cubeState}`} />

      <div className="cube-stage">
        <div className={`cube ${cubeState === "speaking" ? "speaking" : ""}`}>
          {cubeFaces.map((face) => (
            <div key={face} className={`cube-face ${face}`} />
          ))}
        </div>
      </div>

      <div className="status-area">
        <div className="status-label">{statusLabel}</div>
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

      <style jsx>{`
        .cube-wrap {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100dvh;
          overflow: hidden;
          gap: clamp(12px, 2vh, 24px);
          padding: clamp(16px, 4vh, 40px) 16px;
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
        .cube-stage {
          perspective: 800px;
          --cube-size: clamp(120px, 22vh, 200px);
          width: var(--cube-size);
          height: var(--cube-size);
          position: relative;
          z-index: 2;
          flex-shrink: 0;
        }
        .cube {
          width: var(--cube-size);
          height: var(--cube-size);
          position: relative;
          transform-style: preserve-3d;
          animation: cubeFloat 24s linear infinite;
        }
        .cube-face {
          position: absolute;
          width: var(--cube-size);
          height: var(--cube-size);
          border: 1.5px solid rgba(180, 130, 70, 0.3);
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            rgba(124, 92, 246, 0.12) 0%,
            rgba(180, 130, 70, 0.14) 100%
          );
          overflow: hidden;
        }
        .cube-face::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: linear-gradient(
            45deg,
            rgba(124, 92, 246, 0.35) 0%,
            rgba(180, 130, 70, 0.25) 25%,
            rgba(124, 92, 246, 0.15) 50%,
            rgba(236, 72, 153, 0.3) 75%,
            rgba(124, 92, 246, 0.25) 100%
          );
          background-size: 300% 300%;
          animation: gradientShift 4s ease infinite;
          opacity: 0.8;
        }
        .cube.speaking .cube-face::before {
          opacity: 1;
          animation: gradientShift 1.5s ease infinite;
        }
        .face-front {
          transform: translateZ(calc(var(--cube-size) / 2));
        }
        .face-back {
          transform: rotateY(180deg) translateZ(calc(var(--cube-size) / 2));
        }
        .face-left {
          transform: rotateY(-90deg) translateZ(calc(var(--cube-size) / 2));
        }
        .face-right {
          transform: rotateY(90deg) translateZ(calc(var(--cube-size) / 2));
        }
        .face-top {
          transform: rotateX(90deg) translateZ(calc(var(--cube-size) / 2));
        }
        .face-bottom {
          transform: rotateX(-90deg) translateZ(calc(var(--cube-size) / 2));
        }
        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @keyframes cubeFloat {
          0% {
            transform: rotateX(-15deg) rotateY(0deg);
          }
          25% {
            transform: rotateX(0deg) rotateY(90deg);
          }
          50% {
            transform: rotateX(15deg) rotateY(180deg);
          }
          75% {
            transform: rotateX(0deg) rotateY(270deg);
          }
          100% {
            transform: rotateX(-15deg) rotateY(360deg);
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
          transition: transform 0.15s ease;
        }
        .convo-btn:hover {
          transform: translateY(-1px);
        }
        .convo-btn.active {
          background: linear-gradient(135deg, #dc2626, #f87171);
        }
        .cube-link {
          font-size: 14px;
          color: var(--muted, #8a7a6a);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
