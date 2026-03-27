import { useCallback } from "react"
import { useImageProcessing } from "@/components/group/sections/registration/hooks/useImageProcessing"

interface UploadAreaProps {
  onFileProcessed: (dataUrl: string, width: number, height: number) => void
  onError: (msg: string) => void
}

export function UploadArea({ onFileProcessed, onError }: UploadAreaProps) {
  const { processImageFile } = useImageProcessing()

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      const file = files[0]

      if (!file.type.startsWith("image/")) {
        onError("Please upload a valid image file.")
        return
      }

      try {
        const { dataUrl, width, height } = await processImageFile(file)
        onFileProcessed(dataUrl, width, height)
      } catch {
        onError("Failed to process the selected image.")
      }
      e.target.value = ""
    },
    [processImageFile, onFileProcessed, onError],
  )

  return (
    <div className="relative h-full w-full">
      <label className="group flex h-full cursor-pointer flex-col items-center justify-center p-8 text-center transition-all hover:bg-[rgba(22,28,36,0.52)]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(22,28,36,0.62)] transition-colors group-hover:bg-cyan-500/10">
            <i className="fa-solid fa-cloud-arrow-up text-3xl text-white/20 transition-colors group-hover:text-cyan-400"></i>
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-white/80">
              Drop image or click to browse
            </div>
            <div className="text-[10px] font-medium text-white/10">PNG, JPG up to 10MB</div>
          </div>
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>
    </div>
  )
}
