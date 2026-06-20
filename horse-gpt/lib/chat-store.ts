import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ChatMessage, ChatMode, ChatThread } from "@/types/chat";

type ChatStore = {
  threads: ChatThread[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "chats.json");

// Serialize every read-modify-write so concurrent requests (e.g. a delete that
// triggers a new-chat create) can't interleave and corrupt the store file.
let writeChain: Promise<unknown> = Promise.resolve();

function queue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  // Keep the chain alive even if a task rejects.
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sortThreads(threads: ChatThread[]) {
  return [...threads].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

async function readStore(): Promise<ChatStore> {
  try {
    const file = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(file) as Partial<ChatStore>;

    if (!parsed || !Array.isArray(parsed.threads)) {
      return { threads: [] };
    }

    return { threads: sortThreads(parsed.threads as ChatThread[]) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { threads: [] };
    }

    // Corrupted store: preserve it for inspection and start clean rather than
    // failing every request forever.
    if (error instanceof SyntaxError) {
      await fs
        .rename(STORE_PATH, `${STORE_PATH}.corrupt-${Date.now()}`)
        .catch(() => {});
      return { threads: [] };
    }

    throw error;
  }
}

async function writeStore(store: ChatStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = JSON.stringify(
    { threads: sortThreads(store.threads) },
    null,
    2,
  );
  // Unique temp name per write so overlapping writes never share a temp file.
  const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, STORE_PATH);
}

export function listChatThreads() {
  return queue(async () => {
    const store = await readStore();

    return store.threads;
  });
}

export function createChatThread({
  mode,
  starterLine,
}: {
  mode: ChatMode;
  starterLine: string;
}) {
  return queue(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: randomUUID(),
      title: starterLine,
      starterLine,
      mode,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    store.threads = [thread, ...store.threads];
    await writeStore(store);

    return thread;
  });
}

export function updateChatThread(
  id: string,
  updates: Partial<Pick<ChatThread, "title" | "starterLine" | "mode">> & {
    messages?: ChatMessage[];
  },
) {
  return queue(async () => {
    const store = await readStore();
    const index = store.threads.findIndex((thread) => thread.id === id);

    if (index < 0) {
      return null;
    }

    const current = store.threads[index];
    const nextThread: ChatThread = {
      ...current,
      ...updates,
      messages: updates.messages ?? current.messages,
      updatedAt: new Date().toISOString(),
    };

    store.threads[index] = nextThread;
    await writeStore(store);

    return nextThread;
  });
}

export function deleteChatThread(id: string) {
  return queue(async () => {
    const store = await readStore();
    const nextThreads = store.threads.filter((thread) => thread.id !== id);

    if (nextThreads.length === store.threads.length) {
      return false;
    }

    store.threads = nextThreads;
    await writeStore(store);

    return true;
  });
}

export async function updateAllChatThreadsMode({
  mode,
  createStarterLine,
}: {
  mode: ChatMode;
  createStarterLine: () => string;
}) {
  const store = await readStore();
  const now = new Date().toISOString();

  store.threads = store.threads.map((thread) => {
    if (thread.messages.length > 0) {
      return {
        ...thread,
        mode,
        updatedAt: now,
      };
    }

    const starterLine = createStarterLine();

    return {
      ...thread,
      mode,
      starterLine,
      title: thread.title === thread.starterLine ? starterLine : thread.title,
      updatedAt: now,
    };
  });

  await writeStore(store);

  return store.threads;
}
