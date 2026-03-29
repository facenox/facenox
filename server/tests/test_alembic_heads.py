from alembic.config import Config
from alembic.script import ScriptDirectory

from config.paths import ALEMBIC_CONFIG_PATH, MIGRATIONS_DIR


def test_alembic_has_single_head():
    alembic_cfg = Config(str(ALEMBIC_CONFIG_PATH))
    alembic_cfg.set_main_option("script_location", str(MIGRATIONS_DIR))

    script_dir = ScriptDirectory.from_config(alembic_cfg)

    assert script_dir.get_heads() == ["c9d8e7f6a5b4"]
