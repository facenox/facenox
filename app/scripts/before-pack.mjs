import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const backendDir = fileURLToPath(new URL("../../server/", import.meta.url))

export default function beforePack(context) {
  const layout = process.env.FACENOX_BACKEND_LAYOUT ?? "onefile"
  if (layout !== "onefile" && layout !== "onedir") {
    throw new Error(`Unknown Facenox backend layout: ${layout}`)
  }

  const windows = context.electronPlatformName === "win32"
  const executableName = windows ? "server.exe" : "server"
  const distDir = path.join(backendDir, "dist")
  const stage = path.join(distDir, "electron-backend")
  const onedir = layout === "onedir"
  const source = onedir ? path.join(distDir, "server-onedir") : distDir
  const executable = path.join(source, executableName)
  const contents = path.join(source, "_internal")

  if (!fs.statSync(executable, { throwIfNoEntry: false })?.isFile()) {
    if (process.env.FACENOX_PREBUILT_BACKEND === "1") {
      throw new Error(`The ${layout} backend artifact is missing: ${executable}`)
    }
    const args = ["build_backend.py"]
    if (onedir) args.push("--onedir")
    execFileSync("python", args, { cwd: backendDir, stdio: "inherit" })
  }
  if (!fs.statSync(executable, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`The backend executable is missing: ${executable}`)
  }
  if (onedir && !fs.statSync(contents, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`The onedir backend is missing its Python libraries: ${contents}`)
  }

  fs.rmSync(stage, { force: true, recursive: true })
  if (onedir) {
    fs.cpSync(source, stage, { recursive: true, verbatimSymlinks: true })
  } else {
    fs.mkdirSync(stage)
    fs.copyFileSync(executable, path.join(stage, executableName))
  }
  if (!windows) fs.chmodSync(path.join(stage, executableName), 0o755)
  console.log(`Staged Facenox ${layout} backend at ${stage}`)
}
