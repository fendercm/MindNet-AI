from ai_service import AIService
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import db
import crud
from schemas import NodeCreate, EdgeCreate
from ai_service import AIService


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

@app.post("/ai/decompose/")
def decompose_skills(text: str):
    """Превращает текст пользователя в дерево навыков"""
    result = ai_service.decompose_skills(text)
    return result


from pydantic import BaseModel  # Добавь в импорты если нет


class TextRequest(BaseModel):
    text: str


@app.post("/ai/add-skills/")
def add_skills_from_text(request: TextRequest):
    """
    Принимает текст от пользователя, извлекает навыки и сохраняет в базу.
    """
    text = request.text  # Берём из body

    # 1. Извлекаем навыки через ИИ
    decomposition = ai_service.decompose_skills(text)

    if "error" in decomposition:
        return {"error": decomposition["error"]}

    skills = decomposition.get("skills", [])
    connections = decomposition.get("connections", [])
    gaps = decomposition.get("gaps", [])

    # 2. Сохраняем навыки в базу
    created_nodes = []
    for skill in skills:
        try:
            node = crud.create_node(
                title=skill["name"],
                description=f"{skill.get('category', 'skill')} • Level {skill.get('level', 1)}",
                node_type="skill",
                level=skill.get("level", 1)
            )
            created_nodes.append({
                "id": node.id,
                "name": skill["name"],
                "level": skill.get("level", 1)
            })
        except Exception as e:
            print(f"Error creating node {skill['name']}: {e}")

    # 3. Создаём связи
    for conn in connections:
        try:
            from_node = None
            to_node = None

            for node in created_nodes:
                if node["name"] == conn["from"]:
                    from_node = node
                if node["name"] == conn["to"]:
                    to_node = node

            if from_node and to_node:
                crud.create_edge(
                    from_node=from_node["id"],
                    to_node=to_node["id"],
                    relation_type=conn.get("type", "related_to")
                )
        except Exception as e:
            print(f"Error creating connection: {e}")

    return {
        "message": f"Added {len(created_nodes)} skills",
        "skills": created_nodes,
        "connections_count": len(connections),
        "gaps": gaps
    }
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


@app.post("/ai/suggest-connections/")
def suggest_connections():
    """ИИ предлагает связи между навыками"""
    nodes = crud.get_all_nodes()
    skills = [n["title"] for n in nodes if n.get("node_type") == "skill"]

    if len(skills) < 2:
        return {"connections": []}

    connections = ai_service.suggest_connections(skills)
    return {"connections": connections}
@app.delete("/nodes/all/")
def delete_all_nodes():
    """Удалить все узлы и связи из базы"""
    query = "MATCH (n) DETACH DELETE n"
    result = db.query(query)
    return {"message": f"Deleted all nodes and relationships", "deleted": result}


@app.post("/ai/suggest-connections/")
def suggest_connections():
    """Простые связи между навыками (без AI пока)"""
    try:
        nodes = crud.get_all_nodes()
        skills = [n for n in nodes if n.get("node_type") == "skill"]

        if len(skills) < 2:
            return {"connections": [], "message": "Нужно минимум 2 навыка"}

        # Пока создаём простые связи (первый со всеми остальными)
        created = []
        first_skill = skills[0]

        for skill in skills[1:]:
            try:
                crud.create_edge(
                    from_node=str(first_skill.get("id")),
                    to_node=str(skill.get("id")),
                    relation_type="related_to"
                )
                created.append({
                    "from": first_skill.get("title"),
                    "to": skill.get("title"),
                    "type": "related_to"
                })
                print(f"✅ Created: {first_skill.get('title')} -> {skill.get('title')}")
            except Exception as e:
                print(f"❌ Error: {e}")
                continue

        return {
            "connections": created,
            "message": f"Created {len(created)} connections"
        }

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}