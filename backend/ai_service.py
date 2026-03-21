# backend/ai_service.py
from ai_layer import ai
import json


class AIService:
    def __init__(self):
        self.ai = ai

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

    def suggest_connections(self, nodes: list) -> list:
        """Предлагает логические связи между навыками"""

        # Извлекаем только навыки из узлов
        skills = [n for n in nodes if n.get("node_type") == "skill"]

        if len(skills) < 2:
            return []

        # Используем title вместо name
        skills_str = ", ".join([f"{s.get('title')} (L{s.get('level', 1)})" for s in skills])

        system_prompt = """Ты — архитектор знаний. Найди логические связи между навыками разработчика.

        Типы связей:
        - requires: навык требует другой навык (FastAPI requires Python)
        - extends: навык расширяет другой (TypeScript extends JavaScript)
        - complements: навыки дополняют друг друга (React complements FastAPI)
        - used_with: навыки используются вместе (Git used_with GitHub)
        """

        example = {
            "connections": [
                {"from": "FastAPI", "to": "Python", "type": "requires"},
                {"from": "aiogram", "to": "asyncio", "type": "uses"},
                {"from": "React", "to": "JavaScript", "type": "requires"}
            ]
        }

        prompt = self._make_json_prompt(
            f"Навыки пользователя: {skills_str}\n\nПредложи логические связи между ними.",
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

    def get_recommendations(self, skills: list) -> list:
        """Рекомендует следующие навыки для изучения"""

        skills_str = ", ".join([s["name"] for s in skills])

        prompt = f"""
У студента есть навыки: {skills_str}

Посоветуй 3-5 навыков для изучения дальше.

Верни ответ ТОЛЬКО в формате JSON массива без лишнего текста:
["навык1", "навык2", "навык3"]
"""

        try:
            response = self.ai.query(prompt, "", return_json=False)

            if not response["success"]:
                return ["Python", "Git", "SQL"]

            content = response["data"]

            # Очищаем от markdown
            if "```json" in content:
                content = content.split("```json")[1]
            if "```" in content:
                content = content.split("```")[0]

            # Ищем JSON в тексте
            import re
            json_match = re.search(r'\[[\s\S]*?\]', content)
            if json_match:
                content = json_match.group()

            recommendations = json.loads(content)

            if isinstance(recommendations, list) and all(isinstance(s, str) for s in recommendations):
                return recommendations
            else:
                return ["Python", "Git", "SQL"]

        except Exception as e:
            print(f"Error in get_recommendations: {e}")
            return ["Python", "Git", "SQL"]