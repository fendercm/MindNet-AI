# backend/ai_layer.py
import os
import json
import requests
from dotenv import load_dotenv
from typing import Optional, List, Dict

# Импортируем Google Gemini
try:
    import google.generativeai as genai

    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

load_dotenv()


class AILayer:
    """Единый интерфейс к разным ИИ-моделям с fallback-логикой"""

    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.openai_key = os.getenv("OPENAI_API_KEY")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "llama3.2")

        # Настраиваем Gemini если есть ключ
        if HAS_GEMINI and self.gemini_key:
            genai.configure(api_key=self.gemini_key)
            model_names = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro']
            self.gemini_model = None
            for model_name in model_names:
                try:
                    self.gemini_model = genai.GenerativeModel(model_name)
                    print(f"✅ Gemini initialized: {model_name}")
                    break
                except Exception as e:
                    print(f"⚠️ {model_name} not available: {e}")
                    continue
        else:
            self.gemini_model = None

        # Приоритеты из .env
        primary = os.getenv("AI_PRIMARY", "gemini")
        fallbacks = os.getenv("AI_FALLBACK", "openai,ollama").split(",")
        self.model_priority = [primary] + [f for f in fallbacks if f != primary]

    def _call_gemini(self, prompt: str, system: str = "") -> str:
        """Вызов Google Gemini API через официальную библиотеку"""
        if not self.gemini_model:
            raise Exception("Gemini not configured")
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        response = self.gemini_model.generate_content(
            full_prompt,
            generation_config={"temperature": 0.7, "max_output_tokens": 2048}
        )
        return response.text

    def _call_openai(self, prompt: str, system: str = "") -> str:
        """Вызов OpenAI API"""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_key}",
            "Content-Type": "application/json"
        }
        messages = [{"role": "system", "content": system}] if system else []
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": "gpt-3.5-turbo",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2048
        }
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]

    def _call_ollama(self, prompt: str, system: str = "") -> str:
        """Запрос к локальной Ollama модели — ВНУТРИ КЛАССА!"""
        full_prompt = f"{system}\n\n{prompt}" if system else prompt

        response = requests.post(
            self.ollama_url,
            json={
                "model": self.ollama_model,
                "prompt": full_prompt,
                "stream": False,
                "options": {"temperature": 0.7, "top_p": 0.9}
            },
            timeout=120
        )

        if response.status_code == 200:
            result = response.json()
            return result.get("response", "")
        else:
            raise Exception(f"Ollama returned {response.status_code}: {response.text[:200]}")

    def query(self, prompt: str, system: str = "", return_json: bool = False) -> Dict:
        """Универсальный запрос с fallback-логикой"""
        last_error = None

        for model in self.model_priority:
            try:
                if model == "gemini" and self.gemini_model:
                    print(f"🔹 Using Gemini...")
                    content = self._call_gemini(prompt, system)

                elif model == "openai" and self.openai_key:
                    print(f"🔹 Using OpenAI...")
                    content = self._call_openai(prompt, system)

                elif model == "ollama":
                    print(f"🔹 Using Ollama (local)...")
                    content = self._call_ollama(prompt, system)

                else:
                    print(f"⚠️ Skipping {model} (not configured)")
                    continue

                # Парсинг JSON если нужно
                if return_json:
                    content = self._extract_json(content)
                    return {"success": True, "data": content, "model": model}

                return {"success": True, "data": content, "model": model}

            except Exception as e:
                print(f"⚠️ {model} failed: {e}")
                last_error = e
                continue

        # Все модели не сработали
        return {
            "success": False,
            "error": str(last_error),
            "data": None,
            "model": None
        }

    def _extract_json(self, content: str) -> Dict:
        """Извлекает JSON из ответа модели"""
        import re
        if "```json" in content:
            content = content.split("```json")[1]
        if "```" in content:
            content = content.split("```")[0]
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            content = json_match.group()
        return json.loads(content)


# Глобальный экземпляр
ai = AILayer()