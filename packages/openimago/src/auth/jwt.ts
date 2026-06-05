import { SignJWT, jwtVerify } from "jose"

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required")
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

const JWT_EXPIRES_IN = "24h"

export async function signJwt(payload: { userId: string; role: string }, expiresIn?: string) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn ?? JWT_EXPIRES_IN)
    .sign(JWT_SECRET)
}

export async function verifyJwt(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET)
  return { userId: payload.userId as string, role: payload.role as string }
}
