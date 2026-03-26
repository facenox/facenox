import hmac
import logging
import os
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


def is_valid_local_token(provided: str) -> bool:
    expected_token = os.getenv("FACENOX_API_TOKEN")
    if not expected_token:
        return True
    return hmac.compare_digest(provided, expected_token)


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

    expected_token = os.getenv("FACENOX_API_TOKEN")
    if not expected_token:
        # Token not configured — allow but warn once
        if not getattr(app.state, "_token_warn_emitted", False):
            logger.warning(
                "FACENOX_API_TOKEN is not set. API is accessible without authentication. "
                "In production this variable is always injected by Electron."
            )
            app.state._token_warn_emitted = True
        return await call_next(request)

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
                "model_img_size": LIVENESS_DETECTOR_CONFIG["model_img_size"],
                "confidence_threshold": getattr(
                    liveness_detector,
                    "confidence_threshold",
                    LIVENESS_DETECTOR_CONFIG["confidence_threshold"],
                ),
                "bbox_inc": LIVENESS_DETECTOR_CONFIG["bbox_inc"],
                "temporal_alpha": LIVENESS_DETECTOR_CONFIG["temporal_alpha"],
                "enable_temporal_smoothing": LIVENESS_DETECTOR_CONFIG[
                    "enable_temporal_smoothing"
                ],
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
            "model_path": str(FACE_TRACKER_CONFIG["model_path"]),
            "track_thresh": FACE_TRACKER_CONFIG["track_thresh"],
            "match_thresh": FACE_TRACKER_CONFIG["match_thresh"],
            "track_buffer": FACE_TRACKER_CONFIG["track_buffer"],
            "frame_rate": FACE_TRACKER_CONFIG["frame_rate"],
        },
    }

    return {"models": models_info}


if __name__ == "__main__":
    from database.migrate import run_migrations

    run_migrations()

    from config.logging_config import get_logging_config

    logging_config = get_logging_config()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8700,
        log_config=logging_config,
    )
