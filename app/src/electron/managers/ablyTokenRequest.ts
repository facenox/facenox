import { z } from "zod"
import type { TokenRequest } from "ably"

const tokenRequestSchema = z.object({
  capability: z.string().min(1),
  keyName: z.string().min(1),
  mac: z.string().min(1),
  nonce: z.string().min(16),
  timestamp: z.number().int().nonnegative(),
  clientId: z.string().optional(),
  ttl: z.number().int().positive().optional(),
})

/** Validate the network response before handing it to the realtime SDK. */
export function parseAblyTokenRequest(value: unknown): TokenRequest {
  const result = tokenRequestSchema.safeParse(value)
  if (!result.success) throw new Error("Cloud returned an invalid realtime token request.")
  return result.data
}
