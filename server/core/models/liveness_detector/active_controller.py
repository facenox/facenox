import os
import time
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
import cv2
import numpy as np

AUDIT_LOG_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "logs", "live_active_audit.log"
    )
)


def _audit(
    tag: str,
    logit_diff: float,
    state: str,
    yaw: float,
    base_yaw: float,
    delta_yaw: float,
    strain: float,
    vpi: float,
    latch: int,
    reason: str,
):
    try:
        os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)
        now_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        line = (
            f"[{now_str}] {tag:6s} | Marg:{logit_diff:+.2f} | State:{state:11s} | "
            f"Yaw:{yaw:.2f} (base:{base_yaw:.2f}, d:{delta_yaw:.2f}) | "
            f"Str:{strain:5.2f}% VPI:{vpi:4.1f} | L:{latch}/3 | {reason}"
        )
        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        print(f"[ActiveChallenge] {line}", flush=True)
    except Exception:
        pass


class ActiveChallengeState(Enum):
    PASSIVE = "passive"
    CHALLENGING = "challenging"
    VERIFIED = "verified"
    REJECTED = "rejected"


def _normalize_landmarks(landmarks: Optional[Any]) -> Optional[np.ndarray]:
    if landmarks is None:
        return None
    arr = np.asarray(landmarks, dtype=np.float32)
    if arr.ndim == 1 and len(arr) >= 10:
        return arr[:10].reshape(5, 2).copy()
    elif arr.ndim == 2 and arr.shape[0] >= 5 and arr.shape[1] == 2:
        return arr[:5].copy()
    return None


