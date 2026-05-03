import { useState, useEffect } from "react"

export default function WindowBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const handleMaximize = () => setIsMaximized(true)
    const handleUnmaximize = () => setIsMaximized(false)

    let cleanupMaximize: (() => void) | undefined
    let cleanupUnmaximize: (() => void) | undefined

    if (window.facenoxElectron) {
      cleanupMaximize = window.facenoxElectron.onMaximize(handleMaximize)
      cleanupUnmaximize = window.facenoxElectron.onUnmaximize(handleUnmaximize)
    }

    return () => {
      if (cleanupMaximize) cleanupMaximize()
      if (cleanupUnmaximize) cleanupUnmaximize()
    }
  }, [])

  const handleMinimize = () => {
    if (window.facenoxElectron) {
      window.facenoxElectron.minimize()
    }
  }

  const handleMaximize = () => {
    if (window.facenoxElectron) {
      window.facenoxElectron.maximize()
    }
  }

  const handleClose = () => {
    if (window.facenoxElectron) {
      window.facenoxElectron.close()
    }
  }

  const platform = window.facenoxElectron?.platform || "win32"
  const isLinux = platform === "linux"
  const isMac = platform === "darwin"

  const iconStyle = (iconName: string) => ({
    maskImage: `url(./icons/window/${iconName}.svg)`,
    WebkitMaskImage: `url(./icons/window/${iconName}.svg)`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "10px",
    WebkitMaskSize: "10px",
  })

  return (
    <div
      className="relative flex h-[32px] w-full shrink-0 items-center justify-between border-b border-white/8 select-none"
      style={
        {
          WebkitAppRegion: isMaximized ? "no-drag" : "drag",
        } as React.CSSProperties
      }>
      {/* Spacer for Mac native traffic lights */}
      {isMac && <div className="w-[80px] shrink-0" />}

      <div className="pointer-events-none relative z-40 ml-4 flex flex-1 items-center space-x-3">
        <img
          src="./icons/logo-transparent.png"
          alt="Facenox"
          className={`${isMac ? "-ml-5" : "-ml-3"} h-5 w-5 object-contain opacity-90`}
        />
      </div>

      {!isMac && (
        <div
          className="relative z-70 flex h-full items-center px-1 [webkit-app-region:no-drag]"
          style={
            {
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }>
          {/* Minimize */}
          <button
            onClick={handleMinimize}
            title="Minimize"
            className={`group flex h-[28px] items-center justify-center border-none bg-transparent p-0 transition-all duration-150 outline-none ${
              isLinux ?
                "mx-0.5 w-[28px] rounded-full hover:bg-white/10"
              : "w-[46px] hover:bg-white/10"
            }`}>
            <span
              className="h-full w-full bg-white/70 transition-colors group-hover:bg-white"
              style={iconStyle("minimize")}
            />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
            className={`group flex h-[28px] items-center justify-center border-none bg-transparent p-0 transition-all duration-150 outline-none ${
              isLinux ?
                "mx-0.5 w-[28px] rounded-full hover:bg-white/10"
              : "w-[46px] hover:bg-white/10"
            }`}>
            <span
              className="h-full w-full bg-white/70 transition-colors group-hover:bg-white"
              style={iconStyle(isMaximized ? "restore-down" : "maximize")}
            />
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            title="Close"
            className={`group flex h-[28px] items-center justify-center border-none bg-transparent p-0 transition-all duration-150 outline-none ${
              isLinux ?
                "mx-0.5 w-[28px] rounded-full hover:bg-[#e81123]"
              : "w-[46px] hover:bg-[#e81123]"
            }`}>
            <span
              className="h-full w-full bg-white/80 transition-colors group-hover:bg-white"
              style={iconStyle("close")}
            />
          </button>
        </div>
      )}
    </div>
  )
}
