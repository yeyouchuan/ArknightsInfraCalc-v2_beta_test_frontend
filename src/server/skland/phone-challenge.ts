import { createHash, randomUUID } from "node:crypto";

export const PHONE_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const PHONE_CHALLENGE_MAX_FAILURES = 5;
export const PHONE_CODE_RESEND_SECONDS = 60;

export type PhoneChallenge<TClient> = {
  client: TClient;
  phone: string;
  createdAt: number;
  failedAttempts: number;
  verifying: boolean;
};

export function normalizeSklandPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s-]+/g, "");
  const phone = compact.startsWith("+86") ? compact.slice(3) : compact;
  return /^1\d{10}$/.test(phone) ? phone : null;
}

export function isSklandPhoneCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function sklandPhoneRateSubject(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

export class PhoneChallengeRegistry<TClient> {
  private readonly entries: Map<string, PhoneChallenge<TClient>>;
  private readonly createId: () => string;

  constructor(
    entries = new Map<string, PhoneChallenge<TClient>>(),
    createId: () => string = randomUUID
  ) {
    this.entries = entries;
    this.createId = createId;
  }

  create(phone: string, client: TClient, now = Date.now()): string {
    this.cleanup(now);
    const challengeId = this.createId();
    this.entries.set(challengeId, {
      client,
      phone,
      createdAt: now,
      failedAttempts: 0,
      verifying: false,
    });
    return challengeId;
  }

  get(challengeId: string, now = Date.now()): PhoneChallenge<TClient> | null {
    this.cleanup(now);
    return this.entries.get(challengeId) ?? null;
  }

  acquire(challengeId: string, now = Date.now()): PhoneChallenge<TClient> | null {
    const challenge = this.get(challengeId, now);
    if (!challenge || challenge.verifying) return null;
    challenge.verifying = true;
    return challenge;
  }

  recordFailure(challengeId: string, now = Date.now()): number {
    const challenge = this.get(challengeId, now);
    if (!challenge) return 0;
    challenge.failedAttempts += 1;
    challenge.verifying = false;
    const remaining = Math.max(0, PHONE_CHALLENGE_MAX_FAILURES - challenge.failedAttempts);
    if (remaining === 0) this.entries.delete(challengeId);
    return remaining;
  }

  release(challengeId: string): void {
    const challenge = this.entries.get(challengeId);
    if (challenge) challenge.verifying = false;
  }

  consume(challengeId: string): void {
    this.entries.delete(challengeId);
  }

  cleanup(now = Date.now()): void {
    for (const [challengeId, challenge] of this.entries) {
      if (now - challenge.createdAt >= PHONE_CHALLENGE_TTL_MS) {
        this.entries.delete(challengeId);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
