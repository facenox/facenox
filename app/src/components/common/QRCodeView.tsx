import { useEffect, useState } from "react"
import QRCode from "qrcode"

interface QRCodeViewProps {
  value: string
  size?: number
  className?: string
}

export function QRCodeView({ value, size = 160, className = "" }: QRCodeViewProps) {
  const [svgContent, setSvgContent] = useState<string>("")

  useEffect(() => {
    if (!value) {
      setSvgContent("")
      return
    }
    let isCancelled = false
    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0a0a0c",
        light: "#ffffff",
      },
    })
      .then((svg) => {
        if (!isCancelled) setSvgContent(svg)
      })
      .catch((err) => {
        console.error("Failed to generate QR code:", err)
      })

    return () => {
      isCancelled = true
    }
  }, [value])

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-white p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${className}`}>
      {svgContent ?
        <div
          className="flex size-full items-center justify-center transition-opacity duration-200"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      : <div className="flex items-center justify-center">
          <span className="size-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
        </div>
      }
    </div>
  )
}
