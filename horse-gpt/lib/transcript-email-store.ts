import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { ChatMode } from "@/types/chat";

type TranscriptEmailRecipient = {
  email: string;
  firstEmailedAt: string;
  lastEmailedAt: string;
  sendCount: number;
  modes: ChatMode[];
};

type TranscriptEmailStore = {
  recipients: TranscriptEmailRecipient[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "transcript-email-recipients.json");

function sortRecipients(recipients: TranscriptEmailRecipient[]) {
  return [...recipients].sort((left, right) =>
    right.lastEmailedAt.localeCompare(left.lastEmailedAt),
  );
}

async function readStore(): Promise<TranscriptEmailStore> {
  try {
    const file = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(file) as Partial<TranscriptEmailStore>;

    if (!parsed || !Array.isArray(parsed.recipients)) {
      return { recipients: [] };
    }

    return {
      recipients: sortRecipients(
        parsed.recipients as TranscriptEmailRecipient[],
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { recipients: [] };
    }

    throw error;
  }
}

async function writeStore(store: TranscriptEmailStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = JSON.stringify(
    { recipients: sortRecipients(store.recipients) },
    null,
    2,
  );
  const tempPath = `${STORE_PATH}.tmp`;

  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, STORE_PATH);
}

export async function recordTranscriptEmailRecipient({
  email,
  mode,
}: {
  email: string;
  mode: ChatMode;
}) {
  const store = await readStore();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();
  const index = store.recipients.findIndex(
    (recipient) => recipient.email === normalizedEmail,
  );

  if (index < 0) {
    store.recipients.unshift({
      email: normalizedEmail,
      firstEmailedAt: now,
      lastEmailedAt: now,
      sendCount: 1,
      modes: [mode],
    });
  } else {
    const current = store.recipients[index];

    store.recipients[index] = {
      ...current,
      lastEmailedAt: now,
      sendCount: current.sendCount + 1,
      modes: current.modes.includes(mode)
        ? current.modes
        : [...current.modes, mode],
    };
  }

  await writeStore(store);
}

export async function listTranscriptEmailRecipients() {
  const store = await readStore();

  return store.recipients;
}
