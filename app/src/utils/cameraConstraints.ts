export function buildCameraConstraints(deviceId?: string): MediaStreamConstraints {
  const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : {}

  return {
    video: Object.keys(video).length > 0 ? video : true,
    audio: false,
  }
}
