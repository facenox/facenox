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

  return (
    <div
      className="relative flex h-[32px] w-full shrink-0 items-center justify-between border-b border-white/8 select-none"
      style={
        {
          WebkitAppRegion: isMaximized ? "no-drag" : "drag",
        } as React.CSSProperties
      }>
      <div className="pointer-events-none relative z-40 ml-4 flex flex-1 items-center space-x-3">
        <img
          src="./icons/logo-transparent.png"
          alt="Facenox"
          className="mr-1 -ml-2 h-5 w-5 object-contain opacity-90"
        />
      </div>

      <div
        className="relative z-70 flex h-full items-center [webkit-app-region:no-drag]"
        style={
          {
            WebkitAppRegion: "no-drag",
            fontFamily: '"Segoe MDL2 Assets", Arial, sans-serif',
          } as React.CSSProperties
        }>
        <button
          onClick={handleMinimize}
          title="Minimize"
          className="flex h-full w-[46px] items-center justify-center rounded-none border-none bg-transparent p-0 text-[10px] text-white/70 transition-colors duration-150 hover:bg-white/10">
          &#xE921;
        </button>

        <button
          onClick={handleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
          className="flex h-full w-[46px] items-center justify-center rounded-none border-none bg-transparent p-0 text-[10px] text-white/70 transition-colors duration-150 outline-none hover:bg-white/10">
          {isMaximized ?
            <>&#xE923;</>
          : <>&#xE922;</>}
        </button>

        <button
          onClick={handleClose}
          title="Close"
          className="flex h-full w-[46px] items-center justify-center rounded-none border-none bg-transparent p-0 text-[10px] text-white/70 transition-colors duration-150 outline-none hover:bg-[#e81123] hover:text-white">
          &#xE8BB;
        </button>
      </div>
    </div>
  )
}
