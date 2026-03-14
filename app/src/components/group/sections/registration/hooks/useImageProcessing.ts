import { useCallback } from "react"
import { makeId, readFileAsDataUrl, getImageDimensions } from "@/utils/imageHelpers"

export { makeId, readFileAsDataUrl, getImageDimensions }

export function useImageProcessing() {
  const processImageFile = useCallback(async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file)
    const dimensions = await getImageDimensions(dataUrl)
    return { dataUrl, ...dimensions }
  }, [])

  return {
    makeId,
    readFileAsDataUrl,
    getImageDimensions,
    processImageFile,
  }
}
