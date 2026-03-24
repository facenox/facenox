import math
from typing import Any, List

import numpy as np

from hooks import process_face_detection


def _normalize_bbox(bbox: Any) -> List[float]:
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError("Face metadata must include a bbox with four numeric values")

    normalized = []
    for value in bbox:
        if not isinstance(value, (int, float)):
            raise ValueError("Face metadata bbox values must be numeric")
        normalized.append(float(value))

    if normalized[2] <= 0 or normalized[3] <= 0:
        raise ValueError("Face metadata bbox width and height must be positive")

    return normalized


def _normalize_landmarks(landmarks_5: Any) -> List[List[float]]:
    if not isinstance(landmarks_5, list) or len(landmarks_5) != 5:
        raise ValueError("Face metadata must include exactly five landmarks")

    normalized = []
    for point in landmarks_5:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError("Each landmark must contain two numeric values")
        x, y = point
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise ValueError("Landmark values must be numeric")
        normalized.append([float(x), float(y)])

    return normalized


def _bbox_iou(left: List[float], right: List[float]) -> float:
    left_x1, left_y1, left_w, left_h = left
    right_x1, right_y1, right_w, right_h = right
    left_x2 = left_x1 + left_w
    left_y2 = left_y1 + left_h
    right_x2 = right_x1 + right_w
    right_y2 = right_y1 + right_h

    inter_x1 = max(left_x1, right_x1)
    inter_y1 = max(left_y1, right_y1)
    inter_x2 = min(left_x2, right_x2)
    inter_y2 = min(left_y2, right_y2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h

    union = left_w * left_h + right_w * right_h - intersection
    if union <= 0:
        return 0.0

    return intersection / union


def _avg_landmark_distance(left: List[List[float]], right: List[List[float]]) -> float:
    distances = [
        math.dist((left_point[0], left_point[1]), (right_point[0], right_point[1]))
        for left_point, right_point in zip(left, right, strict=True)
    ]
    return float(sum(distances) / len(distances))


async def verify_detected_face_metadata(
    image: np.ndarray,
    bbox: Any,
    landmarks_5: Any,
    *,
    operation_name: str,
) -> tuple[List[float], List[List[float]]]:
    submitted_bbox = _normalize_bbox(bbox)
    submitted_landmarks = _normalize_landmarks(landmarks_5)

    detections = await process_face_detection(
        image,
        confidence_threshold=0.6,
        nms_threshold=0.3,
        min_face_size=0,
        enable_liveness=False,
    )

    if not detections:
        raise ValueError(f"{operation_name} blocked: no detectable face found in image")

    best_match: tuple[float, float, List[float], List[List[float]]] | None = None

    for detection in detections:
        raw_bbox = detection.get("bbox")
        raw_landmarks = detection.get("landmarks_5")
        if not isinstance(raw_bbox, dict) or raw_landmarks is None:
            continue

        detected_bbox = _normalize_bbox(
            [
                raw_bbox.get("x"),
                raw_bbox.get("y"),
                raw_bbox.get("width"),
                raw_bbox.get("height"),
            ]
        )
        detected_landmarks = _normalize_landmarks(raw_landmarks)

        iou = _bbox_iou(submitted_bbox, detected_bbox)
        diagonal = max(1.0, math.hypot(detected_bbox[2], detected_bbox[3]))
        landmark_ratio = (
            _avg_landmark_distance(submitted_landmarks, detected_landmarks) / diagonal
        )

        if best_match is None or (iou, -landmark_ratio) > (
            best_match[0],
            -best_match[1],
        ):
            best_match = (iou, landmark_ratio, detected_bbox, detected_landmarks)

    if best_match is None:
        raise ValueError(
            f"{operation_name} blocked: detector did not return usable face metadata"
        )

    best_iou, best_landmark_ratio, matched_bbox, matched_landmarks = best_match
    if best_iou < 0.35 or best_landmark_ratio > 0.2:
        raise ValueError(
            f"{operation_name} blocked: submitted face metadata does not match a detected face"
        )

    return matched_bbox, matched_landmarks
