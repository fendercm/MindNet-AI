from ai_service import AIService
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
ai_service = AIService()
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


@app.post("/ai/generate-project/")
def generate_project():
    """Генерирует проект на основе всех навыков пользователя"""
    nodes = crud.get_all_nodes()
    skills = [n["title"] for n in nodes if n.get("node_type") == "skill"]

    if len(skills) < 2:
        return {"error": "Нужно минимум 2 навыка для генерации проекта"}

    project = ai_service.generate_project(skills)
    return project


@app.get("/ai/recommendations/")
def get_recommendations():
    """Получить рекомендации по навыкам"""
    nodes = crud.get_all_nodes()
    skills = [n["title"] for n in nodes if n.get("node_type") == "skill"]

    if len(skills) < 1:
        return {"recommendations": ["Python", "Git", "SQL"]}

    recommendations = ai_service.get_recommendations(skills)
    return {"recommendations": recommendations}