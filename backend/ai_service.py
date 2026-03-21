# backend/ai_service.py
from ai_layer import ai
import json


class AIService:
    def __init__(self):
        self.ai = ai  # Используем единый слой

    def _make_json_prompt(self, instruction: str, example: dict) -> str:
        """Формирует промпт с требованием вернуть чистый JSON"""
        return f"""{instruction}

ВАЖНО: Верни ответ ТОЛЬКО в формате JSON без лишнего текста, объяснений или markdown.
Пример формата:
{json.dumps(example, ensure_ascii=False, indent=2)}
"""

    def decompose_skills(self, user_text: str) -> dict:
        """Превращает текст пользователя в дерево навыков"""

        system_prompt = """Ты — эксперт по анализу навыков разработчика.
Твоя задача: извлечь из текста навыки, определить их уровень (1-5), 
категорию, родительский навык (если есть) и связи между ними."""

        example = {
            "skills": [
                {"name": "Python", "level": 3, "category": "language", "parent": None},
                {"name": "FastAPI", "level": 2, "category": "framework", "parent": "Python"}
            ],
            "connections": [
                {"from": "FastAPI", "to": "Python", "type": "requires"}
            ],
            "gaps": [
                {"skill": "pytest", "reason": "Для тестирования API"}
            ]
        }

        prompt = self._make_json_prompt(
            f"Пользователь сказал: \"{user_text}\"\n\nИзвлеки навыки и связи.",
            example
        )

        result = self.ai.query(prompt, system_prompt, return_json=True)

        if result["success"]:
            return result["data"]
        else:
            return {
                "error": result["error"],
                "skills": [],
                "connections": [],
                "gaps": []
            }

    def suggest_connections(self, skills: list) -> list:
        """Предлагает логические связи между навыками"""

        system_prompt = """Ты — архитектор знаний. Найди логические связи между навыками."""

        skills_str = ", ".join([s["name"] for s in skills])

        example = {
            "connections": [
                {"from": "Python", "to": "FastAPI", "type": "requires"},
                {"from": "React", "to": "TypeScript", "type": "extends"}
            ]
        }

        prompt = self._make_json_prompt(
            f"Навыки: {skills_str}\n\nПредложи связи между ними.",
            example
        )

        result = self.ai.query(prompt, system_prompt, return_json=True)

        if result["success"]:
            return result["data"].get("connections", [])
        return []

    def generate_project(self, skills: list) -> dict:
        """Генерирует проект на основе навыков"""

        system_prompt = """Ты — ментор по программированию. Предлагай реалистичные пет-проекты."""

        skills_str = ", ".join([s["name"] for s in skills])

        example = {
            "title": "Telegram Bot for Task Management",
            "description": "Бот для управления задачами с интеграцией календаря",
            "technologies": ["Python", "aiogram", "SQLite", "asyncio"],
            "difficulty": "intermediate",
            "estimated_hours": 25,
            "learning_goals": ["async/await", "bot architecture", "database design"]
        }

        prompt = self._make_json_prompt(
            f"У пользователя есть навыки: {skills_str}\n\nПредложи проект.",
            example
        )

        result = self.ai.query(prompt, system_prompt, return_json=True)

        if result["success"]:
            return result["data"]
        return {
            "title": "Не удалось сгенерировать проект",
            "description": "Попробуй добавить больше навыков или проверь соединение с ИИ",
            "technologies": [],
            "difficulty": "unknown",
            "estimated_hours": 0
        }