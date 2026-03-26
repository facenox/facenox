export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl.startsWith("data:")) {
    throw new Error("Invalid data URL")
  }

  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) {
    throw new Error("Invalid data URL format")
  }

  const header = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const mimeMatch = header.match(/^data:([^;,]+)/i)
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream"

  if (header.includes(";base64")) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mimeType })
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType })
}
