from pydantic import BaseModel
from typing import Optional

class NodeCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    node_type: str = "skill"
    level: int = 1

class EdgeCreate(BaseModel):
    from_node: str
    to_node: str
    relation_type: str = "related_to"
class NodeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    node_type: Optional[str] = None
    level: Optional[int] = None
