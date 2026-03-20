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
    query = """
    MATCH (a:KnowledgeNode {id: $from_node})
    MATCH (b:KnowledgeNode {id: $to_node})
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
    return result[0]["r"] if result else None

def get_all_edges():
    query = """
    MATCH (a:KnowledgeNode)-[r:RELATED_TO]->(b:KnowledgeNode)
    RETURN a, r, b
    """
    return db.query(query)