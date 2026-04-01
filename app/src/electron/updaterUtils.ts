export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export function extractSemverLikeVersion(input: string): string | null {
  const trimmed = (input || "").trim()
  if (!trimmed) return null

  const match = /v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/.exec(trimmed)
  if (!match) return null

  return match[0].replace(/^v/, "")
}

export function getVersionParts(version: string): {
  numeric: number[]
  pre: string | null
} {
  const [v, ...preParts] = version.split("-")
  const numeric = v
    .replace(/^v/, "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0)
  const pre = preParts.length > 0 ? preParts.join("-") : null
  return { numeric, pre }
}

export function compareVersions(a: string, b: string): number {
  const partsA = getVersionParts(a)
  const partsB = getVersionParts(b)

  const maxLength = Math.max(partsA.numeric.length, partsB.numeric.length)
  for (let i = 0; i < maxLength; i++) {
    const numA = partsA.numeric[i] || 0
    const numB = partsB.numeric[i] || 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }

  if (!partsA.pre && partsB.pre) return 1
  if (partsA.pre && !partsB.pre) return -1

  if (partsA.pre && partsB.pre) {
    const segA = partsA.pre.split(".")
    const segB = partsB.pre.split(".")
    const maxLen = Math.max(segA.length, segB.length)

    for (let i = 0; i < maxLen; i++) {
      const sA = segA[i]
      const sB = segB[i]

      if (sA === undefined) return -1
      if (sB === undefined) return 1

      const nA = parseInt(sA, 10)
      const nB = parseInt(sB, 10)
      const isNumA = !isNaN(nA) && /^\d+$/.test(sA)
      const isNumB = !isNaN(nB) && /^\d+$/.test(sB)

      if (isNumA && isNumB) {
        if (nA > nB) return 1
        if (nA < nB) return -1
      } else if (isNumA || isNumB) {
        return isNumA ? -1 : 1
      } else {
        if (sA > sB) return 1
        if (sA < sB) return -1
      }
    }
  }

  return 0
}

export function getDownloadUrlForPlatform(
  assets: ReleaseAsset[],
  platform: NodeJS.Platform = process.platform,
): string | null {
  const patterns: Record<NodeJS.Platform | string, RegExp[]> = {
    win32: [/\.exe$/i, /\.msi$/i, /portable.*\.exe$/i],
    darwin: [/\.dmg$/i, /\.pkg$/i],
    linux: [/\.AppImage$/i, /\.deb$/i, /\.rpm$/i],
  }

  const platformPatterns = patterns[platform] || []

  for (const pattern of platformPatterns) {
    const asset = assets.find((candidate) => pattern.test(candidate.name))
    if (asset) {
      return asset.browser_download_url
    }
  }

  return null
}
