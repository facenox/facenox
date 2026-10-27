from bootstrap import ensure_database_selected


def test_bootstrap_runs_migrations_when_database_is_not_selected(monkeypatch):
    calls = []
    monkeypatch.delenv("FACENOX_ACTIVE_DB_PATH", raising=False)
    monkeypatch.setattr("database.migrate.run_migrations", lambda: calls.append(True))

    ensure_database_selected()

    assert calls == [True]


def test_bootstrap_preserves_an_existing_database_selection(monkeypatch):
    calls = []
    monkeypatch.setenv("FACENOX_ACTIVE_DB_PATH", "selected.db")
    monkeypatch.setattr("database.migrate.run_migrations", lambda: calls.append(True))

    ensure_database_selected()

    assert calls == []
