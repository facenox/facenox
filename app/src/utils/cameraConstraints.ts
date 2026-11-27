export function buildCameraConstraints(deviceId?: string): MediaStreamConstraints {
  const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : {}

  return {
    video: Object.keys(video).length > 0 ? video : true,
    audio: false
  }
}

export interface FormattedCameraOption {
  value: string
  label: string
}

/**
 * Format camera device labels by stripping hardware/USB ID tags, and deduplicate
 * identical camera names by appending numerical tags (e.g. "Webcam (#1)", "Webcam (#2)")
 * only if multiple devices end up with the same name.
 *
 * @param devices The raw MediaDeviceInfo list.
 * @returns A list of formatted option objects for Dropdown components.
 */
export function formatCameraDevices(devices: MediaDeviceInfo[]): FormattedCameraOption[] {
  const items = devices.map((device, index) => {
    const rawLabel = device.label || `Camera ${index + 1}`
    // Match patterns like (04f2:b613), (usb-0000:00:14.0-1.6), and (/dev/video0)
    const cleanLabel = rawLabel
      .replace(/\s*\((usb-[\w\d:.-]+|[0-9a-fA-F]{4}:[0-9a-fA-F]{4}|\/dev\/video\d+)\)/gi, '')
      .trim()
    return {
      deviceId: device.deviceId,
      cleanLabel
    }
  })

  const counts: Record<string, number> = {}
  items.forEach((item) => {
    counts[item.cleanLabel] = (counts[item.cleanLabel] || 0) + 1
  })

  const indices: Record<string, number> = {}
  return items.map((item) => {
    if (counts[item.cleanLabel] > 1) {
      indices[item.cleanLabel] = (indices[item.cleanLabel] || 0) + 1
      return {
        value: item.deviceId,
        label: `${item.cleanLabel} (#${indices[item.cleanLabel]})`
      }
    }
    return {
      value: item.deviceId,
      label: item.cleanLabel
    }
  })
}
