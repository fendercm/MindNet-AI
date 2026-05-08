# backend/crud.py
import uuid
from datetime import datetime
from database import db


def ensure_constraints():
    """Создаёт уникальный constraint на title (вызывать при старте)."""
    try:
        db.query("CREATE CONSTRAINT unique_node_title IF NOT EXISTS FOR (n:KnowledgeNode) REQUIRE n.title IS UNIQUE")
    except Exception:
        pass  # старая версия Neo4j — игнорируем


def create_node(title: str, description: str,
                node_type: str, level: int):
    """
    MERGE по title — никаких дублей.
    Если узел уже есть — обновляет level и description.
    """
    query = """
    MERGE (n:KnowledgeNode {title: $title})
    ON CREATE SET
        n.id          = $id,
        n.description = $description,
        n.node_type   = $node_type,
        n.level       = $level,
        n.created_at  = $created_at
    ON MATCH SET
        n.description = $description,
        n.node_type   = $node_type,
        n.level       = $level
    RETURN n
    """
    result = db.query(query, {
        "id":          str(uuid.uuid4()),
        "title":       title.strip(),
        "description": description,
        "node_type":   node_type,
        "level":       level,
        "created_at":  datetime.now().isoformat(),
    })
    return result[0]["n"] if result else None


def get_all_nodes():
    """Возвращает все узлы как список dict"""
    result = db.query("MATCH (n:KnowledgeNode) RETURN n")
    nodes = []
    for record in result:
        n = record["n"]
        # Neo4j Node → dict
        node_dict = dict(n)
        nodes.append(node_dict)
    return nodes


def create_edge(from_node: str, to_node: str,
                relation_type: str):
    """
    MERGE — не создаёт дубли связей.
    Ищет узлы по id.
    """
    query = """
    MATCH (a:KnowledgeNode {id: $from_id})
    MATCH (b:KnowledgeNode {id: $to_id})
    MERGE (a)-[r:RELATED_TO {relation_type: $relation_type}]->(b)
    ON CREATE SET
        r.id         = $edge_id,
        r.created_at = $created_at
    RETURN r, a.id as from_id, b.id as to_id
    """
    result = db.query(query, {
        "from_id":       from_node,
        "to_id":         to_node,
        "edge_id":       str(uuid.uuid4()),
        "relation_type": relation_type,
        "created_at":    datetime.now().isoformat(),
    })
    print(f"🔗 create_edge result: {result}")
    return result[0] if result else None


def get_all_edges():
    """Возвращает все связи как список dict"""
    query = """
    MATCH (a:KnowledgeNode)-[r:RELATED_TO]->(b:KnowledgeNode)
    RETURN
        r.id            AS id,
        a.id            AS from,
        b.id            AS to,
        r.relation_type AS relation_type
    """
    result = db.query(query)
    edges = []
    for record in result:
        edges.append({
            "id":            record["id"],
            "from":          record["from"],
            "to":            record["to"],
            "relation_type": record["relation_type"],
        })
    print(f"🔗 get_all_edges: {len(edges)} рёбер")
    return edges


def delete_all_nodes():
    """Удалить всё"""
    db.query("MATCH (n) DETACH DELETE n")
    return {"deleted": True}