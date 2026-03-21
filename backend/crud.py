from database import db
from datetime import datetime
import uuid

def create_node(title, description, node_type, level):
    node_id = str(uuid.uuid4())
    query = """
    CREATE (n:KnowledgeNode {
        id: $id,
        title: $title,
        description: $description,
        node_type: $node_type,
        level: $level,
        created_at: $created_at
    })
    RETURN n
    """
    result = db.query(query, {
        "id": node_id,
        "title": title,
        "description": description,
        "node_type": node_type,
        "level": level,
        "created_at": datetime.now().isoformat()
    })
    return result[0]["n"] if result else None

def get_all_nodes():
    query = "MATCH (n:KnowledgeNode) RETURN n"
    result = db.query(query)
    return [record["n"] for record in result]


def create_edge(from_node, to_node, relation_type):
    edge_id = str(uuid.uuid4())

    # Пробуем разные варианты меток
    query = """
    MATCH (a {id: $from_node})
    MATCH (b {id: $to_node})
    CREATE (a)-[r:RELATED_TO {
        id: $id,
        relation_type: $relation_type,
        created_at: $created_at
    }]->(b)
    RETURN r
    """

    result = db.query(query, {
        "id": edge_id,
        "from_node": from_node,
        "to_node": to_node,
        "relation_type": relation_type,
        "created_at": datetime.now().isoformat()
    })

    print(f"🔗 create_edge result: {result}")
    return result[0]["r"] if result else None
def get_all_edges():
    query = """
    MATCH (a:KnowledgeNode)-[r:RELATED_TO]->(b:KnowledgeNode)
    RETURN a, r, b
    """
    return db.query(query)
def delete_all_nodes():
    """Удалить все узлы и связи"""
    query = "MATCH (n) DETACH DELETE n"
    return db.query(query)


def get_all_edges():
    """Получить все связи"""
    query = """
    MATCH (a:KnowledgeNode)-[r:RELATED_TO]->(b:KnowledgeNode)
    RETURN 
        a.id as from_id,
        a.title as from_title,
        b.id as to_id,
        b.title as to_title,
        r.relation_type as relation_type,
        r.id as edge_id
    """
    result = db.query(query, {})

    return [
        {
            "from_id": record["from_id"],
            "from_title": record["from_title"],
            "to_id": record["to_id"],
            "to_title": record["to_title"],
            "relation_type": record["relation_type"],
            "edge_id": record["edge_id"]
        }
        for record in result
    ]