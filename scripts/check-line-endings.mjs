import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const entries = execFileSync("git", ["ls-files", "--eol", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0")

const failures = []
let checked = 0

for (const entry of entries) {
  if (!entry) continue
  const separator = entry.indexOf("\t")
  const metadata = entry.slice(0, separator)
  const file = entry.slice(separator + 1)
  const indexEnding = /^i\/(\S+)/.exec(metadata)?.[1]
  const workingEnding = /\bw\/(\S+)/.exec(metadata)?.[1]

  // Binary files, files without newlines, and sparse-checkout omissions need no conversion.
  if (!workingEnding || workingEnding === "-text" || workingEnding === "none") continue

  const expected = /\.(bat|cmd)$/.test(file) ? "crlf" : "lf"
  checked++
  if (workingEnding !== expected || indexEnding === "crlf" || indexEnding === "mixed") {
    failures.push(
      `${file}: expected ${expected} checkout and LF index; got ${workingEnding} / ${indexEnding}`,
    )
  }
}

if (failures.length) {
  console.error(`Line-ending policy failed:\n${failures.join("\n")}`)
  process.exitCode = 1
} else {
  console.log(`Line-ending policy passed for ${checked} tracked text files.`)
}
