import http from "node:http"
import path from "node:path"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"

const host = "127.0.0.1"
const port = 4173
const rootDir = path.resolve(process.cwd(), "out/renderer")

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

function resolvePath(urlPath) {
  const relativePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "")
  const candidate = path.resolve(rootDir, relativePath)
  if (candidate === rootDir || candidate.startsWith(rootDir + path.sep)) {
    return candidate
  }
  return path.join(rootDir, "index.html")
}

if (!existsSync(rootDir)) {
  console.error(`Renderer build output not found at ${rootDir}. Run "pnpm build" first.`)
  process.exit(1)
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`)
    let filePath = resolvePath(url.pathname)

    if (!existsSync(filePath) || filePath.endsWith(path.sep)) {
      filePath = path.join(rootDir, "index.html")
    }

    const body = await readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    })
    response.end(body)
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    response.end(error instanceof Error ? error.message : "Not found")
  }
})

server.listen(port, host, () => {
  console.log(`Renderer preview available at http://${host}:${port}`)
})
