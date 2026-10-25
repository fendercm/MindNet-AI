# backend/database.py
import os
import sqlite3
import sys
import threading
from pathlib import Path


def data_dir() -> Path:
    """
    Папка с данными пользователя (база, настройки).
    Electron передаёт MINDNET_DATA_DIR; в дев-режиме — backend/data.
    """
    env = os.getenv("MINDNET_DATA_DIR")
    if env:
        path = Path(env)
    elif getattr(sys, "frozen", False):
        path = Path(os.getenv("APPDATA", Path.home())) / "MindNet AI"
    else:
        path = Path(__file__).resolve().parent / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    node_type   TEXT NOT NULL DEFAULT 'skill',
    level       INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
    id            TEXT PRIMARY KEY,
    from_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    to_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'related_to',
    created_at    TEXT NOT NULL,
    UNIQUE (from_id, to_id, relation_type)
);
"""


class Database:
    """Встроенная SQLite-база: один файл в папке пользователя, ничего ставить не нужно."""

    def __init__(self):
        self.conn = None
        self.path = None
        # FastAPI гоняет sync-эндпоинты в пуле потоков — одно соединение под замком
        self._lock = threading.RLock()

    def connect(self, path=None):
        self.path = Path(path) if path else data_dir() / "mindnet.db"
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.executescript(SCHEMA)
        self.conn.commit()
        print(f"✅ База: {self.path}")

    def is_connected(self) -> bool:
        return self.conn is not None

    def query(self, sql: str, params=()):
        """Выполняет запрос в транзакции, возвращает строки как list[dict]."""
        if not self.conn:
            raise Exception("База данных не открыта")
        with self._lock:
            try:
                cur = self.conn.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]
                self.conn.commit()
                return rows
            except Exception:
                self.conn.rollback()
                raise

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None
            print("🔌 База закрыта")


db = Database()
