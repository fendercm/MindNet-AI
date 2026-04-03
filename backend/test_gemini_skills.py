import os
from dotenv import load_dotenv
from ai_layer import ai

load_dotenv()

print("🧪 Testing Gemini with skill extraction...")

prompt = """
Я делаю телеграм-бота на Python с aiogram, FastAPI и PostgreSQL. 
Использую Docker для деплоя и Git для контроля версий.
"""

result = ai.query(
    prompt=prompt,
    system="Extract skills from text. Return JSON: {skills: [{title, level, description}]}",
    return_json=True
)

if result["success"]:
    print(f"✅ Model: {result['model']}")
    print(f"📦 Skills found: {len(result['data'].get('skills', []))}")
    for skill in result['data'].get('skills', [])[:5]:
        print(f"   • {skill.get('title')} (L{skill.get('level', '?')})")
else:
    print(f"❌ Error: {result.get('error')}")