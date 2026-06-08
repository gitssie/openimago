import { eq, and } from "drizzle-orm"
import { signJwt, verifyJwt } from "./jwt"
import { userId, authId } from "../utils/ids"
import { db } from "../db/client"
import { users, userAuths } from "../db/schema"
import { generateWorkspaceId } from "./workspace-id"
import { logger } from "../server/logger"
import {
  verificationStore,
  verificationSender,
  generateVerificationCode,
} from "./email-verification"

export interface RegisterInput {
  username: string
  email: string
  password: string
  displayName?: string
  verificationCode?: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface UpdateProfileInput {
  displayName?: string | null
  email?: string
  currentPassword?: string
  newPassword?: string
}

function validateRegister(input: RegisterInput): string | null {
  if (!input.username || input.username.length < 3 || input.username.length > 32) {
    return "Username must be 3-32 characters"
  }
  if (!input.email || !input.email.includes("@")) {
    return "Invalid email"
  }
  if (!input.password || input.password.length < 8) {
    return "Password must be at least 8 characters"
  }
  if (!input.verificationCode || input.verificationCode.length === 0) {
    return "Verification code is required"
  }
  return null
}

export class AuthService {
  async sendVerificationCode(email: string) {
    const normalized = email.toLowerCase().trim()
    if (!normalized || !normalized.includes("@")) {
      return { error: { code: "VALIDATION_ERROR", message: "Invalid email" }, status: 400 } as const
    }

    // Check if email is already registered
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))

    if (existing.length > 0) {
      logger.warn({ email: normalized }, "auth.sendVerificationCode: email already registered")
      return { error: { code: "CONFLICT", message: "Email already registered" }, status: 409 } as const
    }

    // Check resend cooldown
    const cooldown = verificationStore.canResend(normalized)
    if (!cooldown.allowed) {
      logger.warn({ email: normalized, remainingMs: cooldown.remainingMs }, "auth.sendVerificationCode: cooldown active")
      return {
        error: {
          code: "RATE_LIMITED",
          message: "Please wait before requesting another code",
          remainingMs: cooldown.remainingMs,
        },
        status: 429,
      } as const
    }

    const code = generateVerificationCode()
    verificationStore.storeCode(normalized, code)

    try {
      await verificationSender.send(normalized, code)
    } catch (sendError: unknown) {
      logger.error({ email: normalized, err: sendError }, "auth.sendVerificationCode: failed to send verification code")
      return {
        error: {
          code: "CONFIGURATION_ERROR",
          message: sendError instanceof Error ? sendError.message : "Failed to send verification code",
        },
        status: 500,
      } as const
    }

