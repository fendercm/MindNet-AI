from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import db
import crud
from schemas import NodeCreate, EdgeCreate

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.connect()
    yield
    db.close()

app = FastAPI(title="MindNet AI API", lifespan=lifespan)

# Упрощённые CORS настройки
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем все источники (для разработки)
    allow_credentials=True,
    allow_methods=["*"],  # Разрешаем все методы
    allow_headers=["*"],  # Разрешаем все заголовки
)

@app.get("/")
def read_root():
    return {"status": "MindNet AI API is running 🚀"}


@app.post("/nodes/")
def create_node(node: NodeCreate):
    result = crud.create_node(
        node.title,
        node.description,
        node.node_type,
        node.level
    )
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create node")
    return result


@app.get("/nodes/")
def list_nodes():
    return crud.get_all_nodes()


@app.post("/edges/")
def create_edge(edge: EdgeCreate):
    result = crud.create_edge(
        edge.from_node,
        edge.to_node,
        edge.relation_type
    )
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create edge")
    return result


@app.get("/graph/")
def get_graph():
    nodes = crud.get_all_nodes()
    edges_data = crud.get_all_edges()

    edges = []
    for record in edges_data:
        edges.append({
            "id": record["r"]["id"],
            "from": record["a"]["id"],
            "to": record["b"]["id"],
            "relation_type": record["r"]["relation_type"]
        })

    return {"nodes": nodes, "edges": edges}