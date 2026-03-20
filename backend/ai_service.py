from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()


class AIService:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def generate_project(self, skills: list) -> dict:
        """Генерирует идею проекта на основе навыков"""

        skills_str = ", ".join(skills)

        prompt = f"""
        Ты — ментор по программированию. У студента есть следующие навыки: {skills_str}

        Придумай идею для пет-проекта, который:
        1. Задействует максимум этих навыков
        2. Реалистичен для выполнения за 1-2 недели
        3. Будет хорошим дополнением для портфолио

        Верни ответ ТОЛЬКО в JSON формате:
        {{
            "title": "Название проекта",
            "description": "Описание что делать",
            "technologies": ["технология1", "технология2"],
            "difficulty": "beginner/intermediate/advanced",
            "estimated_hours": 20
        }}
        """

        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Ты помощник для генерации идей проектов."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=500
            )

            import json
            content = response.choices[0].message.content.strip()

            # Извлекаем JSON из ответа
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            project = json.loads(content)
            return project

        except Exception as e:
            return {
                "error": str(e),
                "title": "Не удалось сгенерировать проект",
                "description": "Попробуй добавить больше навыков или проверь API ключ"
            }

    def get_recommendations(self, skills: list) -> list:
        """Рекомендует следующие навыки для изучения"""

        skills_str = ", ".join(skills)

        prompt = f"""
        У студента есть навыки: {skills_str}

        Посоветуй 3-5 навыков для изучения дальше, которые:
        1. Логично дополняют текущие знания
        2. Востребованы на рынке
        3. Помогут расти в карьере

        Верни ответ ТОЛЬКО в JSON формате массива:
        ["навык1", "навык2", "навык3"]
        """

        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Ты карьерный советник в IT."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )

            import json
            content = response.choices[0].message.content.strip()

            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            recommendations = json.loads(content)
            return recommendations

        except Exception as e:
            return ["Python", "Git", "SQL"]  # Fallback рекомендации