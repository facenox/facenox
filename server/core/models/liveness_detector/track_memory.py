from collections import defaultdict
from typing import Dict


class TrackLivenessMemory:
    def __init__(
        self,
        required_real_frames: int = 2,
        max_stale_frames: int = 30,
        cleanup_interval: int = 10,
        reset_after_gap_frames: int = 5,
    ):
        self.required_real_frames = max(1, required_real_frames)
        self.max_stale_frames = max_stale_frames
        self.cleanup_interval = cleanup_interval
        self.reset_after_gap_frames = max(1, reset_after_gap_frames)
        self.namespace_frames = defaultdict(int)
        self.namespace_last_cleanup_frame = defaultdict(int)
        self.track_states = defaultdict(
            lambda: {
                "consecutive_real_frames": 0,
                "stable_real": False,
                "last_frame": -1,
            }
        )

    @staticmethod
    def _normalize_namespace(namespace: str | None) -> str:
        return namespace or "__global__"

    def stabilize(
        self,
        track_id: int,
        liveness: Dict,
        frame_number: int,
        namespace: str | None = None,
    ) -> Dict:
        if frame_number < 0:
            frame_number = 0

        namespace_key = self._normalize_namespace(namespace)
        namespace_frame = self.namespace_frames[namespace_key]
        if frame_number < namespace_frame:
            frame_number = namespace_frame

        self.namespace_frames[namespace_key] = frame_number

        raw_status = liveness.get("status")
        if track_id <= 0 or raw_status not in {"real", "spoof"}:
            return liveness

        state = self.track_states[(namespace_key, track_id)]
        last_seen_frame = state["last_frame"]
        if (
            last_seen_frame >= 0
            and (frame_number - last_seen_frame) > self.reset_after_gap_frames
        ):
            state["consecutive_real_frames"] = 0
            state["stable_real"] = False

        state["last_frame"] = frame_number

        stabilized = dict(liveness)

        if raw_status == "spoof":
            state["consecutive_real_frames"] = 0

            # Infinite lock: once a track is confirmed real, spoof frames are ignored
            # until lifecycle reset (gap reset / stale cleanup / namespace clear).
            if state["stable_real"]:
                stabilized["status"] = "real"
                stabilized["is_real"] = True
                return stabilized

            state["stable_real"] = False
            stabilized["status"] = "spoof"
            stabilized["is_real"] = False
            return stabilized

        state["consecutive_real_frames"] += 1

        if (
            state["stable_real"]
            or state["consecutive_real_frames"] >= self.required_real_frames
        ):
            state["stable_real"] = True
            stabilized["status"] = "real"
            stabilized["is_real"] = True
            return stabilized

        stabilized["status"] = "candidate_real"
        stabilized["is_real"] = False
        return stabilized

    def clear_namespace(self, namespace: str | None):
        namespace_key = self._normalize_namespace(namespace)
        keys_to_remove = [
            key for key in list(self.track_states.keys()) if key[0] == namespace_key
        ]
        for key in keys_to_remove:
            del self.track_states[key]
        if namespace_key in self.namespace_frames:
            del self.namespace_frames[namespace_key]
        if namespace_key in self.namespace_last_cleanup_frame:
            del self.namespace_last_cleanup_frame[namespace_key]

    def _cleanup_namespace_stale_tracks(self, namespace_key: str, force: bool = False):
        current_frame = self.namespace_frames[namespace_key]
        last_cleanup_frame = self.namespace_last_cleanup_frame[namespace_key]

        if (
            not force
            and last_cleanup_frame > 0
            and (current_frame - last_cleanup_frame) < self.cleanup_interval
        ):
            return

        stale_tracks = [
            track_key
            for track_key, state in self.track_states.items()
            if track_key[0] == namespace_key
            and current_frame - state["last_frame"] > self.max_stale_frames
        ]

        negative_tracks = [
            track_key
            for track_key in self.track_states.keys()
            if track_key[0] == namespace_key and track_key[1] < 0
        ]
        stale_tracks.extend(negative_tracks)

        for track_key in stale_tracks:
            del self.track_states[track_key]

        self.namespace_last_cleanup_frame[namespace_key] = current_frame

    def cleanup_stale_tracks(self, force: bool = False, namespace: str | None = None):
        if namespace is not None:
            namespace_key = self._normalize_namespace(namespace)
            self._cleanup_namespace_stale_tracks(namespace_key, force=force)
            return

        namespace_keys = set(self.namespace_frames.keys())
        namespace_keys.update(key[0] for key in self.track_states.keys())
        for namespace_key in namespace_keys:
            self._cleanup_namespace_stale_tracks(namespace_key, force=force)
