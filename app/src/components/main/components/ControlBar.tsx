import { Dropdown, Tooltip } from "@/components/shared"

interface ControlBarProps {
  cameraDevices: MediaDeviceInfo[]
  selectedCamera: string
  setSelectedCamera: (deviceId: string) => void
  isStreaming: boolean
  startCamera: () => void
  stopCamera: (forceCleanup?: boolean) => void
  hasSelectedGroup: boolean
}

export function ControlBar({
  cameraDevices,
  selectedCamera,
  setSelectedCamera,
  isStreaming,
  startCamera,
  stopCamera,
  hasSelectedGroup,
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
        label: "Stop Tracking",
        className: "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20",
        tooltip: "Stop tracking attendance",
        enabled: true,
      }
    }

    if (!hasSelectedGroup) {
      return {
        label: "Start Tracking",
        className:
          "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
        tooltip: "Create or select a group to start tracking",
        enabled: true,
      }
    }

    const cyanStyle = "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20"

    const standardTooltip = hasCameraDevices ? "Start tracking attendance" : "No camera detected"

    return {
      label: "Start Tracking",
      className: cyanStyle,
      tooltip: standardTooltip,
      enabled: hasCameraDevices,
    }
  }

  const buttonState = getButtonState()

  return (
    <div>
      <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg p-4 pt-0">
        <div className="flex items-center space-x-6">
          {cameraDevices.length > 0 && (
            <div className="flex flex-col items-start space-y-1">
              <div className="min-w-50">
                <Dropdown
                  options={cameraDevices.map((device, index) => ({
                    value: device.deviceId,
                    label: device.label || `Camera ${index + 1}`,
                  }))}
                  value={selectedCamera}
                  onChange={(deviceId) => {
                    if (deviceId) setSelectedCamera(String(deviceId))
                  }}
                  placeholder="Select camera…"
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
              className={`flex min-w-35 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 ${buttonState.className}`}>
              {buttonState.label}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
