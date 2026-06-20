import type { ChatMessage, ChatMode, ChatThread } from "@/types/chat";

// Client-side chat persistence. Vercel's serverless filesystem is read-only,
// so chats live in the browser's localStorage instead of a server file.
const STORAGE_KEY = "horsegpt-threads";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortThreads(threads: ChatThread[]) {
  return [...threads].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function loadThreads(): ChatThread[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortThreads(parsed as ChatThread[]);
  } catch {
    // Corrupted store: start clean rather than crashing.
    return [];
  }
}

function saveThreads(threads: ChatThread[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortThreads(threads)));
}

export function createThread({
  mode,
  starterLine,
}: {
  mode: ChatMode;
  starterLine: string;
}): ChatThread {
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: makeId(),
    title: starterLine,
    starterLine,
    mode,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  saveThreads([thread, ...loadThreads()]);

  return thread;
}

export function updateThread(
  id: string,
  updates: Partial<Pick<ChatThread, "title" | "starterLine" | "mode">> & {
    messages?: ChatMessage[];
  },
): ChatThread | null {
  const threads = loadThreads();
  const index = threads.findIndex((thread) => thread.id === id);

  if (index < 0) {
    return null;
  }

  const current = threads[index];
  const nextThread: ChatThread = {
    ...current,
    ...updates,
    messages: updates.messages ?? current.messages,
    updatedAt: new Date().toISOString(),
  };

  threads[index] = nextThread;
  saveThreads(threads);

  return nextThread;
}

export function deleteThread(id: string): boolean {
  const threads = loadThreads();
  const nextThreads = threads.filter((thread) => thread.id !== id);

  if (nextThreads.length === threads.length) {
    return false;
  }

  saveThreads(nextThreads);

  return true;
}
