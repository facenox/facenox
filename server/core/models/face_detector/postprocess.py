import numpy as np
from typing import Dict, Optional


def process_detection(
    face: np.ndarray,
    min_face_size: int,
    landmarks_5: np.ndarray,
    img_width: int,
    img_height: int,
    edge_margin: int = 0,
) -> Optional[Dict]:
    x, y, w, h = face[:4].astype(int)
    conf = float(face[14])

    if x < 0 or y < 0 or x + w > img_width or y + h > img_height:
        return None

    if edge_margin > 0:
        dist_left = x
        dist_right = img_width - (x + w)
        dist_top = y
        dist_bottom = img_height - (y + h)
        if min(dist_left, dist_right, dist_top, dist_bottom) < edge_margin:
            return None

    detection = {
        "bbox": {
            "x": float(x),
            "y": float(y),
            "width": float(w),
            "height": float(h),
        },
        "confidence": conf,
        "landmarks_5": landmarks_5.tolist(),
    }

    if min_face_size > 0 and (w < min_face_size or h < min_face_size):
        detection["liveness"] = {
            "is_real": None,
            "status": "unknown",
        }

    return detection
