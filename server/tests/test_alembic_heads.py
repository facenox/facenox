from alembic.config import Config
from alembic.script import ScriptDirectory

from config.paths import ALEMBIC_CONFIG_PATH, MIGRATIONS_DIR


def test_alembic_has_single_head():
    alembic_cfg = Config(str(ALEMBIC_CONFIG_PATH))
    alembic_cfg.set_main_option("script_location", str(MIGRATIONS_DIR))

    script_dir = ScriptDirectory.from_config(alembic_cfg)

    heads = script_dir.get_heads()
    assert len(heads) == 1, f"Expected a single migration head, found: {heads}"
    assert heads == ["g1h2i3j4k5l6"]
