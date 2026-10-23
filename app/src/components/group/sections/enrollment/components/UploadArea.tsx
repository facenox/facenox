import { useCallback } from "react"
import { Upload } from "lucide-react"
import { useImageProcessing } from "@/components/group/sections/enrollment/hooks/useImageProcessing"

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
        onError("Select a valid image file (PNG, JPG).")
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
      <label className="group flex h-full cursor-pointer flex-col items-center justify-center p-8 text-center transition-all hover:bg-white/[0.04]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] transition-colors group-hover:bg-cyan-500/10">
            <Upload className="size-8 text-white/20 transition-colors group-hover:text-cyan-400" />
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-white/80">Choose a photo</div>
            <div className="text-[11px] font-medium text-white/55">
              Use a clear PNG or JPG photo
            </div>
          </div>
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>
    </div>
  )
}
