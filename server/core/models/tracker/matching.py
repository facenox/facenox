import numpy as np


def bbox_ious(atlbrs, btlbrs):
    """Compute IoU between two sets of bounding boxes"""
    atlbrs = np.ascontiguousarray(atlbrs, dtype=np.float32)
    btlbrs = np.ascontiguousarray(btlbrs, dtype=np.float32)

    # Calculate intersection
    xx1 = np.maximum(atlbrs[:, 0:1], btlbrs[:, 0])
    yy1 = np.maximum(atlbrs[:, 1:2], btlbrs[:, 1])
    xx2 = np.minimum(atlbrs[:, 2:3], btlbrs[:, 2])
    yy2 = np.minimum(atlbrs[:, 3:4], btlbrs[:, 3])

    w = np.maximum(0, xx2 - xx1)
    h = np.maximum(0, yy2 - yy1)
    intersection = w * h

    # Calculate union
    area_a = (atlbrs[:, 2] - atlbrs[:, 0]) * (atlbrs[:, 3] - atlbrs[:, 1])
    area_b = (btlbrs[:, 2] - btlbrs[:, 0]) * (btlbrs[:, 3] - btlbrs[:, 1])
    union = area_a[:, np.newaxis] + area_b - intersection

    ious = intersection / (union + 1e-6)
    return ious


def linear_assignment(cost_matrix, thresh):
    """
    Simple pure-Python linear assignment implementation.
    Gives priority to the smallest costs (greedy).
    For small matrices (attendance tracking), this is virtually identical to LAPJV
    but removes the binary 'lap' dependency.
    """
    if cost_matrix.size == 0:
        return (
            np.empty((0, 2), dtype=int),
            tuple(range(cost_matrix.shape[0])),
            tuple(range(cost_matrix.shape[1])),
        )

    matches, unmatched_a, unmatched_b = [], [], []

    # Simple greedy assignment
    # 1. Get all pairs and sort by cost
    rows, cols = cost_matrix.shape
    indices = np.where(cost_matrix <= thresh)
    potential_matches = []
    for r, c in zip(indices[0], indices[1]):
        potential_matches.append((r, c, cost_matrix[r, c]))

    # Sort by cost ascending
    potential_matches.sort(key=lambda x: x[2])

    matched_a = set()
    matched_b = set()

    for r, c, cost in potential_matches:
        if r not in matched_a and c not in matched_b:
            matched_a.add(r)
            matched_b.add(c)
            matches.append([r, c])

    unmatched_a = [r for r in range(rows) if r not in matched_a]
    unmatched_b = [c for c in range(cols) if c not in matched_b]

    return (
        np.array(matches) if matches else np.empty((0, 2), dtype=int),
        np.array(unmatched_a),
        np.array(unmatched_b),
    )


def ious(atlbrs, btlbrs):
    """
    Compute cost based on IoU
    :type atlbrs: list[tlbr] | np.ndarray
    :type atlbrs: list[tlbr] | np.ndarray

    :rtype ious np.ndarray
    """
    ious = np.zeros((len(atlbrs), len(btlbrs)), dtype=np.float32)
    if ious.size == 0:
        return ious

    ious = bbox_ious(
        np.ascontiguousarray(atlbrs, dtype=np.float32),
        np.ascontiguousarray(btlbrs, dtype=np.float32),
    )

    return ious


def iou_distance(atracks, btracks):
    """
    Compute cost based on IoU
    :type atracks: list[STrack]
    :type btracks: list[STrack]

    :rtype cost_matrix np.ndarray
    """

    if (len(atracks) > 0 and isinstance(atracks[0], np.ndarray)) or (
        len(btracks) > 0 and isinstance(btracks[0], np.ndarray)
    ):
        atlbrs = atracks
        btlbrs = btracks
    else:
        atlbrs = [track.tlbr for track in atracks]
        btlbrs = [track.tlbr for track in btracks]
    _ious = ious(atlbrs, btlbrs)
    cost_matrix = 1 - _ious

    return cost_matrix


def fuse_score(cost_matrix, detections):
    if cost_matrix.size == 0:
        return cost_matrix
    iou_sim = 1 - cost_matrix
    det_scores = np.array([det.score for det in detections])
    det_scores = np.expand_dims(det_scores, axis=0).repeat(cost_matrix.shape[0], axis=0)
    fuse_sim = iou_sim * det_scores
    fuse_cost = 1 - fuse_sim
    return fuse_cost
