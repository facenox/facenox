import { useState, useEffect, useRef } from "react"
import { AlertTriangle } from "lucide-react"
import type { CapturedFrame } from "@/components/group/sections/enrollment/types"

export function ImagePreviewWithBbox({ frame }: { frame: CapturedFrame }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bboxStyle, setBboxStyle] = useState<{
    left: string
    top: string
    width: string
    height: string
  } | null>(null)
  const lastBboxStyleRef = useRef<string>("")

  useEffect(() => {
    if (!frame.bbox || !frame.width || !frame.height || !containerRef.current) {
      setTimeout(() => setBboxStyle(null), 0)
      lastBboxStyleRef.current = ""
      return
    }

    const calculateBbox = () => {
      const container = containerRef.current
      if (!container) return

      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      if (containerWidth === 0 || containerHeight === 0) {
        return
      }

      const imageAspectRatio = frame.width / frame.height
      const containerAspectRatio = containerWidth / containerHeight

      let displayedWidth: number
      let displayedHeight: number
      let offsetX = 0
      let offsetY = 0

      if (imageAspectRatio > containerAspectRatio) {
        displayedWidth = containerWidth
        displayedHeight = containerWidth / imageAspectRatio
        offsetY = (containerHeight - displayedHeight) / 2
      } else {
        displayedHeight = containerHeight
        displayedWidth = containerHeight * imageAspectRatio
        offsetX = (containerWidth - displayedWidth) / 2
      }

      const bbox = frame.bbox
      if (!bbox) {
        return
      }

      const scaleX = displayedWidth / frame.width
      const scaleY = displayedHeight / frame.height

      const bboxLeft = bbox[0] * scaleX + offsetX
      const bboxTop = bbox[1] * scaleY + offsetY
      const bboxWidth = bbox[2] * scaleX
      const bboxHeight = bbox[3] * scaleY

      const newStyle = {
        left: `${bboxLeft}px`,
        top: `${bboxTop}px`,
        width: `${bboxWidth}px`,
        height: `${bboxHeight}px`,
      }

      const styleKey = `${bboxLeft.toFixed(2)},${bboxTop.toFixed(
        2,
      )},${bboxWidth.toFixed(2)},${bboxHeight.toFixed(2)}`
      if (lastBboxStyleRef.current !== styleKey) {
        lastBboxStyleRef.current = styleKey
        setTimeout(() => setBboxStyle(newStyle), 0)
      }
    }

    let timeoutId: NodeJS.Timeout
    const debouncedCalculate = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(calculateBbox, 16)
    }

    calculateBbox()
    const resizeObserver = new ResizeObserver(debouncedCalculate)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [frame.bbox, frame.width, frame.height])

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
      <img src={frame.dataUrl} alt={frame.label} className="h-full w-full object-contain" />
      {frame.status === "processing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
            <span className="text-xs text-white/65">Analyzing…</span>
          </div>
        </div>
      )}
      {frame.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 p-3 text-center">
          <div className="space-y-1">
            <AlertTriangle className="size-5 text-amber-400" />
            <div className="text-xs text-red-200">{frame.error || "Failed"}</div>
          </div>
        </div>
      )}
      {frame.status !== "error" && bboxStyle && (
        <div
          className="absolute border-2 border-cyan-400 shadow-lg shadow-cyan-400/50"
          style={bboxStyle}
        />
      )}
    </div>
  )
}
