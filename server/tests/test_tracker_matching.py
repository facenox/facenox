import numpy as np

from core.models.tracker.matching import linear_assignment


def test_linear_assignment_uses_global_optimum():
    cost_matrix = np.array(
        [
            [0.1, 0.1],
            [0.1, 0.2],
        ],
        dtype=np.float32,
    )

    matches, unmatched_rows, unmatched_cols = linear_assignment(cost_matrix, thresh=0.7)

    assert unmatched_rows.size == 0
    assert unmatched_cols.size == 0
    assert set(map(tuple, matches.tolist())) == {(0, 1), (1, 0)}
