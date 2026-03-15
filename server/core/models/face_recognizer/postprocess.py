import numpy as np
from typing import List, Dict, Optional, Tuple


def normalize_embeddings_batch(embeddings: np.ndarray) -> List[np.ndarray]:
    """
    Normalize a batch of embeddings using vectorized operations.

    Args:
        embeddings: Batch of embeddings [N, embedding_dim]

    Returns:
        List of normalized embeddings
    """
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms > 0, norms, 1.0)
    normalized = embeddings / norms
    return [normalized[i].astype(np.float32) for i in range(len(embeddings))]


def find_best_match(
    query_embedding: np.ndarray,
    database: Dict[str, np.ndarray],
    similarity_threshold: float,
    allowed_person_ids: Optional[List[str]] = None,
) -> Tuple[Optional[str], float]:
    """
    Find best matching person in database using vectorized operations.

    Args:
        query_embedding: Query embedding (normalized)
        database: Dictionary mapping person_id to embedding
        similarity_threshold: Minimum similarity threshold for recognition
        allowed_person_ids: Optional list of allowed person IDs for filtering

    Returns:
        Tuple of (best_person_id, best_similarity)
    """
    if not database:
        return None, 0.0

    # Filter by allowed person IDs if provided
    if allowed_person_ids is not None:
        filtered_db = {
            pid: emb for pid, emb in database.items() if pid in allowed_person_ids
        }
        if not filtered_db:
            return None, 0.0
    else:
        filtered_db = database

    # Extract keys and stack embeddings into a matrix
    person_ids = list(filtered_db.keys())
    db_matrix = np.stack(list(filtered_db.values()))  # Shape: (N, 512)

    # Compute cosine similarities in parallel: (1, 512) @ (512, N) -> (1, N)
    similarities = np.dot(query_embedding, db_matrix.T)

    # Find the index of the highest similarity
    best_idx = np.argmax(similarities)
    best_similarity = float(similarities[best_idx])

    # Check against threshold
    if best_similarity >= similarity_threshold:
        return person_ids[best_idx], best_similarity
    else:
        return None, best_similarity
