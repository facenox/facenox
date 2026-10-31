import { app } from "electron"

export function configureAppIdentity(): void {
  if (process.platform === "win32") {
    app.setAppUserModelId(app.isPackaged ? "com.facenox.app" : "com.facenox.app.dev")
  }
}
