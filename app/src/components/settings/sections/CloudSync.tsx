import { useState } from "react"

type SyncStatus =
  | { type: "idle" }
  | { type: "loading"; action: "export" | "import" }
  | { type: "success"; message: string }
  | { type: "error"; message: string }

export function CloudSync() {
  const [status, setStatus] = useState<SyncStatus>({ type: "idle" })
  const [password, setPassword] = useState("")

  const handleExport = async () => {
    if (!password) {
      setStatus({ type: "error", message: "Password is required for export." })
      return
    }
    setStatus({ type: "loading", action: "export" })
    try {
      const result = await window.electronAPI.sync.exportData(password)
      if (result.canceled) {
        setStatus({ type: "idle" })
        return
      }
      if (result.success) {
        setStatus({
          type: "success",
          message: `Exported successfully to: ${result.filePath}`,
        })
        setPassword("")
      } else {
        setStatus({
          type: "error",
          message: result.error ?? "Export failed.",
        })
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Export failed.",
      })
    }
  }

  const handleImport = async (overwrite = false) => {
    if (!password) {
      setStatus({
        type: "error",
        message: "Password is required for restore.",
      })
      return
    }

    setStatus({ type: "loading", action: "import" })
    try {
      // 1. Pick the file
      const pickResult = await window.electronAPI.sync.pickImportFile()
      if (pickResult.canceled || !pickResult.filePath) {
        setStatus({ type: "idle" })
        return
      }

      // 2. Perform import
      const result = await window.electronAPI.sync.importData(
        password,
        pickResult.filePath,
        overwrite,
      )

      if (result.success) {
        setStatus({
          type: "success",
          message: result.message ?? "Import complete.",
        })
        setPassword("")
      } else {
        setStatus({
          type: "error",
          message: result.error ?? "Import failed.",
        })
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Import failed.",
      })
    }
  }

  const isLoading = status.type === "loading"

  return (
    <div className="max-w-auto space-y-8 p-10">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-white">Data Safety & Transfers</h3>
        <p className="max-w-lg text-xs leading-relaxed text-white/50">
          Keep your information safe by creating a copy you can store or move to a new computer.
          Vault backups can include your members, attendance history, settings, and encrypted
          biometric templates so the system can be restored without re-registering everyone.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-white/30">Vault Password</label>
        <input
          type="password"
          placeholder="Enter password to lock/unlock backup..."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 w-full max-w-md rounded-lg border border-white/10 bg-white/5 px-4 text-xs text-white transition-all duration-300 outline-none placeholder:text-white/20 focus:border-cyan-500/30 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/10"
        />
        <p className="text-[10px] text-white/30 italic">
          This password is used to encrypt your backup file. Don&apos;t lose it!
        </p>
      </div>

      {status.type !== "idle" && (
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-xs ${
            status.type === "loading" ? "border-white/10 bg-white/5 text-white/60"
            : status.type === "success" ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
            : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}>
          {status.type === "loading" ?
            <>
              <i className="fa-solid fa-circle-notch fa-spin mt-0.5 shrink-0" />
              <span>
                {status.action === "export" ? "Saving your data copy…" : "Bringing back your data…"}
              </span>
            </>
          : status.type === "success" ?
            <>
              <i className="fa-solid fa-circle-check mt-0.5 shrink-0" />
              <span className="break-all">{status.message}</span>
            </>
          : <>
              <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0" />
              <span>{status.message}</span>
            </>
          }
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <div className="border-b border-white/6 px-6 py-5">
          <div className="mb-1 flex items-center gap-2">
            <i className="fa-solid fa-upload text-sm text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Create a Backup</h4>
          </div>
          <p className="text-xs text-white/50">
            Download a portable copy of your attendance data for safekeeping.
          </p>
        </div>
        <div className="px-6 py-4">
          <button
            onClick={handleExport}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            {isLoading && status.action === "export" ?
              <i className="fa-solid fa-circle-notch fa-spin" />
            : <i className="fa-solid fa-download" />}
            Download Backup File
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <div className="border-b border-white/6 px-6 py-5">
          <div className="mb-1 flex items-center gap-2">
            <i className="fa-solid fa-file-import text-sm text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Restore from Backup</h4>
          </div>
          <p className="text-xs text-white/50">
            Upload a backup file you created earlier. Suri will intelligently skip records you
            already have to avoid duplicates.
          </p>
        </div>
        <div className="space-y-3 px-6 py-4">
          <button
            onClick={() => handleImport(false)}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            {isLoading && status.action === "import" ?
              <i className="fa-solid fa-circle-notch fa-spin" />
            : <i className="fa-solid fa-file-arrow-up" />}
            Upload Backup File
          </button>
          <div className="space-y-3 border-t border-white/5 pt-4">
            <p className="max-w-md text-[10px] leading-relaxed text-white/30">
              <strong className="text-amber-400/50">Advanced:</strong> If you want to completely
              replace your current data with the contents of the backup file, use the button below.
            </p>
            <button
              onClick={() => handleImport(true)}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-2 text-[11px] font-bold tracking-wider text-amber-400/70 transition-all hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40">
              <i className="fa-solid fa-triangle-exclamation text-[10px]" />
              Restore & Overwrite Current Data
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-lg border border-cyan-500/10 bg-cyan-500/5 p-4">
        <i className="fa-solid fa-shield-halved mt-0.5 shrink-0 text-cyan-400/40" />
        <div className="space-y-1">
          <h5 className="text-[11px] font-medium text-cyan-400/80">Your privacy matters</h5>
          <p className="max-w-lg text-[10px] leading-relaxed text-white/40">
            Vault backups can include encrypted biometric templates so a system can be restored
            without re-registering everyone. In the current desktop app, biometric processing still
            happens locally on the device.
          </p>
        </div>
      </div>
    </div>
  )
}