    logger.info({ email: normalized }, "auth.sendVerificationCode: code sent")
    return { success: true, status: 200 } as const
  }

  async register(input: RegisterInput) {
    const validationError = validateRegister(input)
    if (validationError) {
      logger.warn({ username: input.username, email: input.email }, `auth.register: validation failed — ${validationError}`)
      return { error: { code: "VALIDATION_ERROR", message: validationError }, status: 400 } as const
    }

    const normalizedEmail = input.email.toLowerCase()

    // Verify email verification code
    const verification = verificationStore.verifyCode(normalizedEmail, input.verificationCode!)
    if (!verification.valid) {
      logger.warn({ email: normalizedEmail }, "auth.register: invalid or expired verification code")
      return { error: { code: "INVALID_VERIFICATION_CODE", message: "Invalid or expired verification code" }, status: 400 } as const
    }

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))

    if (existing.length > 0) {
      logger.warn({ email: input.email }, "auth.register: email already registered")
      return { error: { code: "CONFLICT", message: "Email already registered" }, status: 409 } as const
    }

    const id = userId()
    const now = new Date()
    const hash = await Bun.password.hash(input.password)
    const workspaceId = generateWorkspaceId()

    const user = {
      id,
      username: input.username,
      email: normalizedEmail,
      displayName: input.displayName ?? null,
      workspaceId,
      role: "user",
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(users).values(user)
    await db.insert(userAuths).values({
      id: authId(),
      userId: id,
      provider: "password",
      providerId: null,
      passwordHash: hash,
      createdAt: now,
    })

    const token = await signJwt({ userId: id, role: "user" })
    logger.info({ userId: id, username: input.username, email: input.email }, "auth.register: user created")
    return { user, token, status: 201 } as const
  }

  async login(input: LoginInput) {
    const email = input.email.toLowerCase()

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))

    if (userRows.length === 0) {
      logger.warn({ email }, "auth.login: invalid credentials (user not found)")
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }, status: 401 } as const
    }

    const user = userRows[0]!

    const authRows = await db
      .select()
      .from(userAuths)
      .where(
        and(
          eq(userAuths.userId, user.id),
          eq(userAuths.provider, "password"),
        ),
      )

    if (authRows.length === 0 || !authRows[0]!.passwordHash) {
      logger.warn({ userId: user.id, email }, "auth.login: no password auth found")
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }, status: 401 } as const
    }

    const valid = await Bun.password.verify(input.password, authRows[0]!.passwordHash)

    if (!valid) {
      logger.warn({ userId: user.id, email }, "auth.login: wrong password")
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }, status: 401 } as const
    }

    const token = await signJwt({ userId: user.id, role: user.role })
    logger.info({ userId: user.id, email }, "auth.login: success")
    return { user, token, status: 200 } as const
  }

  async updateProfile(token: string, input: UpdateProfileInput) {
    try {
      const { userId } = await verifyJwt(token)
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))

      if (userRows.length === 0) {
        return { error: { code: "UNAUTHORIZED", message: "User not found" }, status: 401 } as const
      }

      const user = userRows[0]!
      const updates: Partial<typeof users.$inferInsert> = {}
      const now = new Date()

      // Validate and set displayName
      if (input.displayName !== undefined) {
        if (input.displayName !== null && (input.displayName.length < 1 || input.displayName.length > 64)) {
          return { error: { code: "VALIDATION_ERROR", message: "displayName must be 1-64 characters" }, status: 400 } as const
        }
        updates.displayName = input.displayName
      }

      // Validate and set email
      if (input.email !== undefined) {
        if (!input.email.includes("@")) {
          return { error: { code: "VALIDATION_ERROR", message: "Invalid email" }, status: 400 } as const
        }
        const newEmail = input.email.toLowerCase()
        const conflict = await db
          .select()
          .from(users)
          .where(eq(users.email, newEmail))
        if (conflict.length > 0 && conflict[0]!.id !== userId) {
          return { error: { code: "CONFLICT", message: "Email already in use" }, status: 409 } as const
        }
        updates.email = newEmail
      }

      // Validate and set password
      if (input.newPassword !== undefined) {
        if (input.newPassword.length < 8) {
          return { error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" }, status: 400 } as const
        }

        // Check if user has password auth
        const passwordAuthRows = await db
          .select()
          .from(userAuths)
          .where(
            and(
              eq(userAuths.userId, userId),
              eq(userAuths.provider, "password"),
            ),
          )

        if (passwordAuthRows.length > 0) {
          // Has existing password → must verify currentPassword
          if (!input.currentPassword) {
            return { error: { code: "VALIDATION_ERROR", message: "currentPassword is required to change password" }, status: 400 } as const
          }
          const valid = await Bun.password.verify(input.currentPassword, passwordAuthRows[0]!.passwordHash!)
          if (!valid) {
            return { error: { code: "WRONG_PASSWORD", message: "Current password is incorrect" }, status: 401 } as const
          }
          // Update existing password hash
          const newHash = await Bun.password.hash(input.newPassword)
          await db
            .update(userAuths)
            .set({ passwordHash: newHash })
            .where(eq(userAuths.id, passwordAuthRows[0]!.id))
        } else {
          // OAuth-only user: create password auth record
          const newHash = await Bun.password.hash(input.newPassword)
          await db.insert(userAuths).values({
            id: authId(),
            userId,
            provider: "password",
            providerId: null,
            passwordHash: newHash,
            createdAt: now,
          })
        }
      }

      // Apply profile updates
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = now
        await db.update(users).set(updates).where(eq(users.id, userId))
      }

      // Return updated user
      const updatedUserRows = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))

      return { user: updatedUserRows[0]!, status: 200 } as const
    } catch {
      return { error: { code: "UNAUTHORIZED", message: "Invalid token" }, status: 401 } as const
    }
  }

  async me(token: string) {
    try {
      const { userId } = await verifyJwt(token)
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))

      if (userRows.length === 0) {
        return { error: { code: "UNAUTHORIZED", message: "User not found" }, status: 401 } as const
      }

      const user = userRows[0]!
      return { user, status: 200 } as const
    } catch {
      return { error: { code: "UNAUTHORIZED", message: "Invalid token" }, status: 401 } as const
    }
  }
}

export const authService = new AuthService()
