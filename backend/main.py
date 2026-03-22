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
    """Получить весь граф (узлы + связи)"""
    try:
        nodes = crud.get_all_nodes()
        edges = crud.get_all_edges()  # ← ЭТО ДОЛЖНО БЫТЬ!

        print(f"📊 Returning {len(nodes)} nodes and {len(edges)} edges")

        return {
            "nodes": nodes,
            "edges": edges
        }
    except Exception as e:
        print(f"❌ Error in get_graph: {e}")
        import traceback
        traceback.print_exc()
        return {"nodes": [], "edges": []}

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



@app.delete("/nodes/all/")
def delete_all_nodes():
    """Удалить все узлы и связи из базы"""
    query = "MATCH (n) DETACH DELETE n"
    result = db.query(query)
    return {"message": f"Deleted all nodes and relationships", "deleted": result}


def _node_to_dict(node):
    """Конвертирует neo4j.graph.Node в dict"""
    # Если уже dict — возвращаем как есть
    if isinstance(node, dict):
        return node

    # neo4j.graph.Node ведёт себя как dict!
    try:
        return dict(node)
    except:
        pass

    # Если есть свойства как атрибут
    if hasattr(node, 'properties'):
        return dict(node.properties)

    # Если есть _properties (внутренний)
    if hasattr(node, '_properties'):
        return dict(node._properties)

    # Fallback: возвращаем как есть
    return node



