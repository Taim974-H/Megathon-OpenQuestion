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
  const tempPath = `${STORE_PATH}.tmp`;

  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, STORE_PATH);
}

export async function listChatThreads() {
  const store = await readStore();

  return store.threads;
}

export async function createChatThread({
  mode,
  starterLine,
}: {
  mode: ChatMode;
  starterLine: string;
}) {
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
}

export async function updateChatThread(
  id: string,
  updates: Partial<Pick<ChatThread, "title" | "starterLine" | "mode">> & {
    messages?: ChatMessage[];
  },
) {
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
}

export async function deleteChatThread(id: string) {
  const store = await readStore();
  const nextThreads = store.threads.filter((thread) => thread.id !== id);

  if (nextThreads.length === store.threads.length) {
    return false;
  }

  store.threads = nextThreads;
  await writeStore(store);

  return true;
}
