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

  const controlIconClassName =
    "pointer-events-none block text-white/70 transition-colors duration-150 group-hover:text-white"

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
          className="-ml-3 h-5 w-5 object-contain opacity-90"
        />
      </div>

      <div
        className="relative z-70 flex h-full items-center [webkit-app-region:no-drag]"
        style={
          {
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }>
        <button
          onClick={handleMinimize}
          title="Minimize"
          className="group flex h-full w-[46px] items-center justify-center rounded-none border-none bg-transparent p-0 transition-colors duration-150 hover:bg-white/10">
          <span className={`${controlIconClassName} h-px w-3 bg-current opacity-90`} />
        </button>

        <button
          onClick={handleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
          className="group flex h-full w-[46px] items-center justify-center rounded-none border-none bg-transparent p-0 transition-colors duration-150 outline-none hover:bg-white/10">
          {isMaximized ?
            <span className="relative block h-3 w-3">
              <span
                className={`${controlIconClassName} absolute top-0 left-0 h-[9px] w-[9px] border border-current bg-transparent`}
              />
              <span
                className={`${controlIconClassName} absolute right-0 bottom-0 h-[9px] w-[9px] border border-current bg-transparent`}
              />
            </span>
          : <span
              className={`${controlIconClassName} h-3 w-3 border border-current bg-transparent`}
            />
          }
        </button>

        <button
          onClick={handleClose}
          title="Close"
          className="group flex h-full w-[46px] items-center justify-center rounded-none border-none bg-transparent p-0 transition-colors duration-150 outline-none hover:bg-[#e81123]">
          <span className="relative block h-3 w-3">
            <span
              className={`${controlIconClassName} absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rotate-45 bg-current`}
            />
            <span
              className={`${controlIconClassName} absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 -rotate-45 bg-current`}
            />
          </span>
        </button>
      </div>
    </div>
  )
}
