"use client";

import Image from "next/image";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { APP_NAME, HORSE_NAME, STORAGE_KEY } from "@/lib/chat-config";
import type { ChatMessage } from "@/types/chat";

type ChatResponse = {
  message: ChatMessage;
  blocked?: boolean;
  reason?: string;
};

const MAX_VISIBLE_MESSAGES = 16;
const LEGACY_WELCOME_MESSAGE =
  "Neigh there. This is HorseGPT: a GPT wrapper with one job, which is letting me, Marigold, answer everything like a horse with suspicious levels of confidence.";
const WELCOME_COLUMNS = [
  {
    title: "Examples",
    interactive: true,
    items: [
      "Explain quantum computing like we're both in a stable.",
      "Write a launch post as a horse.",
      "Roast my startup pitch with hoof energy.",
    ],
  },
  {
    title: "Capabilities",
    interactive: false,
    items: [
      "Answers normal prompts through a horse persona",
      "Keeps the GPT wrapper and guardrails server-side",
      "Supports typed chat and optional voice input",
    ],
  },
  {
    title: "Limitations",
    interactive: false,
    items: [
      "Refuses unsafe veterinary, abusive, or sexual animal content",
      "Can still be wrong, even when neighing with confidence",
      "Horse energy is mandatory and not configurable",
    ],
  },
] as const;

