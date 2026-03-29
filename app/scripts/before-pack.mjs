import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function beforePack(context) {
  console.log("Running before-pack script...")

  const platform = context.electronPlatformName
  const backendDir = path.join(__dirname, "..", "..", "server")
  const distDir = path.join(backendDir, "dist")

  console.log(`Building for platform: ${platform}`)
  console.log(`Backend directory: ${backendDir}`)

  if (!fs.existsSync(backendDir)) {
    throw new Error(`Backend directory not found: ${backendDir}`)
  }

  const executableName = platform === "win32" ? "server.exe" : "server"
  const executablePath = path.join(distDir, executableName)

  if (fs.existsSync(executablePath)) {
    console.log(`Backend executable already exists: ${executablePath}`)
    return
  }

  console.log(`Building backend executable for ${platform}...`)

  try {
    const pkgPath = path.join(backendDir, "package.json")
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
      if (pkg.dependencies || pkg.devDependencies) {
        console.log("Installing Node dependencies for backend...")
        execSync("npm install", { stdio: "inherit", cwd: backendDir })
      }
    }

    console.log("Installing Python dependencies...")
    execSync("python -m pip install -r requirements.txt", {
      stdio: "inherit",
      cwd: backendDir,
    })
    execSync("python -m pip install -r requirements-build.txt", {
      stdio: "inherit",
      cwd: backendDir,
    })

    console.log("Building backend with PyInstaller...")
    execSync("python build_backend.py", { stdio: "inherit", cwd: backendDir })

    if (!fs.existsSync(executablePath)) {
      throw new Error(`Backend executable was not created: ${executablePath}`)
    }

    console.log(`Backend executable created successfully: ${executablePath}`)

    if (platform !== "win32") {
      try {
        fs.chmodSync(executablePath, 0o755) // rwxr-xr-x
        console.log(`Set execute permissions on ${executablePath}`)
      } catch (err) {
        console.warn(`Failed to set execute permissions: ${err.message}`)
      }
    }

    const stats = fs.statSync(executablePath)
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2)
    console.log(`Executable size: ${fileSizeMB} MB`)
  } catch (error) {
    console.error("Failed to build backend:", error.message)
    throw error
  }
}

export default beforePack
