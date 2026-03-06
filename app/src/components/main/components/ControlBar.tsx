import { Dropdown, Tooltip } from "@/components/shared";
import { StartTimeChip } from "@/components/main/components/StartTimeChip";

interface ControlBarProps {
  cameraDevices: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (deviceId: string) => void;
  isStreaming: boolean;
  startCamera: () => void;
  stopCamera: () => void;
  hasSelectedGroup: boolean;
  lateTrackingEnabled?: boolean;
  classStartTime?: string;
  onStartTimeChange?: (newTime: string) => void;
}

export function ControlBar({
  cameraDevices,
  selectedCamera,
  setSelectedCamera,
  isStreaming,
  startCamera,
  stopCamera,
  hasSelectedGroup,
  lateTrackingEnabled = false,
  classStartTime = "08:00",
  onStartTimeChange,
}: ControlBarProps) {
  const hasCameraDevices = cameraDevices.length > 0;

  const handlePrimaryAction = () => {
    if (isStreaming) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const getButtonState = () => {
    if (isStreaming) {
      return {
        label: "Stop Tracking",
        className:
          "bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30",
        tooltip: "Stop tracking attendance",
        enabled: true,
      };
    }

    if (!hasSelectedGroup) {
      return {
        label: "Start Tracking",
        className:
          "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
        tooltip: "Create or select a group to start tracking",
        enabled: true,
      };
    }

    const cyanStyle =
      "bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30 shadow-lg shadow-cyan-500/10";

    const standardTooltip = hasCameraDevices
      ? "Start tracking attendance"
      : "No camera detected";

    return {
      label: "Start Tracking",
      className: cyanStyle,
      tooltip: standardTooltip,
      enabled: hasCameraDevices,
    };
  };

  const buttonState = getButtonState();

  return (
    <div>
      <div className="rounded-lg p-4 flex items-center justify-between min-h-16 gap-4">
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
                    if (deviceId) setSelectedCamera(String(deviceId));
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
          {lateTrackingEnabled &&
            hasSelectedGroup &&
            onStartTimeChange &&
            !isStreaming && (
              <StartTimeChip
                startTime={classStartTime}
                onTimeChange={onStartTimeChange}
                disabled={isStreaming}
              />
            )}

          <Tooltip content={buttonState.tooltip}>
            <button
              onClick={handlePrimaryAction}
              disabled={!buttonState.enabled}
              className={`min-w-35 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ease-in-out flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${buttonState.className}`}
            >
              {buttonState.label}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
