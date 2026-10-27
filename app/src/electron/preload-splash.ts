import { contextBridge, ipcRenderer } from "electron"

/**
 * Sandboxed API for the splash window.
 * Excludes sensitive database and store operations to isolate the splash context.
 */
contextBridge.exposeInMainWorld("facenoxElectron", {
  /**
   * Reports visual progress rendering states to the main process.
   * Ensures the splash is only closed after the DOM progress bar paints to 100%.
   *
   * @param progress - Current visual progress percentage
   */
  reportSplashRenderedProgress: (progress: number): void => {
    ipcRenderer.send("splash:rendered-progress", progress)
  },

  /**
   * Subscribes to startup progress steps published by the backend server.
   * Returns a cleanup routine to prevent memory leaks when the splash page closes.
   *
   * @param callback - Handler executed when a progress increment is received
   */
  onSplashProgress: (
    callback: (update: { progress: number; detail?: string }) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      update: { progress: number; detail?: string },
    ): void => {
      callback(update)
    }
    ipcRenderer.on("splash:progress", listener)

    return (): void => {
      ipcRenderer.removeListener("splash:progress", listener)
    }
  },
})
