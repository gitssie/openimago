import { randomBytes } from "crypto"

/**
 * Copied from OpenCode's Identifier.ascending("workspace") logic.
 * Generates a WorkspaceID matching the format expected by OpenCode's
 * workspace table (wrk_ prefix + timestamp + random suffix).
 */
const LENGTH = 26

// Monotonic counter state (same as OpenCode)
let lastTimestamp = 0
let counter = 0

function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let result = ""
  const bytes = randomBytes(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 62]
  }
  return result
}

export function generateWorkspaceId(): string {
  const currentTimestamp = Date.now()
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp
    counter = 0
  }
  counter++

  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter)
  const timeBytes = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }

  return "wrk_" + timeBytes.toString("hex") + randomBase62(LENGTH - 12)
}
