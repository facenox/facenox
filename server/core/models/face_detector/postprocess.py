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

    if edge_margin > 0:
        dist_left = x
        dist_right = img_width - (x + w)
        dist_top = y
        dist_bottom = img_height - (y + h)
        if min(dist_left, dist_right, dist_top, dist_bottom) < edge_margin:
            detection["liveness"] = {
                "is_real": None,
                "status": "center_face",
                "confidence": 0.0,
                "message": "Center your face",
            }
            return detection

    if min_face_size > 0 and (w < min_face_size or h < min_face_size):
        detection["liveness"] = {
            "is_real": None,
            "status": "move_closer",
            "confidence": 0.0,
            "message": "Move closer",
        }
        return detection

    if landmarks_5 is not None and len(landmarks_5) >= 5:
        re, le, nose = landmarks_5[0], landmarks_5[1], landmarks_5[2]
        rcm, lcm = landmarks_5[3], landmarks_5[4]

        dx = float(le[0] - re[0])
        dy = float(le[1] - re[1])
        roll_deg = abs(float(np.degrees(np.arctan2(dy, dx))))

        dist_l = float(np.linalg.norm(nose - le))
        dist_r = float(np.linalg.norm(nose - re))
        yaw_ratio = float(dist_l / (dist_r + 1e-6))

        eye_center = (le + re) / 2.0
        mouth_center = (lcm + rcm) / 2.0
        dist_en = float(np.linalg.norm(nose - eye_center))
        dist_nm = float(np.linalg.norm(mouth_center - nose))
        pitch_ratio = float(dist_en / (dist_nm + 1e-6))

        if (
            roll_deg > 35.0
            or yaw_ratio < 0.28
            or yaw_ratio > 3.60
            or pitch_ratio < 0.25
            or pitch_ratio > 3.00
        ):
            detection["liveness"] = {
                "is_real": None,
                "status": "look_at_camera",
                "confidence": 0.0,
                "message": "Look at the camera",
            }
            return detection

    return detection
