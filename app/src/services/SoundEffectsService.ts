interface AudioCacheEntry {
  audio: HTMLAudioElement
}

const audioCache = new Map<string, AudioCacheEntry>()

function getAudio(url: string): HTMLAudioElement {
  const cached = audioCache.get(url)
  if (cached) return cached.audio

  const audio = new Audio(url)
  audio.preload = "auto"

  audioCache.set(url, { audio })
  return audio
}

const activeAudios = new Set<HTMLAudioElement>()

export const soundEffects = {
  preload(url: string): void {
    if (!url) return

    try {
      const audio = getAudio(url)
      audio.load()
    } catch {
      // Ignore preload failures
    }
  },

  async play(url: string): Promise<void> {
    if (!url) return

    try {
      const baseAudio = getAudio(url)
      if (baseAudio.readyState < 2) {
        baseAudio.load()
      }

      const audioClone = baseAudio.cloneNode(true) as HTMLAudioElement
      activeAudios.add(audioClone)

      const cleanup = () => {
        activeAudios.delete(audioClone)
        audioClone.onended = null
        audioClone.onerror = null
      }

      audioClone.onended = cleanup
      audioClone.onerror = cleanup

      await audioClone.play()
    } catch (err) {
      console.error("Audio playback error:", err)
    }
  },
}
