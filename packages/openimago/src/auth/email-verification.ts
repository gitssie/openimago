import { logger } from "../server/logger"

// ── Types ─────────────────────────────────────────────────────────────

export interface VerificationSender {
  send(email: string, code: string): Promise<void>
}

interface VerificationEntry {
  code: string
  expiresAt: number
  sentAt: number
}

// ── In-memory verification store ──────────────────────────────────────

export class VerificationStore {
  private codes = new Map<string, VerificationEntry>()
  private readonly codeTTL = 10 * 60 * 1000 // 10 minutes
  private readonly resendCooldown = 60 * 1000 // 60 seconds

  storeCode(email: string, code: string): void {
    this.cleanup()
    this.codes.set(email.toLowerCase(), {
      code,
      expiresAt: Date.now() + this.codeTTL,
      sentAt: Date.now(),
    })
  }

  verifyCode(email: string, code: string): { valid: boolean } {
    this.cleanup()
    const entry = this.codes.get(email.toLowerCase())
    if (!entry) return { valid: false }
    if (entry.code !== code) return { valid: false }
    // Consume the code on successful verification
    this.codes.delete(email.toLowerCase())
    return { valid: true }
  }

  canResend(email: string): { allowed: boolean; remainingMs: number } {
    this.cleanup()
    const entry = this.codes.get(email.toLowerCase())
    if (!entry) return { allowed: true, remainingMs: 0 }
    const elapsed = Date.now() - entry.sentAt
    if (elapsed >= this.resendCooldown) {
      return { allowed: true, remainingMs: 0 }
    }
    return { allowed: false, remainingMs: this.resendCooldown - elapsed }
  }

  /** For testing only — retrieve the last code sent to an email. */
  getCode(email: string): string | undefined {
    const entry = this.codes.get(email.toLowerCase())
    return entry?.code
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.codes) {
      if (entry.expiresAt < now) {
        this.codes.delete(key)
      }
    }
  }
}

// ── Senders ───────────────────────────────────────────────────────────

/** Development sender: logs the code to console. */
export class LogSender implements VerificationSender {
  async send(email: string, code: string): Promise<void> {
    logger.info({ email, code }, `[DEV] Verification code for ${email}: ${code}`)
  }
}

/** Production sender: requires SMTP configuration or fails clearly. */
export class SmtpSender implements VerificationSender {
  async send(email: string, _code: string): Promise<void> {
    throw new Error(
      "Email delivery not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables.",
    )
  }
}

// ── Factory ───────────────────────────────────────────────────────────

export function createVerificationSender(): VerificationSender {
  const isDev = process.env.NODE_ENV !== "production"
  if (isDev) {
    return new LogSender()
  }
  // In production, require SMTP config
  if (process.env.SMTP_HOST) {
    // SMTP sender not yet implemented — would connect to SMTP server here
    return new SmtpSender()
  }
  return new SmtpSender()
}

// ── Singleton instances ───────────────────────────────────────────────

export const verificationStore = new VerificationStore()
export const verificationSender = createVerificationSender()

/**
 * Generate a random 6-digit verification code.
 */
export function generateVerificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
