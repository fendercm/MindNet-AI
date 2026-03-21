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

    def suggest_connections(self, skills: list) -> list:
        """Предлагает логические связи между навыками (принимает список названий)"""

        # Если пришли словари — извлекаем названия
        if skills and isinstance(skills[0], dict):
            skill_names = [s.get("title") for s in skills if s.get("node_type") == "skill"]
        else:
            # Если пришли строки — используем как есть
            skill_names = [s for s in skills if isinstance(s, str)]

        if len(skill_names) < 2:
            return []

        skills_str = ", ".join(skill_names)

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
            connections = result["data"].get("connections", [])
            print(f"🔗 AI suggested: {connections}")
            return connections
        return []

    def generate_project(self, skills: list) -> dict:
        """Генерирует проект на основе навыков"""

        # Если skills — это список строк
        if skills and isinstance(skills[0], str):
            skills_str = ", ".join(skills)
        else:
            # Если skills — это список словарей
            skills_str = ", ".join([s.get("title", s.get("name", "")) for s in skills if isinstance(s, dict)])

        if not skills_str:
            return {
                "title": "Не удалось сгенерировать проект",
                "description": "Добавьте больше навыков",
                "technologies": [],
                "difficulty": "unknown",
                "estimated_hours": 0
            }

        system_prompt = """Ты — ментор по программированию. Предлагай реалистичные пет-проекты."""

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

        # Если skills — это список строк
        if skills and isinstance(skills[0], str):
            skills_str = ", ".join(skills)
        else:
            # Если skills — это список словарей
            skills_str = ", ".join([s.get("title", s.get("name", "")) for s in skills if isinstance(s, dict)])

        if not skills_str:
            return ["Python", "Git", "SQL"]

        system_prompt = """Ты — ментор по обучению программированию. Рекомендуй следующие навыки для изучения."""

        example = {
            "recommendations": ["Docker", "PostgreSQL", "Redis", "CI/CD", "Testing"]
        }

        prompt = self._make_json_prompt(
            f"У студента есть навыки: {skills_str}\n\nПосоветуй 3-5 навыков для изучения дальше.",
            example
        )

        result = self.ai.query(prompt, system_prompt, return_json=True)

        if result["success"]:
            recommendations = result["data"].get("recommendations", [])
            if isinstance(recommendations, list):
                return recommendations

        # Fallback
        return ["Python", "Git", "SQL"]