function readStoredMessages() {
  if (typeof window === "undefined") {
    return [];
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved) as ChatMessage[];

    return parsed
      .filter(
        (message): message is ChatMessage =>
          Boolean(message) &&
          typeof message === "object" &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim().length > 0 &&
          message.content !== LEGACY_WELCOME_MESSAGE,
      )
      .slice(-MAX_VISIBLE_MESSAGES);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(readStoredMessages);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, error, notice]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function sendMessage(rawText?: string) {
    const nextText = (rawText ?? composer).trim();

    if (!nextText || isSending) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: nextText }];

    setComposer("");
    setError(null);
    setNotice(null);
    setIsSending(true);
    startTransition(() => {
      setMessages(nextMessages.slice(-MAX_VISIBLE_MESSAGES));
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await response.json()) as ChatResponse & { error?: string };

      if (!response.ok || !data.message) {
        throw new Error(data.error ?? "The stable line dropped.");
      }

      startTransition(() => {
        setMessages((current) =>
          [...current, data.message].slice(-MAX_VISIBLE_MESSAGES),
        );
      });

      if (data.blocked && data.reason) {
        setNotice(`Guardrail: ${data.reason.replaceAll("_", " ")}`);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The stable line dropped.";

      setError(message);
      startTransition(() => {
        setMessages((current) => current.slice(0, -1));
      });
      setComposer(nextText);
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

      setComposer((current) =>
        current ? `${current.trimEnd()} ${transcript}` : transcript,
      );
      setNotice("Voice note added to the composer.");
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
    if (isTranscribing || isSending) {
      return;
    }

    if (isRecording) {
      recorderRef.current?.stop();
      setNotice("Finishing the recording...");
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
      setNotice("Recording... tap again to stop.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to access the microphone.",
      );
      setNotice(null);
    }
  }

  function clearChat() {
    setMessages([]);
    setComposer("");
    setError(null);
    setNotice(null);
    window.localStorage.removeItem(STORAGE_KEY);
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

  const hasMessages = messages.length > 0;

  return (
    <main className="grain flex h-screen w-full flex-1 overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen w-full flex-col overflow-hidden xl:grid xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-[var(--border)] bg-[var(--sidebar)] px-3 py-3 text-[var(--sidebar-foreground)] xl:border-r xl:border-b-0">
          <button
            type="button"
            onClick={clearChat}
            className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-4 text-left text-base font-medium transition hover:bg-white/6"
          >
            <span className="text-xl leading-none">+</span>
            <span>New chat</span>
          </button>

          <div className="mt-4 flex-1" />

          <div className="space-y-2 border-t border-white/10 pt-4 text-sm text-white/80">
            <button
              type="button"
              onClick={clearChat}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-white/5"
            >
              <span>⌫</span>
              <span>Clear conversations</span>
            </button>
            <div className="flex items-center gap-3 rounded-lg px-3 py-3">
              <span>𐂂</span>
              <span>{APP_NAME}</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg px-3 py-3">
              <span>AI</span>
              <span>GPT wrapper</span>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--panel-strong)]">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              {!hasMessages ? (
                <div className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center py-6 text-center">
                  <Image
                    src="/horse.jpeg"
                    alt="A scrappy horse drawing with a realistic back half and a chaotic front half."
                    width={739}
                    height={500}
                    className="mb-8 w-full max-w-[340px] rounded-2xl border border-[var(--border)] shadow-[0_16px_40px_rgba(64,43,30,0.12)]"
                    priority
                  />
                  <h1 className="text-5xl font-semibold tracking-tight text-[var(--foreground)]">
                    {APP_NAME}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#7a6353]">
                    A GPT wrapper that answers like a horse. Same chat pattern,
                    different hoofwork.
                  </p>

                  <div className="mt-10 grid w-full max-w-4xl gap-4 md:grid-cols-3">
                    {WELCOME_COLUMNS.map((column) => (
                      <div key={column.title} className="space-y-3">
                        <h2 className="text-lg font-medium text-[var(--foreground)]">
                          {column.title}
                        </h2>
                        {column.items.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() =>
                              column.interactive ? setComposer(item) : undefined
                            }
                            className={`w-full rounded-2xl border border-[var(--border)] bg-[#f7f1ea] px-4 py-3 text-sm leading-6 text-[#3e2b21] transition ${
                              column.interactive
                                ? "cursor-pointer hover:bg-[#e6d7ca]"
                                : "cursor-default"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col space-y-6 pb-10">
                  {messages.map((message, index) => {
                    const isAssistant = message.role === "assistant";

                    return (
                      <article
                        key={`${message.role}-${index}-${message.content.slice(0, 16)}`}
                        className={`message-rise flex ${
                          isAssistant ? "justify-start" : "justify-end"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-3xl px-5 py-4 ${
                            isAssistant
                              ? "border border-[var(--border)] bg-[#ede4da] text-[var(--foreground)]"
                              : "bg-[#8a5a3c] text-[#fff8f2]"
                          }`}
                        >
                          <div
                            className={`mb-2 text-[11px] uppercase tracking-[0.18em] ${
                              isAssistant ? "text-[#836958]" : "text-[#f0ddd0]"
                            }`}
                          >
                            {isAssistant ? HORSE_NAME : "You"}
                          </div>
                          <p className="whitespace-pre-wrap text-[15px] leading-7">
                            {message.content}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] bg-[var(--panel-strong)] px-4 py-3 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                <div className="mb-3 flex min-h-6 flex-wrap items-center gap-3 text-sm">
                  {notice ? (
                    <span className="rounded-full border border-[#b8c6af] bg-[#edf2e8] px-3 py-1 text-[#4c5c3f]">
                      {notice}
                    </span>
                  ) : null}
                  {error ? (
                    <span className="rounded-full border border-[#d8bbb0] bg-[#f8eae5] px-3 py-1 text-[#8c3f2e]">
                      {error}
                    </span>
                  ) : null}
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="rounded-[1.4rem] border border-[var(--border)] bg-[#fffaf5] px-4 py-3 shadow-[0_8px_30px_rgba(64,43,30,0.08)]">
                    <textarea
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={`Message ${APP_NAME}`}
                      rows={3}
                      disabled={isSending}
                      className="min-h-16 w-full resize-none bg-transparent text-[15px] leading-7 text-[var(--foreground)] outline-none placeholder:text-[#9b8170]"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={toggleRecording}
                        disabled={isSending || isTranscribing}
                        className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[#6d5445] transition hover:bg-[#f4ece4] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {isTranscribing
                          ? "Transcribing..."
                          : isRecording
                            ? "Stop recording"
                            : "Voice input"}
                      </button>
                      <button
                        type="submit"
                        disabled={isSending || !composer.trim()}
                        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#fff8f2] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {isSending ? "Generating..." : "Send"}
                      </button>
                    </div>
                  </div>
                  <p className="text-center text-xs leading-6 text-[#8b7364]">
                    HorseGPT is a GPT wrapper with a horse system prompt and
                    guardrails. It can still make mistakes.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
