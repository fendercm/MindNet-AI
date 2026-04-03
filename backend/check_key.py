import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GEMINI_API_KEY")

print("🔑 Проверка ключа:")
print(f"   Длина: {len(key) if key else 0} символов")
print(f"   Начало: {key[:15] if key else 'None'}")
print(f"   Конец: {key[-10:] if key else 'None'}")
print(f"   Пробелы: {'Есть!' if key and ' ' in key else 'Нет'}")

# Тест запроса
import requests

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"

print(f"\n📡 Тест запроса...")
response = requests.post(
    url,
    json={
        "contents": [{"parts": [{"text": "Hi"}]}]
    },
    timeout=10
)

print(f"   Status: {response.status_code}")

if response.status_code == 200:
    print("   ✅ Ключ работает!")
elif response.status_code == 429:
    print("   ❌ 429 — лимит исчерпан (даже для нового ключа!)")
    print("   💡 Возможно Google блокирует по IP/аккаунту")
elif response.status_code == 403:
    print("   ❌ 403 — ключ невалидный или не активирован")
    print(f"   Ответ: {response.text[:100]}")
else:
    print(f"   ⚠️ Код {response.status_code}")
    print(f"   Ответ: {response.text[:200]}")