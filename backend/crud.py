# backend/crud.py
import uuid
from datetime import datetime
from database import db

NODE_FIELDS = "id, title, description, node_type, level, created_at"


def ensure_constraints():
    """Схема и ограничения создаются в db.connect() — оставлено для совместимости."""


def create_node(title: str, description: str,
                node_type: str, level: int):
    """
    Upsert по title — никаких дублей.
    Если узел уже есть — обновляет level, description и тип.
    """
    title = title.strip()
    db.query(
        """
        INSERT INTO nodes (id, title, description, node_type, level, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(title) DO UPDATE SET
            description = excluded.description,
            node_type   = excluded.node_type,
            level       = excluded.level
        """,
        (str(uuid.uuid4()), title, description or "", node_type, level,
         datetime.now().isoformat()),
    )
    rows = db.query(f"SELECT {NODE_FIELDS} FROM nodes WHERE title = ?", (title,))
    return rows[0] if rows else None


def get_all_nodes():
    """Возвращает все узлы как список dict"""
    return db.query(f"SELECT {NODE_FIELDS} FROM nodes ORDER BY created_at")


def create_edge(from_node: str, to_node: str,
                relation_type: str):
    """
    Не создаёт дубли связей. Ищет узлы по id.
    Возвращает связь или None, если одного из узлов нет.
    """
    found = db.query("SELECT id FROM nodes WHERE id IN (?, ?)", (from_node, to_node))
    if len({r["id"] for r in found}) < len({from_node, to_node}):
        return None
    db.query(
        """
        INSERT OR IGNORE INTO edges (id, from_id, to_id, relation_type, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), from_node, to_node, relation_type,
         datetime.now().isoformat()),
    )
    rows = db.query(
        """
        SELECT id, from_id AS "from", to_id AS "to", relation_type
        FROM edges WHERE from_id = ? AND to_id = ? AND relation_type = ?
        """,
        (from_node, to_node, relation_type),
    )
    return rows[0] if rows else None


def get_all_edges():
    """Возвращает все связи как список dict"""
    return db.query(
        """
        SELECT e.id, e.from_id AS "from", e.to_id AS "to", e.relation_type,
               a.title AS from_title, b.title AS to_title
        FROM edges e
        JOIN nodes a ON a.id = e.from_id
        JOIN nodes b ON b.id = e.to_id
        ORDER BY e.created_at
        """
    )


def delete_all_nodes():
    """Удалить всё"""
    db.query("DELETE FROM edges")
    db.query("DELETE FROM nodes")
    return {"deleted": True}


def update_node(node_id: str, title: str = None, description: str = None,
                node_type: str = None, level: int = None):
    """Обновляет поля узла по id (только переданные)"""
    fields = {
        "title":       title.strip() if title is not None else None,
        "description": description,
        "node_type":   node_type,
        "level":       level,
    }
    sets = {k: v for k, v in fields.items() if v is not None}
    if sets:
        assignments = ", ".join(f"{k} = ?" for k in sets)
        db.query(f"UPDATE nodes SET {assignments} WHERE id = ?", (*sets.values(), node_id))
    return get_node(node_id)


def get_node(node_id: str):
    """Возвращает один узел по id или None"""
    rows = db.query(f"SELECT {NODE_FIELDS} FROM nodes WHERE id = ?", (node_id,))
    return rows[0] if rows else None


def delete_node(node_id: str):
    """Удаляет узел и все его связи. Возвращает факт удаления."""
    if not get_node(node_id):
        return False
    db.query("DELETE FROM nodes WHERE id = ?", (node_id,))
    return True
