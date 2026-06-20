"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage, ChatMode } from "@/types/chat";

type CubeState = "" | "listening" | "thinking" | "speaking";

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

  // ── Play a random horse clip from the start/end pool, resolve when done ──
  const playHorseSound = useCallback((phase: "start" | "end" = "start") => {
    if (typeof Audio === "undefined") {
      return Promise.resolve();
    }
    const pool = phase === "end" ? HORSE_END_SOUNDS : HORSE_START_SOUNDS;
    const src = pickRandom(pool);
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

      // 5. Longer 3–4s horse noise AFTER the speech.
      await playHorseSound("end");
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

  return (
    <div className="cube-wrap">
      <div className={`ambient-glow ${cubeState}`} />

      <div className="horse-stage">
        <svg
          className={`horse ${cubeState}`}
          viewBox="0 0 200 200"
          role="img"
          aria-label="HorseGPT"
        >
          {/* Soft shadow under the horse */}
          <ellipse className="horse-shadow" cx="100" cy="182" rx="46" ry="9" />

          {/* The whole head bobs / nods as one group */}
          <g className="horse-head">
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
        .horse-stage {
          --horse-size: clamp(180px, 34vh, 300px);
          width: var(--horse-size);
          height: var(--horse-size);
          position: relative;
          z-index: 2;
          flex-shrink: 0;
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

        /* ── Palette (warm horse) ── */
        .face {
          fill: #b07d4f;
        }
        .mane {
          fill: #6f4a2c;
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

        @media (prefers-reduced-motion: reduce) {
          .horse,
          .horse-head,
          .horse-shadow,
          .lid,
          .ear,
          .muzzle,
          .nostril {
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
