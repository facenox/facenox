import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional, Any

TARGET_SIZE = 256
FFT_SIZE = 16


def compute_fft(gray_img: np.ndarray) -> np.ndarray:
    """Computes frequency spectrum map."""
    dft = np.fft.fft2(gray_img)
    dft_shift = np.fft.fftshift(dft)
    magnitude = np.log(np.abs(dft_shift) + 1.0)

    mean_val = magnitude.mean()
    std_val = magnitude.std()
    magnitude = (magnitude - mean_val) / (std_val + 1e-6)
    magnitude = np.clip(magnitude, -3.0, 3.0)
    magnitude = (magnitude + 3.0) / 6.0

    h_m, w_m = magnitude.shape
    return (
        magnitude.reshape(FFT_SIZE, h_m // FFT_SIZE, FFT_SIZE, w_m // FFT_SIZE)
        .max(axis=(1, 3))
        .astype(np.float32)
    )


def crop_face(
    img: np.ndarray, bbox: tuple, target_size: int = TARGET_SIZE
) -> np.ndarray:
    """Extracts tight face crop."""
    h, w = img.shape[:2]
    bx, by, bw, bh = bbox

    max_dim = max(bw, bh)
    cx = bx + bw / 2.0
    cy = by + bh / 2.0
    crop_size = int(max_dim)

    x1 = int(cx - crop_size / 2.0)
    y1 = int(cy - crop_size / 2.0)
    x2 = x1 + crop_size
    y2 = y1 + crop_size

    pad_top = max(0, -y1)
    pad_left = max(0, -x1)
    pad_bottom = max(0, y2 - h)
    pad_right = max(0, x2 - w)

    cropped = img[max(0, y1) : min(h, y2), max(0, x1) : min(w, x2)]
    if pad_top > 0 or pad_left > 0 or pad_bottom > 0 or pad_right > 0:
        cropped = cv2.copyMakeBorder(
            cropped, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_REFLECT_101
        )

    return cv2.resize(
        cropped, (target_size, target_size), interpolation=cv2.INTER_LANCZOS4
    )


def crop_context_face(
    img: np.ndarray, bbox: tuple, scale: float = 2.0, target_size: int = TARGET_SIZE
) -> np.ndarray:
    """Extracts contextual face crop."""
    h, w = img.shape[:2]
    bx, by, bw, bh = bbox
    max_dim = max(bw, bh)

    cx = bx + bw / 2.0
    cy = by + bh / 2.0
    crop_size = int(max_dim * scale)

    x1 = int(cx - crop_size / 2.0)
    y1 = int(cy - crop_size / 2.0)
    x2 = x1 + crop_size
    y2 = y1 + crop_size

    pad_top = max(0, -y1)
    pad_left = max(0, -x1)
    pad_bottom = max(0, y2 - h)
    pad_right = max(0, x2 - w)

    cropped = img[max(0, y1) : min(h, y2), max(0, x1) : min(w, x2)]
    if pad_top > 0 or pad_left > 0 or pad_bottom > 0 or pad_right > 0:
        cropped = cv2.copyMakeBorder(
            cropped, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_REFLECT_101
        )

    return cv2.resize(
        cropped, (target_size, target_size), interpolation=cv2.INTER_LANCZOS4
    )


def check_glare_and_illumination(gray_tight: np.ndarray) -> Tuple[bool, str]:
    """Validates face illumination."""
    if gray_tight.size == 0:
        return False, "zero_face_area"

    mean_b = float(np.mean(gray_tight))
    if mean_b < 20.0:
        return False, "too_dark"

    sat_ratio = float(np.sum(gray_tight >= 235) / gray_tight.size)
    spec_ratio = float(np.sum(gray_tight >= 250) / gray_tight.size)

    if mean_b > 215.0 or sat_ratio > 0.25 or spec_ratio > 0.05:
        return False, "glare"

    return True, "ok"


def preprocess_batch(
    face_crops: List[Any], model_img_size: int = TARGET_SIZE
) -> Dict[str, np.ndarray]:
    """Preprocesses batch inputs."""
    if not face_crops:
        raise ValueError("face_crops list cannot be empty")

    n = len(face_crops)
    tight_batch = np.zeros((n, 3, model_img_size, model_img_size), dtype=np.float32)
    fft_batch = np.zeros((n, 1, FFT_SIZE, FFT_SIZE), dtype=np.float32)
    ctx_batch = np.zeros((n, 3, model_img_size, model_img_size), dtype=np.float32)

    for i, item in enumerate(face_crops):
        if isinstance(item, dict):
            tight = item["tight"]
            fft_map = item["fft"]
            ctx = item["ctx"]
        elif isinstance(item, (tuple, list)) and len(item) == 3:
            tight, fft_map, ctx = item
        elif isinstance(item, np.ndarray):
            tight = item
            if tight.shape[:2] != (model_img_size, model_img_size):
                tight = cv2.resize(
                    tight,
                    (model_img_size, model_img_size),
                    interpolation=cv2.INTER_LANCZOS4,
                )
            gray = (
                cv2.cvtColor(tight, cv2.COLOR_RGB2GRAY)
                if len(tight.shape) == 3 and tight.shape[2] == 3
                else tight
            )
            fft_map = compute_fft(gray)
            ctx = tight.copy()
        else:
            raise TypeError(f"Unsupported face crop item type: {type(item)}")

        tight_batch[i] = tight.transpose(2, 0, 1).astype(np.float32) / 255.0
        fft_batch[i] = fft_map[None, :, :]
        ctx_batch[i] = ctx.transpose(2, 0, 1).astype(np.float32) / 255.0

    return {
        "input_tight": tight_batch,
        "input_fft": fft_batch,
        "input_ctx": ctx_batch,
    }


def extract_bbox_coordinates(
    detection: Dict,
) -> Optional[Tuple[float, float, float, float]]:
    bbox = detection.get("bbox", {})
    if not isinstance(bbox, dict):
        return None

    x = float(bbox.get("x", 0))
    y = float(bbox.get("y", 0))
    w = float(bbox.get("width", 0))
    h = float(bbox.get("height", 0))

    if w <= 0 or h <= 0:
        return None

    return (x, y, w, h)


def extract_face_crops_from_detections(
    rgb_image: np.ndarray,
    detections: List[Dict],
) -> Tuple[List[Dict[str, Any]], List[Dict], List[Dict]]:
    face_crops = []
    valid_detections = []
    skipped_results = []

    for detection in detections:
        bbox_coords = extract_bbox_coordinates(detection)
        if bbox_coords is None:
            skipped_results.append(detection)
            continue

        x, y, w, h = bbox_coords

        try:
            tight_crop = crop_face(rgb_image, (x, y, w, h), target_size=TARGET_SIZE)
            ctx_crop = crop_context_face(
                rgb_image, (x, y, w, h), scale=2.0, target_size=TARGET_SIZE
            )
            gray_tight = cv2.cvtColor(tight_crop, cv2.COLOR_RGB2GRAY)

            is_illum_ok, guard_reason = check_glare_and_illumination(gray_tight)
            if not is_illum_ok:
                detection["liveness"] = {
                    "is_real": False,
                    "status": guard_reason,
                    "logit_diff": -5.0,
                    "real_logit": -5.0,
                    "spoof_logit": 5.0,
                    "confidence": 5.0,
                    "message": f"Quality Gate: {guard_reason}",
                }
                skipped_results.append(detection)
                continue

            fft_map = compute_fft(gray_tight)

            bundle = {
                "tight": tight_crop,
                "fft": fft_map,
                "ctx": ctx_crop,
            }
            face_crops.append(bundle)
            valid_detections.append(detection)

        except Exception:
            skipped_results.append(detection)
            continue

    return face_crops, valid_detections, skipped_results
