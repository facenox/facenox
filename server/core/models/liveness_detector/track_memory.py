from collections import defaultdict, deque
from typing import Dict


class TrackLivenessMemory:
    def __init__(
        self,
        required_real_frames: int = 2,
        history_size: int = 5,
        max_stale_frames: int = 30,
        cleanup_interval: int = 10,
        reset_after_gap_frames: int = 5,
    ):
        self.required_real_frames = max(1, required_real_frames)
        self.history_size = max(self.required_real_frames, history_size)
        self.max_stale_frames = max_stale_frames
        self.cleanup_interval = cleanup_interval
        self.reset_after_gap_frames = max(1, reset_after_gap_frames)
        self.current_frame = 0
        self.last_cleanup_frame = 0
        self.track_states = defaultdict(
            lambda: {
                "recent_statuses": deque(maxlen=self.history_size),
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

        if frame_number < self.current_frame:
            frame_number = self.current_frame

        self.current_frame = frame_number

        raw_status = liveness.get("status")
        if track_id <= 0 or raw_status not in {"real", "spoof"}:
            return liveness

        state = self.track_states[(self._normalize_namespace(namespace), track_id)]
        last_seen_frame = state["last_frame"]
        if (
            last_seen_frame >= 0
            and (frame_number - last_seen_frame) > self.reset_after_gap_frames
        ):
            state["consecutive_real_frames"] = 0
            state["stable_real"] = False
            state["recent_statuses"].clear()

        recent_statuses = state["recent_statuses"]
        recent_statuses.append(raw_status)
        state["last_frame"] = frame_number

        stabilized = dict(liveness)

        if raw_status == "spoof":
            state["consecutive_real_frames"] = 0

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

    def cleanup_stale_tracks(self, force: bool = False):
        if (
            not force
            and self.last_cleanup_frame > 0
            and (self.current_frame - self.last_cleanup_frame) < self.cleanup_interval
        ):
            return

        stale_tracks = [
            track_key
            for track_key, state in self.track_states.items()
            if self.current_frame - state["last_frame"] > self.max_stale_frames
        ]

        negative_tracks = [
            track_key for track_key in self.track_states.keys() if track_key[1] < 0
        ]
        stale_tracks.extend(negative_tracks)

        for track_key in stale_tracks:
            del self.track_states[track_key]

        self.last_cleanup_frame = self.current_frame
