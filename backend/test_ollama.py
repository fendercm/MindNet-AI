import requests
import json

print("🔍 Testing Ollama...")

try:
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3.2",
            "prompt": "Privet, kak dela? Answer in English.",
            "stream": False
        },
        timeout=30
    )

    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:500]}")

except requests.exceptions.Timeout:
    print("❌ Timeout - модель слишком медленная или не отвечает")
except Exception as e:
    print(f"❌ Error: {e}")