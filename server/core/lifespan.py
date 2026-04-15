import asyncio
import logging
from contextlib import asynccontextmanager
from itertools import count

from fastapi import FastAPI
from sqlalchemy import select

from config.models import (
    FACE_DETECTOR_CONFIG,
    FACE_DETECTOR_MODEL_PATH,
    FACE_RECOGNIZER_CONFIG,
    FACE_RECOGNIZER_MODEL_PATH,
    LIVENESS_DETECTOR_CONFIG,
)
from core.models import (
    LivenessDetector,
    FaceDetector,
    FaceRecognizer,
)
from hooks import set_model_references
from startup_progress import emit_startup_progress

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


face_detector = None
liveness_detector = None
face_recognizer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global face_detector, liveness_detector, face_recognizer

    try:
        logger.info("Starting up backend server...")

        loop = asyncio.get_running_loop()
        model_progress_steps = count(3)

        def _load_face_detector():
            return FaceDetector(
                model_path=str(FACE_DETECTOR_MODEL_PATH),
                input_size=FACE_DETECTOR_CONFIG["input_size"],
                conf_threshold=FACE_DETECTOR_CONFIG["score_threshold"],
                nms_threshold=FACE_DETECTOR_CONFIG["nms_threshold"],
                top_k=FACE_DETECTOR_CONFIG["top_k"],
                min_face_size=FACE_DETECTOR_CONFIG["min_face_size"],
                edge_margin=FACE_DETECTOR_CONFIG["edge_margin"],
            )

        def _load_liveness_detector():
            return LivenessDetector(
                model_path=str(LIVENESS_DETECTOR_CONFIG["model_path"]),
                model_img_size=LIVENESS_DETECTOR_CONFIG["model_img_size"],
                confidence_threshold=LIVENESS_DETECTOR_CONFIG["confidence_threshold"],
                bbox_inc=LIVENESS_DETECTOR_CONFIG["bbox_inc"],
            )

        def _load_face_recognizer():
            return FaceRecognizer(
                model_path=str(FACE_RECOGNIZER_MODEL_PATH),
                input_size=FACE_RECOGNIZER_CONFIG["input_size"],
                similarity_threshold=FACE_RECOGNIZER_CONFIG["similarity_threshold"],
                providers=FACE_RECOGNIZER_CONFIG["providers"],
                database_path=str(FACE_RECOGNIZER_CONFIG["database_path"]),
                session_options=FACE_RECOGNIZER_CONFIG["session_options"],
            )

        async def _load_with_progress(loader, detail: str):
            result = await loop.run_in_executor(None, loader)
            emit_startup_progress(next(model_progress_steps), detail)
            return result

        # All 3 ONNX model constructors run in parallel — each calls
        # init_*_session() which is the heavyweight disk+memory operation
        face_detector, liveness_detector, face_recognizer = await asyncio.gather(
            _load_with_progress(_load_face_detector, "Face detector ready"),
            _load_with_progress(_load_liveness_detector, "Liveness model ready"),
            _load_with_progress(_load_face_recognizer, "Recognition model ready"),
        )

        # async-only step: DB migration + cache warm-up (must run after __init__)
        await face_recognizer.initialize()
        emit_startup_progress(6, "Recognition data ready")

        set_model_references(liveness_detector, None, face_recognizer, face_detector)

        from api.routes import attendance as attendance_routes

        attendance_routes.face_detector = face_detector
        attendance_routes.face_recognizer = face_recognizer

        # Run data retention purge on startup (respects configured retention policy)
        try:
            from database.session import AsyncSessionLocal
            from database.models import AttendanceSettings
            from database.repository import AttendanceRepository

            async with AsyncSessionLocal() as session:
                settings_result = await session.execute(select(AttendanceSettings))
                settings_rows = list(settings_result.scalars().all())

                if not settings_rows:
                    settings_rows = [await AttendanceRepository(session).get_settings()]

                for settings in settings_rows:
                    if settings.data_retention_days <= 0:
                        continue

                    repo = AttendanceRepository(
                        session, organization_id=settings.organization_id
                    )
                    result = await repo.cleanup_old_data(settings.data_retention_days)
                    total_deleted = result.get("records_deleted", 0) + result.get(
                        "sessions_deleted", 0
                    )
                    if total_deleted > 0:
                        logger.info(
                            "Retention purge: removed %d records and %d sessions older than %d days for org %s.",
                            result.get("records_deleted", 0),
                            result.get("sessions_deleted", 0),
                            settings.data_retention_days,
                            settings.organization_id or "<global>",
                        )
        except Exception as purge_err:
            logger.warning("Retention purge failed (non-fatal): %s", purge_err)

        logger.info("Startup complete")

    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
        raise

    yield

    logger.info("Shutting down...")
    logger.info("Shutdown complete")
