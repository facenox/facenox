import asyncio
import threading

from hooks import face_processing


def test_detector_timeout_keeps_native_work_locked_until_completion(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    class Detector:
        score_threshold = 0.5
        nms_threshold = 0.3
        min_face_size = 20
        calls = 0

        def set_confidence_threshold(self, value):
            self.score_threshold = value

        def set_nms_threshold(self, value):
            self.nms_threshold = value

        def set_min_face_size(self, value):
            self.min_face_size = value

        def detect_faces(self, image, enable_liveness):
            self.calls += 1
            started.set()
            release.wait(timeout=2)
            return [{"detected": True}]

    detector = Detector()
    monkeypatch.setattr(face_processing, "face_detector", detector)
    monkeypatch.setattr(face_processing, "face_detector_lock", None)
    monkeypatch.setattr(face_processing, "INFERENCE_TIMEOUT_SECONDS", 0.02)

    async def scenario():
        try:
            result = await face_processing.process_face_detection(
                None, confidence_threshold=0.9
            )
            assert result == []
            assert started.is_set()
            assert face_processing.face_detector_lock.locked()
            assert detector.score_threshold == 0.9
            assert await face_processing.process_face_detection(None) == []
            assert detector.calls == 1
        finally:
            release.set()
            for _ in range(200):
                if not face_processing.face_detector_lock.locked():
                    break
                await asyncio.sleep(0.005)
        assert not face_processing.face_detector_lock.locked()
        assert detector.score_threshold == 0.5

    asyncio.run(scenario())
