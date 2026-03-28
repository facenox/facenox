import json
from typing import Optional

TOTAL_STARTUP_STEPS = 9
STARTUP_PROGRESS_PREFIX = "FACENOX_STARTUP_PROGRESS:"


def emit_startup_progress(step: int, detail: Optional[str] = None):
    safe_step = max(0, min(step, TOTAL_STARTUP_STEPS))
    progress = round((safe_step / TOTAL_STARTUP_STEPS) * 100)
    payload = {
        "step": safe_step,
        "total_steps": TOTAL_STARTUP_STEPS,
        "progress": progress,
    }

    if detail:
        payload["detail"] = detail

    print(f"{STARTUP_PROGRESS_PREFIX}{json.dumps(payload)}", flush=True)
