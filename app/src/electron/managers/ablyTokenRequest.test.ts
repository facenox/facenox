// @vitest-environment node
import { expect, it } from "vitest"
import { parseAblyTokenRequest } from "./ablyTokenRequest"

const request = {
  capability: '{"site:example":["subscribe"]}',
  keyName: "example.key",
  mac: "signed-mac",
  nonce: "0123456789abcdef",
  timestamp: 1792454400000,
}

it("accepts signed-request fields, with optional client ID and TTL", () => {
  expect(parseAblyTokenRequest(request)).toEqual(request)
  const withOptions = { ...request, clientId: "device:example", ttl: 3600000 }
  expect(parseAblyTokenRequest(withOptions)).toEqual(withOptions)
})

it.each([
  null,
  [],
  {},
  { error: "unavailable" },
  { ...request, mac: "" },
  { ...request, timestamp: "1792454400000" },
  { ...request, nonce: "short" },
  { ...request, ttl: -1 },
])("rejects malformed realtime credentials: %j", (value) => {
  expect(() => parseAblyTokenRequest(value)).toThrow("invalid realtime token request")
})