class ActiveLivenessController:
    def __init__(
        self,
        timeout_sec: float = 6.0,
        hold_verified_sec: float = 4.0,
        required_passive_frames: int = 1,
    ):
        self.state = ActiveChallengeState.PASSIVE
        self.challenge_start_time = 0.0
        self.idle_start_time = 0.0
        self.verified_start_time = 0.0
        self.rejected_time = 0.0
        self.verified_confirm_count = 0
        self.passive_confirm_count = 0
        self.required_passive_frames = max(1, required_passive_frames)
        self.timeout_sec = timeout_sec
        self.hold_verified_sec = hold_verified_sec
        self.baseline_yaw = 1.0
        self.baseline_landmarks = None
        self.turn_initiated = False

    def reset(self):
        self.state = ActiveChallengeState.PASSIVE
        self.challenge_start_time = 0.0
        self.idle_start_time = 0.0
        self.verified_start_time = 0.0
        self.rejected_time = 0.0
        self.verified_confirm_count = 0
        self.passive_confirm_count = 0
        self.baseline_yaw = 1.0
        self.baseline_landmarks = None
        self.turn_initiated = False

    def start_challenge(
        self,
        current_yaw: float,
        landmarks: Optional[np.ndarray] = None,
        now_time: Optional[float] = None,
    ):
        self.state = ActiveChallengeState.CHALLENGING
        self.idle_start_time = now_time if now_time is not None else time.time()
        self.challenge_start_time = self.idle_start_time
        self.baseline_yaw = current_yaw
        self.verified_confirm_count = 0
        self.turn_initiated = False
        self.baseline_landmarks = _normalize_landmarks(landmarks)

    def evaluate(
        self,
        landmarks: Optional[np.ndarray],
        passive_liveness: Dict[str, Any],
        now_time: Optional[float] = None,
    ) -> Dict[str, Any]:
        if now_time is None:
            now_time = time.time()

        liveness = dict(passive_liveness)
        passive_status = liveness.get("status")

        if passive_status in {
            "glare",
            "too_dark",
            "center_face",
            "move_closer",
            "error",
        }:
            self.reset()
            return liveness

        pts_curr = _normalize_landmarks(landmarks)
        if pts_curr is None:
            if passive_status == "real":
                liveness["status"] = "candidate_real"
                liveness["is_real"] = False
                liveness["message"] = "Hold still, detecting landmarks"
            return liveness

        re_curr, le_curr, nose_curr = pts_curr[0], pts_curr[1], pts_curr[2]
        dist_l = float(np.linalg.norm(nose_curr - le_curr))
        dist_r = float(np.linalg.norm(nose_curr - re_curr))
        yaw_ratio = float(dist_l / (dist_r + 1e-6))

        if self.state == ActiveChallengeState.REJECTED:
            if now_time - self.rejected_time > 2.0:
                self.reset()
            else:
                liveness["status"] = "spoof"
                liveness["is_real"] = False
                liveness["message"] = "Verification Failed"
                return liveness

        if self.state == ActiveChallengeState.VERIFIED:
            if now_time - self.verified_start_time > self.hold_verified_sec:
                self.reset()
            else:
                liveness["status"] = "real"
                liveness["is_real"] = True
                liveness["active_verified"] = True
                liveness["message"] = "Liveness Verified"
                return liveness

        if self.state == ActiveChallengeState.PASSIVE:
            is_confirmed_spoof = (
                passive_liveness.get("is_confirmed_spoof")
                or passive_liveness.get("logit_diff", 0.0) < 0.0
                or passive_status == "spoof"
            )
            is_confirmed_real = (passive_status == "real") and not is_confirmed_spoof

            if is_confirmed_spoof:
                self.passive_confirm_count = 0
                return liveness
            elif is_confirmed_real:
                self.passive_confirm_count += 1
            else:
                self.passive_confirm_count = max(0, self.passive_confirm_count - 1)

            if self.passive_confirm_count < self.required_passive_frames:
                liveness["status"] = "candidate_real"
                liveness["is_real"] = False
                liveness["message"] = "Scanning face..."
                return liveness

            self.start_challenge(yaw_ratio, pts_curr, now_time=now_time)
            liveness["status"] = "candidate_real"
            liveness["is_real"] = False
            liveness["message"] = "Slowly turn head"
            return liveness

        cur_margin = float(passive_liveness.get("logit_diff", 0.0))

        if self.state == ActiveChallengeState.CHALLENGING:
            yaw_delta = abs(yaw_ratio - self.baseline_yaw)

            # Check for spoof attack during challenge
            if not self.turn_initiated and yaw_delta < 0.08:
                if (
                    (passive_liveness.get("is_confirmed_spoof") and cur_margin < -0.40)
                    or cur_margin < -1.5
                    or passive_status in {"glare", "too_dark"}
                ):
                    _audit(
                        "ABORT",
                        cur_margin,
                        "CHALLENGING",
                        yaw_ratio,
                        self.baseline_yaw,
                        yaw_delta,
                        0.0,
                        0.0,
                        0,
                        f"Aborted: Spoof detected (margin={cur_margin:.2f}, status={passive_status})",
                    )
                    self.reset()
                    liveness["status"] = "spoof"
                    liveness["is_real"] = False
                    liveness["message"] = "Verification Failed"
                    return liveness
            else:
                if passive_status in {"glare", "too_dark"}:
                    _audit(
                        "ABORT",
                        cur_margin,
                        "CHALLENGING",
                        yaw_ratio,
                        self.baseline_yaw,
                        yaw_delta,
                        0.0,
                        0.0,
                        0,
                        f"Aborted: Quality drop ({passive_status})",
                    )
                    self.reset()
                    liveness["status"] = passive_status
                    liveness["is_real"] = False
                    return liveness

            if not self.turn_initiated:
                if yaw_delta < 0.08 and (0.75 <= yaw_ratio <= 1.30):
                    self.baseline_yaw = yaw_ratio
                    self.baseline_landmarks = pts_curr
                    self.challenge_start_time = now_time

                    if (now_time - self.idle_start_time) > 8.0:
                        _audit(
                            "TOUT",
                            cur_margin,
                            "CHALLENGING",
                            yaw_ratio,
                            self.baseline_yaw,
                            yaw_delta,
                            0.0,
                            0.0,
                            0,
                            "Idle timeout (> 8.0s without movement)",
                        )
                        self.reset()
                        liveness["status"] = "candidate_real"
                        liveness["is_real"] = False
                        liveness["message"] = "Active Challenge Timeout"
                        return liveness
                else:
                    self.turn_initiated = True

            if self.turn_initiated:
                elapsed = now_time - self.challenge_start_time
                if elapsed > self.timeout_sec:
                    _audit(
                        "TOUT",
                        cur_margin,
                        "CHALLENGING",
                        yaw_ratio,
                        self.baseline_yaw,
                        yaw_delta,
                        0.0,
                        0.0,
                        0,
                        f"Turn timeout (elapsed {elapsed:.2f}s > {self.timeout_sec:.1f}s)",
                    )
                    self.reset()
                    liveness["status"] = "candidate_real"
                    liveness["is_real"] = False
                    liveness["message"] = "Active Challenge Timeout"
                    return liveness

            if self.baseline_landmarks is not None:
                pts_base = self.baseline_landmarks

                H, _ = cv2.findHomography(pts_base, pts_curr, method=0)
                if H is not None:
                    base_homo = np.hstack([pts_base, np.ones((5, 1), dtype=np.float32)])
                    proj = (H @ base_homo.T).T
                    proj_2d = proj[:, :2] / (proj[:, 2:3] + 1e-7)
                    h_err = float(
                        np.sqrt(np.mean(np.sum((pts_curr - proj_2d) ** 2, axis=1)))
                    )
                else:
                    h_err = 0.0

                re_base, le_base, nose_base = pts_base[0], pts_base[1], pts_base[2]
                span_curr = float(np.linalg.norm(le_curr - re_curr))
                span_base = float(np.linalg.norm(le_base - re_base))
                eye_contraction = span_curr / (span_base + 1e-6)

                eye_axis_curr = (le_curr - re_curr) / (span_curr + 1e-6)
                nose_disp_curr = float(
                    np.dot(nose_curr - (le_curr + re_curr) * 0.5, eye_axis_curr)
                    / (span_curr + 1e-6)
                )

                eye_axis_base = (le_base - re_base) / (span_base + 1e-6)
                nose_disp_base = float(
                    np.dot(nose_base - (le_base + re_base) * 0.5, eye_axis_base)
                    / (span_base + 1e-6)
                )

                delta_nose = abs(nose_disp_curr - nose_disp_base)
                expected_planar = (1.0 - eye_contraction**2) * 0.08
                vpi = float((delta_nose - expected_planar) * 100.0)

                ipd_curr = span_curr
                strain_pct = (h_err / (ipd_curr + 1e-6)) * 100.0

                if yaw_delta >= 0.18:
                    if strain_pct < 1.00:
                        _audit(
                            "REJECT",
                            cur_margin,
                            "CHALLENGING",
                            yaw_ratio,
                            self.baseline_yaw,
                            yaw_delta,
                            strain_pct,
                            vpi,
                            0,
                            f"Planar Spoof: Strain={strain_pct:.2f}% < 1.00%",
                        )
                        self.state = ActiveChallengeState.REJECTED
                        self.rejected_time = now_time
                        self.verified_confirm_count = 0
                        liveness["status"] = "spoof"
                        liveness["is_real"] = False
                        liveness["message"] = "Verification Failed"
                        return liveness

                    elif strain_pct >= 1.90 and vpi >= 4.5:
                        self.verified_confirm_count += 1
                        if self.verified_confirm_count >= 3:
                            _audit(
                                "PASS",
                                cur_margin,
                                "VERIFIED",
                                yaw_ratio,
                                self.baseline_yaw,
                                yaw_delta,
                                strain_pct,
                                vpi,
                                3,
                                f"3D Parallax Verified! (Strain={strain_pct:.2f}%, VPI={vpi:.1f})",
                            )
                            self.state = ActiveChallengeState.VERIFIED
                            self.verified_start_time = now_time
                            liveness["status"] = "real"
                            liveness["is_real"] = True
                            liveness["active_verified"] = True
                            liveness["message"] = "Liveness Verified"
                            return liveness
                        else:
                            _audit(
                                "LATCH",
                                cur_margin,
                                "CHALLENGING",
                                yaw_ratio,
                                self.baseline_yaw,
                                yaw_delta,
                                strain_pct,
                                vpi,
                                self.verified_confirm_count,
                                f"3D Motion Latching ({self.verified_confirm_count}/3)",
                            )
                    else:
                        _audit(
                            "INSUFF",
                            cur_margin,
                            "CHALLENGING",
                            yaw_ratio,
                            self.baseline_yaw,
                            yaw_delta,
                            strain_pct,
                            vpi,
                            self.verified_confirm_count,
                            f"Insufficient 3D strain (Strain={strain_pct:.2f}%, VPI={vpi:.1f})",
                        )
                        self.verified_confirm_count = max(
                            0, self.verified_confirm_count - 1
                        )
                else:
                    _audit(
                        "WAIT",
                        cur_margin,
                        "CHALLENGING",
                        yaw_ratio,
                        self.baseline_yaw,
                        yaw_delta,
                        strain_pct,
                        vpi,
                        self.verified_confirm_count,
                        f"Yaw delta too small ({yaw_delta:.2f} < 0.18)",
                    )

            liveness["status"] = "candidate_real"
            liveness["is_real"] = False
            liveness["message"] = "Slowly turn head"
            return liveness