@app.post("/ai/suggest-connections/")
def suggest_connections():
    """ИИ предлагает связи между всеми навыками пользователя"""
    print("=" * 60)
    print("🔗 suggest_connections called")

    try:
        # Получаем все узлы
        all_nodes = crud.get_all_nodes()
        print(f"📦 crud.get_all_nodes() returned: {type(all_nodes)}")

        # Извлекаем узлы из ответа
        if isinstance(all_nodes, dict) and "nodes" in all_nodes:
            nodes = all_nodes["nodes"]
        else:
            nodes = all_nodes

        print(f"   First node type: {type(nodes[0]) if nodes else 'empty'}")

        # Конвертируем Node objects в dict
        nodes = [_node_to_dict(n) for n in nodes]
        print(f"   After conversion: {type(nodes[0]) if nodes else 'empty'}")

        # Извлекаем названия навыков
        if nodes and isinstance(nodes[0], dict):
            skill_names = [n.get("title") for n in nodes if n.get("node_type") == "skill"]
            nodes_for_lookup = nodes
            print(f"✅ Extracted {len(skill_names)} skills from dicts")
        else:
            skill_names = [n for n in nodes if isinstance(n, str)]
            nodes_for_lookup = []
            print(f"✅ Using {len(skill_names)} skill names directly")

        print(f"📋 Skills: {skill_names}")

        if len(skill_names) < 2:
            return {"connections": [], "message": "Нужно минимум 2 навыка"}

        # Получаем предложения от ИИ
        print("🤖 Calling AI...")
        connections = ai_service.suggest_connections(skill_names)
        print(f" AI suggested {len(connections)} connections: {connections}")

        # Создаём связи в базе
        created = []
        print(f"\n🔨 Creating {len(connections)} edges in database...")

        for i, conn in enumerate(connections, 1):
            print(f"\n[{i}/{len(connections)}] Processing: {conn}")

            try:
                from_title = conn.get("from")
                to_title = conn.get("to")
                relation_type = conn.get("type", "related_to")

                print(f"   Looking for: '{from_title}' -> '{to_title}'")

                if nodes_for_lookup:
                    from_node = next((n for n in nodes_for_lookup if n.get("title") == from_title), None)
                    to_node = next((n for n in nodes_for_lookup if n.get("title") == to_title), None)

                    print(
                        f"   Found nodes: {from_node.get('id') if from_node else 'None'} -> {to_node.get('id') if to_node else 'None'}")

                    if from_node and to_node:
                        from_id = str(from_node.get("id"))
                        to_id = str(to_node.get("id"))

                        print(f"   Calling crud.create_edge('{from_id}', '{to_id}', '{relation_type}')")

                        edge_result = crud.create_edge(
                            from_node=from_id,
                            to_node=to_id,
                            relation_type=relation_type
                        )

                        print(f"   Edge result: {edge_result}")

                        if edge_result:
                            created.append(conn)
                            print(f"   ✅ SUCCESS: {from_title} -> {to_title}")
                        else:
                            print(f"   ⚠️ Edge result is None/Empty")
                    else:
                        print(f"   ⚠️ One or both nodes not found")
                else:
                    print(f"   ⚠️ nodes_for_lookup is empty")

            except Exception as e:
                print(f"   ❌ ERROR: {e}")
                import traceback
                traceback.print_exc()
                continue

        print(f"\n✅ Created {len(created)} out of {len(connections)} suggested connections")
        print("=" * 60)

        return {
            "connections": created if nodes_for_lookup else connections,
            "message": f"Suggested {len(connections)}, created {len(created)}",
            "created": len(created) if nodes_for_lookup else 0
        }

    except Exception as e:
        print(f"❌ Error in endpoint: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


from pydantic import BaseModel
from typing import Optional


class ChatMessage(BaseModel):
    message: str
    context: Optional[str] = None  # Дополнительный контекст от пользователя


@app.post("/ai/chat/")
def chat_with_mentor(request: ChatMessage):
    """
    Чат с ментором с контекстом графа навыков
    """
    try:
        # Получаем все навыки пользователя
        all_nodes = crud.get_all_nodes()

        # Конвертируем Node objects в dict
        nodes = [_node_to_dict(n) for n in all_nodes]

        # Извлекаем навыки
        skills = [n for n in nodes if n.get("node_type") == "skill"]
        skills_str = ", ".join([f"{s.get('title')} (L{s.get('level', 1)})" for s in skills])

        # Получаем связи
        edges = crud.get_all_edges() if hasattr(crud, 'get_all_edges') else []
        connections_str = "\n".join(
            [f"- {e.get('from_title')} → {e.get('to_title')} ({e.get('relation_type')})" for e in edges[:10]])

        # Формируем контекст
        context = f"""
У пользователя есть навыки:
{skills_str}

Связи между навыками:
{connections_str}

Пользователь спросил: {request.message}
"""

        if request.context:
            context += f"\nДополнительный контекст: {request.context}"

        system_prompt = """Ты — опытный ментор по программированию. Твоя задача:
1. Анализировать навыки пользователя
2. Давать конкретные рекомендации
3. Предлагать следующие шаги для обучения
4. Быть дружелюбным и мотивирующим

Форматируй ответ так:
- Начинай с понимания ситуации
- Давай конкретные шаги
- Предлагай ресурсы для обучения
- Заканчивай вопросом чтобы продолжить диалог
"""

        # Запрашиваем ответ от ИИ
        result = ai_service.ai.query(
            context,
            system_prompt,
            return_json=False
        )

        if result["success"]:
            response_text = result["data"]

            # Предлагаем действия (парсим ответ)
            suggested_actions = []

            if "docker" in response_text.lower() or "контейнер" in response_text.lower():
                suggested_actions.append({
                    "type": "add_skill",
                    "label": "Добавить Docker",
                    "skill": "Docker"
                })

            if "тест" in response_text.lower() or "pytest" in response_text.lower():
                suggested_actions.append({
                    "type": "add_skill",
                    "label": "Добавить pytest",
                    "skill": "pytest"
                })

            return {
                "response": response_text,
                "actions": suggested_actions,
                "context": {
                    "total_skills": len(skills),
                    "avg_level": sum(s.get('level', 1) for s in skills) / len(skills) if skills else 0
                }
            }
        else:
            return {
                "response": "Извини, произошла ошибка. Попробуй ещё раз.",
                "actions": [],
                "context": {}
            }

    except Exception as e:
        print(f"❌ Chat error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "response": f"Ошибка: {str(e)}",
            "actions": [],
            "context": {}
        }