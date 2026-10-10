import numpy as np
from typing import List, Dict, Optional, Tuple, Union


def normalize_embeddings_batch(embeddings: np.ndarray) -> List[np.ndarray]:
    """Normalize a batch of embeddings using vectorized operations."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms > 0, norms, 1.0)
    normalized = embeddings / norms
    return [normalized[i].astype(np.float32) for i in range(len(embeddings))]


def find_best_matches_batch(
    query_embeddings: Union[np.ndarray, List[np.ndarray]],
    database: Dict[str, np.ndarray],
    similarity_threshold: float,
    allowed_person_ids: Optional[List[str]] = None,
    prebuilt_matrix: Optional[np.ndarray] = None,
    person_index_map: Optional[List[str]] = None,
) -> List[Tuple[Optional[str], float]]:
    """Find best matching persons for a batch of query embeddings."""
    if len(query_embeddings) == 0:
        return []

    if isinstance(query_embeddings, list):
        q_matrix = np.stack(query_embeddings).astype(np.float32)
    elif query_embeddings.ndim == 1:
        q_matrix = query_embeddings[np.newaxis, :].astype(np.float32)
    else:
        q_matrix = query_embeddings.astype(np.float32)

    M = q_matrix.shape[0]

    if prebuilt_matrix is not None and person_index_map is not None:
        db_matrix = prebuilt_matrix
        person_ids = person_index_map
    else:
        if not database:
            return [(None, 0.0)] * M

        if allowed_person_ids is not None:
            filtered_db = {
                pid: emb for pid, emb in database.items() if pid in allowed_person_ids
            }
            if not filtered_db:
                return [(None, 0.0)] * M
        else:
            filtered_db = database

        person_ids = list(filtered_db.keys())
        db_matrix = np.stack(list(filtered_db.values())).astype(np.float32)

    if db_matrix.shape[0] == 0:
        return [(None, 0.0)] * M

    sims_matrix = np.dot(q_matrix, db_matrix.T)

    best_indices = np.argmax(sims_matrix, axis=1)
    best_similarities = sims_matrix[np.arange(M), best_indices]

    results: List[Tuple[Optional[str], float]] = []
    for idx, (best_col, sim) in enumerate(zip(best_indices, best_similarities)):
        sim_val = float(sim)
        if sim_val >= similarity_threshold:
            results.append((person_ids[best_col], sim_val))
        else:
            results.append((None, sim_val))

    return results


def find_best_match(
    query_embedding: np.ndarray,
    database: Dict[str, np.ndarray],
    similarity_threshold: float,
    allowed_person_ids: Optional[List[str]] = None,
    prebuilt_matrix: Optional[np.ndarray] = None,
    person_index_map: Optional[List[str]] = None,
) -> Tuple[Optional[str], float]:
    """Find best matching person in database using vectorized operations."""
    matches = find_best_matches_batch(
        query_embeddings=query_embedding,
        database=database,
        similarity_threshold=similarity_threshold,
        allowed_person_ids=allowed_person_ids,
        prebuilt_matrix=prebuilt_matrix,
        person_index_map=person_index_map,
    )
    if matches:
        return matches[0]
    return None, 0.0
