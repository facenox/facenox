import hmac
import logging
import os
import secrets
import uvicorn

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi import Request

from config.models import (
    FACE_DETECTOR_CONFIG,
    FACE_RECOGNIZER_CONFIG,
    FACE_TRACKER_CONFIG,
    LIVENESS_DETECTOR_CONFIG,
)
from core.lifespan import lifespan
from api.endpoints import router
from middleware.cors import setup_cors

if not logging.getLogger().handlers:
    from config.logging_config import get_logging_config

    try:
        logging_config = get_logging_config()
        logging.config.dictConfig(logging_config)
    except Exception as e:
        logging.basicConfig(level=logging.INFO)
        print(f"Failed to load logging config: {e}")

logger = logging.getLogger(__name__)
logger.info("Server script started")


# When Electron does not inject FACENOX_API_TOKEN (e.g. direct
# `python run.py` invocations), generate a one-time nonce so the
# local API is never fully open.  The nonce is printed at startup.
_STARTUP_NONCE: str = secrets.token_urlsafe(32)


def _get_effective_token() -> str:
    """Return the Electron-injected token or fall back to the startup nonce."""
    return os.getenv("FACENOX_API_TOKEN") or _STARTUP_NONCE


def is_valid_local_token(provided: str) -> bool:
    return hmac.compare_digest(provided, _get_effective_token())


app = FastAPI(
    title="FACENOX",
    description="A desktop application for automated attendance tracking using Artificial Intelligence.",
    lifespan=lifespan,
)


setup_cors(app)


@app.middleware("http")
async def verify_local_token(request: Request, call_next):
    """Reject requests that don’t carry the session token injected by Electron.

    Only active when FACENOX_API_TOKEN is set in the environment (i.e. when the
    backend is launched by the Electron shell).  Direct ‘python run.py’
    invocations without the variable skip validation so development remains
    convenient, but a warning is emitted.
    """
    # Health-check and CORS preflight are always public
    if request.url.path == "/" or request.method == "OPTIONS":
        return await call_next(request)

    if not getattr(app.state, "_token_warn_emitted", False):
        if not os.getenv("FACENOX_API_TOKEN"):
            logger.warning(
                "FACENOX_API_TOKEN is not set.  A startup nonce has been generated. "
                "Use X-Facenox-Token: %s to authenticate during development.",
                _STARTUP_NONCE,
            )
        app.state._token_warn_emitted = True

    provided = request.headers.get("X-Facenox-Token", "")
    if not is_valid_local_token(provided):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    return await call_next(request)


app.include_router(router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to prevent leaking details and ensure JSON response"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal Server Error",
            # Only expose detail in explicit development mode; default is safe.
            "detail": str(exc) if os.getenv("ENVIRONMENT") == "development" else None,
        },
    )


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Face Detection API is running", "status": "healthy"}


@app.get("/models")
async def get_available_models():
    """Get information about available models"""
    from core.lifespan import face_detector, liveness_detector, face_recognizer

    models_info = {}

    # Check if face_detector exists and is actually functional
    if (
        face_detector
        and hasattr(face_detector, "detector")
        and face_detector.detector is not None
    ):
        models_info["face_detector"] = {
            "available": True,
            "info": {
                "model_path": str(FACE_DETECTOR_CONFIG["model_path"]),
                "input_size": list(FACE_DETECTOR_CONFIG["input_size"]),
                "conf_threshold": getattr(
                    face_detector,
                    "score_threshold",
                    FACE_DETECTOR_CONFIG["score_threshold"],
                ),
                "nms_threshold": getattr(
                    face_detector,
                    "nms_threshold",
                    FACE_DETECTOR_CONFIG["nms_threshold"],
                ),
                "top_k": FACE_DETECTOR_CONFIG["top_k"],
                "min_face_size": getattr(
                    face_detector,
                    "min_face_size",
                    FACE_DETECTOR_CONFIG["min_face_size"],
                ),
                "edge_margin": FACE_DETECTOR_CONFIG["edge_margin"],
            },
        }
    else:
        models_info["face_detector"] = {"available": False}

    # Check if liveness_detector exists and is actually functional
    if (
        liveness_detector
        and hasattr(liveness_detector, "ort_session")
        and liveness_detector.ort_session is not None
    ):
        models_info["liveness_detector"] = {
            "available": True,
            "info": {
                "model_path": str(LIVENESS_DETECTOR_CONFIG["model_path"]),
                "pass_margin": getattr(
                    liveness_detector,
                    "pass_margin",
                    LIVENESS_DETECTOR_CONFIG["pass_margin"],
                ),
                "spoof_margin": getattr(
                    liveness_detector,
                    "spoof_margin",
                    LIVENESS_DETECTOR_CONFIG["spoof_margin"],
                ),
                "required_real_frames": LIVENESS_DETECTOR_CONFIG.get(
                    "required_real_frames", 3
                ),
            },
        }
    else:
        models_info["liveness_detector"] = {"available": False}

    # Check if face_recognizer exists and is actually functional
    if (
        face_recognizer
        and hasattr(face_recognizer, "session")
        and face_recognizer.session is not None
    ):
        models_info["face_recognizer"] = {
            "available": True,
            "info": {
                "model_path": str(FACE_RECOGNIZER_CONFIG["model_path"]),
                "input_size": list(FACE_RECOGNIZER_CONFIG["input_size"]),
                "similarity_threshold": getattr(
                    face_recognizer,
                    "similarity_threshold",
                    FACE_RECOGNIZER_CONFIG["similarity_threshold"],
                ),
                "embedding_dimension": FACE_RECOGNIZER_CONFIG["embedding_dimension"],
                "providers": FACE_RECOGNIZER_CONFIG["providers"],
            },
        }
    else:
        models_info["face_recognizer"] = {"available": False}

    models_info["face_tracker"] = {
        "available": True,
        "info": {
            "track_thresh": FACE_TRACKER_CONFIG["track_thresh"],
            "match_thresh": FACE_TRACKER_CONFIG["match_thresh"],
            "track_buffer": FACE_TRACKER_CONFIG["track_buffer"],
            "frame_rate": FACE_TRACKER_CONFIG["frame_rate"],
        },
    }

    return {"models": models_info}


if __name__ == "__main__":
    import argparse
    from database.migrate import run_migrations

    parser = argparse.ArgumentParser(description="Face Detection API Backend")
    parser.add_argument(
        "--port", type=int, default=7400, help="Port to run the server on"
    )
    parser.add_argument(
        "--host", type=str, default="127.0.0.1", help="Host to run the server on"
    )
    args = parser.parse_known_args()[0]

    run_migrations()

    from config.logging_config import get_logging_config

    logging_config = get_logging_config()

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_config=logging_config,
    )
