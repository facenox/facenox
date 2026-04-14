import logging
from typing import List, Dict, Optional
import numpy as np
from .byte_tracker import BYTETracker
from . import matching

logger = logging.getLogger(__name__)


class ByteTrackArgs:
    """Simple args object for tracker initialization"""

    def __init__(
        self, track_thresh=0.5, match_thresh=0.8, track_buffer=30, mot20=False
    ):
        self.track_thresh = track_thresh
        self.match_thresh = match_thresh
        self.track_buffer = track_buffer
        self.mot20 = mot20


class FaceTracker:
    """Wrapper around ByteTrack for face tracking."""

    def __init__(
        self,
        track_thresh: float = 0.5,
        match_thresh: float = 0.8,
        track_buffer: int = 30,
        frame_rate: int = 30,
    ):
        """
        Initialize face tracker.

        Args:
            track_thresh: Detection confidence threshold (ByteTrack default: 0.5)
            match_thresh: Matching threshold for association (ByteTrack default: 0.8)
            track_buffer: Buffer size for lost tracks (ByteTrack default: 30)
            frame_rate: Frame rate for tracking (can be updated dynamically)
        """
        self.args = ByteTrackArgs(
            track_thresh=track_thresh,
            match_thresh=match_thresh,
            track_buffer=track_buffer,
            mot20=False,
        )
        self.tracker = BYTETracker(self.args, frame_rate=frame_rate)
        self.frame_rate = frame_rate

    def update_frame_rate(self, frame_rate: int):
        """
        Update frame rate dynamically without resetting tracker state.

        Args:
            frame_rate: New frame rate (clamped between 1 and 120)
        """
        frame_rate = max(1, min(120, int(frame_rate)))
        if frame_rate != self.frame_rate:
            self.frame_rate = frame_rate
            buffer_size = max(1, int(frame_rate / 30.0 * self.args.track_buffer))
            self.tracker.buffer_size = buffer_size
            self.tracker.max_time_lost = buffer_size

    def update(
        self,
        face_detections: List[Dict],
        frame_rate: Optional[int] = None,
    ) -> List[Dict]:
        """
        Update tracker with face detections.

        Args:
            face_detections: List of face detection dictionaries
            frame_rate: Optional frame rate to update dynamically
        """
        if frame_rate is not None:
            self.update_frame_rate(frame_rate)

        if not face_detections:
            output_results = np.empty((0, 5), dtype=np.float32)
            img_info = (640, 640)
            img_size = (640, 640)
            self.tracker.update(output_results, img_info, img_size)
            return []

        dets = []
        valid_faces = []
        valid_original_indices = []
        for original_idx, face in enumerate(face_detections):
            bbox = face.get("bbox", {})

            if not isinstance(bbox, dict):
                logger.warning(f"Invalid bbox format: {bbox}")
                continue

            x = bbox.get("x", 0)
            y = bbox.get("y", 0)
            width = bbox.get("width", 0)
            height = bbox.get("height", 0)

            if width <= 0 or height <= 0:
                logger.warning(
                    f"Invalid bbox dimensions: width={width}, height={height}"
                )
                continue

            x1, y1 = x, y
            x2, y2 = x + width, y + height
            score = face.get("confidence", 1.0)

            dets.append([x1, y1, x2, y2, score])
            valid_faces.append(face)
            valid_original_indices.append(original_idx)

        if not dets:
            output_results = np.empty((0, 5), dtype=np.float32)
            img_info = (640, 640)
            img_size = (640, 640)
            self.tracker.update(output_results, img_info, img_size)
            return []

        dets_array = np.array(dets, dtype=np.float32)
        output_results = dets_array

        img_info = (640, 640)
        img_size = (640, 640)

        output_stracks = self.tracker.update(output_results, img_info, img_size)

        result_by_index: dict[int, Dict] = {}
        if output_stracks and len(valid_faces) > 0:
            track_bboxes = np.asarray(
                [track.tlbr for track in output_stracks], dtype=np.float32
            )
            det_bboxes = dets_array[:, :4]
            cost_matrix = matching.iou_distance(track_bboxes, det_bboxes)
            matches, _, _ = matching.linear_assignment(
                cost_matrix, thresh=self.args.match_thresh
            )

            for track_idx, det_idx in matches:
                if track_idx >= len(output_stracks) or det_idx >= len(valid_faces):
                    continue
                original_idx = valid_original_indices[det_idx]
                face_result = valid_faces[det_idx].copy()
                face_result["track_id"] = int(output_stracks[track_idx].track_id)
                result_by_index[original_idx] = face_result

        # Preserve original ordering and assign negative IDs to any detection
        # the tracker did not confidently match back to a returned track.
        result: List[Dict] = []
        for original_idx, face in enumerate(face_detections):
            if original_idx in result_by_index:
                result.append(result_by_index[original_idx])
                continue

            face_result = face.copy()
            face_result["track_id"] = -(original_idx + 1)
            result.append(face_result)

        return result
