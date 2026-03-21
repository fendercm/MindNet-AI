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