import { Dropdown, Tooltip } from "@/components/shared"
import { formatCameraDevices } from "@/utils/cameraConstraints"

interface ControlBarProps {
  cameraDevices: MediaDeviceInfo[]
  selectedCamera: string
  setSelectedCamera: (deviceId: string) => void
  isStreaming: boolean
  startCamera: () => void
  stopCamera: (forceCleanup?: boolean) => void
  isShellReady: boolean
  hasGroups: boolean
  hasSelectedGroup: boolean
  hasEnrolledFaces: boolean
}

export function ControlBar({
  cameraDevices,
  selectedCamera,
  setSelectedCamera,
  isStreaming,
  startCamera,
  stopCamera,
  isShellReady,
  hasGroups,
  hasSelectedGroup,
  hasEnrolledFaces,
}: ControlBarProps) {
  const hasCameraDevices = cameraDevices.length > 0

  const handlePrimaryAction = () => {
    if (isStreaming) {
      stopCamera()
    } else {
      startCamera()
    }
  }

  const getButtonState = () => {
    if (isStreaming) {
      return {
        label: "Stop",
        className:
          "bg-rose-500/5 border border-rose-500/10 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 hover:shadow-[0_0_15px_rgba(244,63,94,0.18)] tracking-wider",
        tooltip: undefined,
        enabled: true,
      }
    }

    if (!isShellReady) {
      return {
        label: "Preparing...",
        className:
          "bg-[rgba(22,28,36,0.68)] border border-white/10 text-white/65 hover:bg-[rgba(22,28,36,0.68)] hover:text-white/65",
        tooltip: "Loading groups and settings",
        enabled: false,
      }
    }

    if (!hasGroups) {
      return {
        label: "Start Scan",
        className:
          "bg-[rgba(22,28,36,0.68)] border border-white/10 text-white/70 hover:bg-[rgba(22,28,36,0.68)] hover:text-white/70",
        tooltip: "Create a group first to begin attendance logging",
        enabled: false,
      }
    }

    if (!hasSelectedGroup) {
      return {
        label: "Start Scan",
        className:
          "bg-[rgba(22,28,36,0.68)] border border-white/10 text-white/70 hover:bg-[rgba(22,28,36,0.68)] hover:text-white/70",
        tooltip: "Select a group first to begin attendance logging",
        enabled: false,
      }
    }

    if (!hasEnrolledFaces) {
      return {
        label: "Start Scan",
        className:
          "bg-[rgba(22,28,36,0.68)] border border-white/10 text-white/40 hover:bg-[rgba(22,28,36,0.68)] hover:text-white/40",
        tooltip: "Enroll a group member to begin scanning",
        enabled: false,
      }
    }

    if (!hasCameraDevices) {
      return {
        label: "Start Scan",
        className:
          "bg-[rgba(22,28,36,0.68)] border border-white/10 text-white/40 hover:bg-[rgba(22,28,36,0.68)] hover:text-white/40",
        tooltip: "No camera detected",
        enabled: false,
      }
    }

    const cyanStyle =
      "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 hover:text-cyan-200 hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.35)] tracking-wider"

    return {
      label: "Start Scan",
      className: cyanStyle,
      tooltip: undefined,
      enabled: true,
    }
  }

  const buttonState = getButtonState()

  return (
    <div>
      <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg p-3 pt-0">
        <div className="flex items-center space-x-6">
          {cameraDevices.length > 0 && (
            <div className="flex flex-col items-start space-y-1">
              <div className="w-fit max-w-[260px] min-w-[140px]">
                <Dropdown
                  options={formatCameraDevices(cameraDevices)}
                  value={selectedCamera}
                  onChange={(deviceId) => {
                    if (deviceId) setSelectedCamera(String(deviceId))
                  }}
                  placeholder="Select camera..."
                  emptyMessage="No cameras available"
                  disabled={isStreaming || cameraDevices.length <= 1}
                  maxHeight={256}
                  buttonClassName="text-md px-4"
                  showPlaceholderOption={false}
                  allowClear={false}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Tooltip content={buttonState.tooltip}>
            <button
              onClick={handlePrimaryAction}
              disabled={!buttonState.enabled}
              aria-label={buttonState.label}
              className={`flex min-w-28 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 ${buttonState.className}`}>
              {buttonState.label}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
