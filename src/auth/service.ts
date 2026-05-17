import { eq, and } from "drizzle-orm"
import { signJwt, verifyJwt } from "./jwt"
import { userId, authId } from "../utils/ids"
import { db } from "../db/client"
import { users, userAuths } from "../db/schema"

export interface RegisterInput {
  username: string
  email: string
  password: string
  displayName?: string
}

export interface LoginInput {
  email: string
  password: string
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
  return null
}

export class AuthService {
  async register(input: RegisterInput) {
    const validationError = validateRegister(input)
    if (validationError) {
      return { error: { code: "VALIDATION_ERROR", message: validationError }, status: 400 } as const
    }

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))

    if (existing.length > 0) {
      return { error: { code: "CONFLICT", message: "Email already registered" }, status: 409 } as const
    }

    const id = userId()
    const now = new Date()
    const hash = await Bun.password.hash(input.password)

    const user = {
      id,
      username: input.username,
      email: input.email.toLowerCase(),
      displayName: input.displayName ?? null,
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
    return { user, token, status: 201 } as const
  }

  async login(input: LoginInput) {
    const email = input.email.toLowerCase()

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))

    if (userRows.length === 0) {
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
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }, status: 401 } as const
    }

    const valid = await Bun.password.verify(input.password, authRows[0]!.passwordHash)

    if (!valid) {
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }, status: 401 } as const
    }

    const token = await signJwt({ userId: user.id, role: user.role })
    return { user, token, status: 200 } as const
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
