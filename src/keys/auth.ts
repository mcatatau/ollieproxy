import { promises as fs } from 'node:fs';
import { KeyStore, KeyRecord, sha256hex } from './store.js';

/**
 * Verifies incoming API keys against the JSON store.
 *
 * The store is read once at startup and reloaded automatically when the file's
 * mtime changes, so a key created/revoked via the CLI takes effect without a
 * restart. A process-wide singleton keeps this cheap.
 */

export interface AuthResult {
  ok: boolean;
  /** Present when `ok` is false; one of `missing`, `malformed`, `invalid`, `expired`. */
  reason?: 'missing' | 'malformed' | 'invalid' | 'expired';
  /** The verified record on success. */
  record?: KeyRecord;
}

export class KeyAuth {
  private store: KeyStore;
  /** Cache of hash -> record, rebuilt on mtime change. */
  private byHash = new Map<string, KeyRecord>();
  private lastMtime = 0;
  private lastLoadError: string | null = null;

  constructor(store: KeyStore) {
    this.store = store;
  }

  /**
   * (Re)loads the store if the file mtime changed. Safe to call on every
   * request: it's a single `stat` when nothing changed.
   */
  async refresh(): Promise<void> {
    let mtime = 0;
    try {
      const st = await fs.stat(this.store.filePath);
      mtime = st.mtimeMs;
    } catch {
      // File may not exist yet; keep whatever we last loaded (likely nothing).
      return;
    }
    if (mtime === this.lastMtime) return;
    this.lastMtime = mtime;

    const records = await this.store.list();
    const next = new Map<string, KeyRecord>();
    for (const r of records) {
      if (r.revoked) continue;
      next.set(r.hash, r);
    }
    this.byHash = next;
    this.lastLoadError = null;
  }

  /** True if a non-revoked key with this hash exists and is not expired. */
  private verifyHash(hash: string): KeyRecord | null {
    const rec = this.byHash.get(hash);
    if (!rec) return null;
    if (rec.expiresAt !== null && Date.now() > rec.expiresAt) return null;
    return rec;
  }

  /**
   * Extracts the bearer token from `authorization` (case-insensitive scheme)
   * and verifies it. Also accepts a raw `op_…` token as the whole header
   * value for clients that don't use the `Bearer` scheme.
   */
  async verify(authorization: string | undefined | null): Promise<AuthResult> {
    if (!authorization) return { ok: false, reason: 'missing' };

    const token = extractBearer(authorization);
    if (!token) return { ok: false, reason: 'malformed' };

    await this.refresh();
    const rec = this.verifyHash(sha256hex(token));
    if (!rec) return { ok: false, reason: 'invalid' };
    return { ok: true, record: rec };
  }
}

/** Pulls the token out of an `Authorization` header value, or `null`. */
function extractBearer(header: string): string | null {
  const trimmed = header.trim();
  // Form 1: "Bearer <token>"
  const sp = trimmed.indexOf(' ');
  if (sp > 0) {
    const scheme = trimmed.slice(0, sp).toLowerCase();
    const rest = trimmed.slice(sp + 1).trim();
    if (scheme === 'bearer' && rest) return rest;
  }
  // Form 2: raw token as the whole header (some clients do this).
  if (/^op_[A-Za-z0-9]{10,}$/.test(trimmed)) return trimmed;
  return null;
}
