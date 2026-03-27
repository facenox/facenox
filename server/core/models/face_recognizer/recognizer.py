import asyncio
import logging
import time
from typing import List, Dict, Tuple, Optional, Any

import numpy as np

from database.face import FaceDatabaseManager
from .session_utils import init_face_recognizer_session
from .preprocess import (
    align_faces_batch,
    preprocess_batch,
)
from .postprocess import (
    normalize_embeddings_batch,
    find_best_match,
)

logger = logging.getLogger(__name__)


class FaceRecognizer:
    def __init__(
        self,
        model_path: str,
        input_size: Tuple[int, int],
        similarity_threshold: float,
        providers: Optional[List[str]],
        database_path: Optional[str],
        session_options: Optional[Dict[str, Any]],
    ):
        self.model_path = model_path
        self.input_size = input_size
        self.similarity_threshold = similarity_threshold
        self.providers = providers or ["CPUExecutionProvider"]
        self.database_path = database_path

        self.INPUT_MEAN = 127.5
        self.INPUT_STD = 127.5

        self.session, self.input_name = init_face_recognizer_session(
            model_path, self.providers, session_options
        )

        if self.database_path:
            if self.database_path.endswith(".json"):
                self.sqlite_path = self.database_path.replace(".json", ".db")
            else:
                self.sqlite_path = self.database_path

            self.db_manager = FaceDatabaseManager(self.sqlite_path)
        else:
            self.sqlite_path = None
            self.db_manager = None
            logger.warning("No database path provided, running without persistence")

        self._db_managers: Dict[str, FaceDatabaseManager] = {}
        self._persons_cache: Dict[str, Dict[str, np.ndarray]] = {}
        self._cache_timestamp: Dict[str, float] = {}
        self._cache_ttl = (
            60.0  # Increased from 1.0 to reduce DB load during recognition
        )

    async def initialize(self):
        """Initialize the recognizer: migrate legacy data and load cache"""
        if self.db_manager:
            success, message = await self.db_manager.migrate_legacy_data()
            if success:
                logger.info(message)
            await self._refresh_cache()

    @staticmethod
    def _cache_key(organization_id: Optional[str]) -> str:
        return organization_id or "__global__"

    def _get_db_manager(
        self, organization_id: Optional[str] = None
    ) -> Optional[FaceDatabaseManager]:
        if self.sqlite_path is None:
            return None

        if organization_id is None:
            return self.db_manager

        cache_key = self._cache_key(organization_id)
        manager = self._db_managers.get(cache_key)
        if manager is None:
            manager = FaceDatabaseManager(
                self.sqlite_path, organization_id=organization_id
            )
            self._db_managers[cache_key] = manager
        return manager

    async def _extract_embeddings(
        self, image: np.ndarray, face_data_list: List[Dict]
    ) -> List[np.ndarray]:
        """
        Extract embeddings for faces using batch processing.

        Args:
            image: Input image (BGR format)
            face_data_list: List of face data dicts with 'landmarks_5' key

        Returns:
            List of normalized embeddings
        """
        if not face_data_list:
            return []

        aligned_faces = align_faces_batch(image, face_data_list, self.input_size)

        if not aligned_faces:
            return []

        batch_input = preprocess_batch(aligned_faces, self.INPUT_MEAN, self.INPUT_STD)

        feeds = {self.input_name: batch_input}

        # Offload blocking ONNX inference to a background thread
        loop = asyncio.get_running_loop()
        outputs = await loop.run_in_executor(
            None, lambda: self.session.run(None, feeds)
        )
        embeddings = outputs[0]

        return normalize_embeddings_batch(embeddings)

    async def _get_database(
        self, organization_id: Optional[str] = None
    ) -> Dict[str, np.ndarray]:
        """
        Get person database with caching.

        Returns:
            Dictionary mapping person_id to embedding
        """
        current_time = time.time()

        cache_key = self._cache_key(organization_id)
        cache_timestamp = self._cache_timestamp.get(cache_key, 0)
        if (
            cache_key not in self._persons_cache
            or (current_time - cache_timestamp) > self._cache_ttl
        ):
            db_manager = self._get_db_manager(organization_id)
            if db_manager:
                self._persons_cache[cache_key] = await db_manager.get_all_persons()
            else:
                self._persons_cache[cache_key] = {}
            self._cache_timestamp[cache_key] = current_time

        return self._persons_cache[cache_key]

    async def _find_best_match(
        self,
        embedding: np.ndarray,
        allowed_person_ids: Optional[List[str]] = None,
        organization_id: Optional[str] = None,
    ) -> Tuple[Optional[str], float]:
        """
        Find best matching person using cached database.

        Uses Postprocessing Layer for similarity matching.
        """
        if not self._get_db_manager(organization_id):
            return None, 0.0

        database = await self._get_database(organization_id)

        if not database:
            return None, 0.0

        return find_best_match(
            embedding, database, self.similarity_threshold, allowed_person_ids
        )

    async def _refresh_cache(self, organization_id: Optional[str] = None):
        """Refresh cache after database modifications"""
        cache_key = self._cache_key(organization_id)
        db_manager = self._get_db_manager(organization_id)
        if db_manager:
            self._persons_cache[cache_key] = await db_manager.get_all_persons()
            self._cache_timestamp[cache_key] = time.time()
        else:
            self._persons_cache.pop(cache_key, None)
            self._cache_timestamp.pop(cache_key, None)

    async def export_embeddings(
        self, organization_id: Optional[str] = None
    ) -> Dict[str, np.ndarray]:
        """Return decrypted embeddings for the requested org scope."""
        return await self._get_database(organization_id)

    async def refresh_cache(self, organization_id: Optional[str] = None):
        await self._refresh_cache(organization_id)

    async def recognize_face(
        self,
        image: np.ndarray,
        landmarks_5: List,
        allowed_person_ids: Optional[List[str]] = None,
        organization_id: Optional[str] = None,
    ) -> Dict:
        try:
            face_data = [{"landmarks_5": landmarks_5}]
            embeddings = await self._extract_embeddings(image, face_data)

            if not embeddings:
                return {
                    "person_id": None,
                    "similarity": 0.0,
                    "success": False,
                    "error": "Failed to extract embedding",
                }

            embedding = embeddings[0]
            person_id, similarity = await self._find_best_match(
                embedding, allowed_person_ids, organization_id
            )

            result = {
                "person_id": person_id,
                "similarity": similarity,
                "success": person_id is not None,
            }

            return result

        except Exception as e:
            logger.error(f"Face recognition error: {e}")
            return {
                "person_id": None,
                "similarity": 0.0,
                "success": False,
                "error": str(e),
            }

    async def recognize_faces(
        self,
        image: np.ndarray,
        faces: List[Dict],
        allowed_person_ids: Optional[List[str]] = None,
        organization_id: Optional[str] = None,
    ) -> List[Dict]:
        try:
            if not faces:
                return []

            embeddings = await self._extract_embeddings(image, faces)
            if len(embeddings) != len(faces):
                raise ValueError("Failed to extract embeddings for all faces")

            results: List[Dict] = []
            for embedding in embeddings:
                person_id, similarity = await self._find_best_match(
                    embedding, allowed_person_ids, organization_id
                )
                results.append(
                    {
                        "person_id": person_id,
                        "similarity": similarity,
                        "success": person_id is not None,
                    }
                )
            return results
        except Exception as e:
            logger.error(f"Face batch recognition error: {e}")
            return [
                {
                    "person_id": None,
                    "similarity": 0.0,
                    "success": False,
                    "error": str(e),
                }
                for _ in faces
            ]

    async def register_person(
        self,
        person_id: str,
        image: np.ndarray,
        landmarks_5: List,
        organization_id: Optional[str] = None,
    ) -> Dict:
        try:
            face_data = [{"landmarks_5": landmarks_5}]
            embeddings = await self._extract_embeddings(image, face_data)

            if not embeddings:
                return {
                    "success": False,
                    "error": "Failed to extract embedding",
                    "person_id": person_id,
                }

            embedding = embeddings[0]

            db_manager = self._get_db_manager(organization_id)
            if db_manager:
                from utils.image_utils import calculate_image_hash

                image_hash = calculate_image_hash(image)
                save_success = await db_manager.add_person(
                    person_id, embedding, image_hash
                )
                stats = await db_manager.get_stats()
                total_persons = stats.get("total_persons", 0)
                await self._refresh_cache(organization_id)
            else:
                save_success = False
                total_persons = 0
                logger.warning("No database manager available for registration")

            return {
                "success": True,
                "person_id": person_id,
                "database_saved": save_success,
                "total_persons": total_persons,
            }

        except Exception as e:
            logger.error(f"Person registration failed: {e}")
            return {"success": False, "error": str(e), "person_id": person_id}

    async def remove_person(
        self, person_id: str, organization_id: Optional[str] = None
    ) -> Dict:
        """Remove a person from the database"""
        try:
            db_manager = self._get_db_manager(organization_id)
            if db_manager:
                remove_success = await db_manager.remove_person(person_id)

                if remove_success:
                    await self._refresh_cache(organization_id)
                    stats = await db_manager.get_stats()
                    total_persons = stats.get("total_persons", 0)

                    return {
                        "success": True,
                        "person_id": person_id,
                        "database_saved": True,
                        "total_persons": total_persons,
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Person {person_id} not found in database",
                        "person_id": person_id,
                    }
            else:
                return {
                    "success": False,
                    "error": "No database manager available",
                    "person_id": person_id,
                }

        except Exception as e:
            logger.error(f"Person removal failed: {e}")
            return {"success": False, "error": str(e), "person_id": person_id}

    async def get_all_persons(self, organization_id: Optional[str] = None) -> List[str]:
        """Get list of all registered person IDs"""
        db_manager = self._get_db_manager(organization_id)
        if db_manager:
            all_persons = await db_manager.get_all_persons()
            return list(all_persons.keys())
        return []

    async def update_person_id(
        self,
        old_person_id: str,
        new_person_id: str,
        organization_id: Optional[str] = None,
    ) -> Dict:
        """Update a person's ID in the database"""
        try:
            db_manager = self._get_db_manager(organization_id)
            if db_manager:
                updated_count = await db_manager.update_person_id(
                    old_person_id, new_person_id
                )
                if updated_count > 0:
                    await self._refresh_cache(organization_id)
                    return {
                        "success": True,
                        "message": f"Person '{old_person_id}' renamed to '{new_person_id}' successfully",
                        "updated_records": updated_count,
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Person '{old_person_id}' not found or '{new_person_id}' already exists",
                        "updated_records": 0,
                    }
            else:
                return {
                    "success": False,
                    "error": "No database manager available",
                    "updated_records": 0,
                }

        except Exception as e:
            logger.error(f"Person update failed: {e}")
            return {"success": False, "error": str(e), "updated_records": 0}

    async def get_stats(self, organization_id: Optional[str] = None) -> Dict:
        """Get face recognition statistics"""
        total_persons = 0
        persons = []

        db_manager = self._get_db_manager(organization_id)
        if db_manager:
            stats = await db_manager.get_stats()
            total_persons = stats.get("total_persons", 0)
            persons = await db_manager.get_all_persons_with_details()

        return {"total_persons": total_persons, "persons": persons}

    def set_similarity_threshold(self, threshold: float):
        """Update similarity threshold for recognition"""
        self.similarity_threshold = threshold

    async def clear_database(self, organization_id: Optional[str] = None) -> Dict:
        """Clear all persons from the database"""
        try:
            db_manager = self._get_db_manager(organization_id)
            if db_manager:
                clear_success = await db_manager.clear_database()

                if clear_success:
                    await self._refresh_cache(organization_id)
                    return {"success": True, "database_saved": True, "total_persons": 0}
                else:
                    return {"success": False, "error": "Failed to clear database"}
            else:
                return {"success": False, "error": "No database manager available"}

        except Exception as e:
            logger.error(f"Database clearing failed: {e}")
            return {"success": False, "error": str(e)}

    def _invalidate_cache(self, organization_id: Optional[str] = None):
        """Invalidate cache without refreshing"""
        if organization_id is None:
            self._persons_cache.clear()
            self._cache_timestamp.clear()
            return

        cache_key = self._cache_key(organization_id)
        self._persons_cache.pop(cache_key, None)
        self._cache_timestamp.pop(cache_key, None)

    def invalidate_cache(self, organization_id: Optional[str] = None):
        self._invalidate_cache(organization_id)
