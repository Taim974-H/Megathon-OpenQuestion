import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * File-based "private data" layer for paying advertising clients.
 *
 * Layout (NOT committed to git — see /private in .gitignore):
 *   private/clients/<clientId>/manifest.json   <- metadata + payment status
 *   private/clients/<clientId>/<asset files>   <- images the client gave us
 *
 * This is deliberately simple (no DB) so it works for a hackathon/demo. Swap
 * the read/write helpers for a database later without touching callers.
 */

export interface ClientAsset {
  /** Filename relative to the client's folder, e.g. "logo.png". */
  file: string;
  /** Optional human label. */
  label?: string;
}

export interface ClientManifest {
  /** Stable id; must equal the folder name. */
  id: string;
  name: string;
  /** Whether the client has paid — gates ad generation. */
  paid: boolean;
  assets: ClientAsset[];
}

const PRIVATE_ROOT = path.join(process.cwd(), "private", "clients");

/** Reject path traversal / unexpected characters in a client id. */
function assertSafeClientId(clientId: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(clientId)) {
    throw new Error(`Invalid client id: ${JSON.stringify(clientId)}`);
  }
}

export function clientDir(clientId: string): string {
  assertSafeClientId(clientId);
  return path.join(PRIVATE_ROOT, clientId);
}

export async function getClient(
  clientId: string,
): Promise<ClientManifest | null> {
  const manifestPath = path.join(clientDir(clientId), "manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const data = JSON.parse(raw) as ClientManifest;
    // Trust the folder name over whatever the file claims.
    return { ...data, id: clientId };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Load a client and assert they have paid. Throws a tagged error otherwise so
 * routes can map it to 402/404 cleanly.
 */
export async function requirePaidClient(
  clientId: string,
): Promise<ClientManifest> {
  const client = await getClient(clientId);
  if (!client) {
    throw new ClientError(`Unknown client: ${clientId}`, "not_found");
  }
  if (!client.paid) {
    throw new ClientError(
      `Client "${clientId}" has not paid for ad generation.`,
      "payment_required",
    );
  }
  return client;
}

/** Read a client's asset file as bytes, validating it belongs to that client. */
export async function readClientAsset(
  clientId: string,
  file: string,
): Promise<Buffer> {
  // Resolve and confirm the file stays inside the client's directory.
  const dir = clientDir(clientId);
  const resolved = path.resolve(dir, file);
  if (resolved !== path.normalize(resolved) || !resolved.startsWith(dir + path.sep)) {
    throw new ClientError(`Invalid asset path: ${file}`, "not_found");
  }
  return fs.readFile(resolved);
}

export type ClientErrorKind = "not_found" | "payment_required";

export class ClientError extends Error {
  constructor(
    message: string,
    readonly kind: ClientErrorKind,
  ) {
    super(message);
    this.name = "ClientError";
  }
}
