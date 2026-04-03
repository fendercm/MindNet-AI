# backend/ai_layer.py
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

class AILayer:
    """
    Единый интерфейс к ИИ моделям.
    Gemini и OpenAI — через requests + прокси (для РФ).
    Без SDK библиотек — только чистый HTTP.
    """

    def __init__(self):
        self.gemini_key  = os.getenv("GEMINI_API_KEY", "")
        self.openai_key  = os.getenv("OPENAI_API_KEY", "")

        # Порядок моделей из .env
        primary  = os.getenv("AI_PRIMARY",  "gemini")
        fallback = os.getenv("AI_FALLBACK", "openai")
        self.model_priority = []
        for m in [primary, fallback]:
            if m and m not in self.model_priority:
                self.model_priority.append(m)

        # --- Сессия ТОЛЬКО для AI запросов ---
        # Neo4j driver не использует эту сессию → конфликта нет
        self.session = requests.Session()

        use_proxy = os.getenv("USE_PROXY", "false").lower() == "true"
        proxy_url = os.getenv("PROXY_URL", "")

        if use_proxy and proxy_url:
            self.session.proxies = {
                "http":  proxy_url,
                "https": proxy_url,
            }
            # Локальные адреса НЕ через прокси (Neo4j, Ollama)
            os.environ["NO_PROXY"] = "localhost,127.0.0.1,::1"
            print(f"🔒 AI через прокси: {proxy_url}")
        else:
            print("🌐 AI без прокси (используй Groq или VPN)")

        self.timeout = int(os.getenv("AI_TIMEOUT", "30"))

        print(f"🤖 Порядок моделей: {self.model_priority}")
        self._check_keys()

    def _check_keys(self):
        """Выводит статус ключей при старте"""
        print(f"   Gemini:  {'✅' if self.gemini_key  else '❌ нет ключа'}")
        print(f"   OpenAI:  {'✅' if self.openai_key  else '❌ нет ключа'}")

    # ─────────────────────────────────────────
    #  GEMINI  (через чистый HTTP, не SDK)
    # ─────────────────────────────────────────
    def _call_gemini(self, prompt: str, system: str = "") -> str:
        if not self.gemini_key:
            raise Exception("Gemini: нет API ключа")

        full_prompt = f"{system}\n\n{prompt}" if system else prompt

        url = (
            "https://generativelanguage.googleapis.com"
            "/v1beta/models/gemini-2.0-flash"
            f":generateContent?key={self.gemini_key}"
        )

        payload = {
            "contents": [
                {"parts": [{"text": full_prompt}]}
            ],
            "generationConfig": {
                "temperature":     0.3,
                "maxOutputTokens": 2048,
            }
        }

        resp = self.session.post(url, json=payload, timeout=self.timeout)

        if resp.status_code == 429:
            raise Exception("Gemini 429: лимит запросов")
        if resp.status_code == 403:
            raise Exception("Gemini 403: нет доступа — включи VPN/прокси")

        resp.raise_for_status()

        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    # ─────────────────────────────────────────
    #  OPENAI
    # ─────────────────────────────────────────
    def _call_openai(self, prompt: str, system: str = "") -> str:
        if not self.openai_key:
            raise Exception("OpenAI: нет API ключа")

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = self.session.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.openai_key}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                "messages":    messages,
                "temperature": 0.3,
                "max_tokens":  2048,
            },
            timeout=self.timeout,
        )

        if resp.status_code == 401:
            raise Exception("OpenAI 401: неверный ключ")
        if resp.status_code == 429:
            raise Exception("OpenAI 429: лимит или нет баланса")

        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()

    # ─────────────────────────────────────────
    #  JSON парсер
    # ─────────────────────────────────────────
    def _extract_json(self, content: str) -> dict:
        if not content or not isinstance(content, str):
            return {}

        text = content

        # Убираем markdown ```json ... ```
        if "```json" in text:
            start = text.find("```json") + 7
            end   = text.find("```", start)
            text  = text[start:end].strip()
        elif "```" in text:
            start = text.find("```") + 3
            end   = text.find("```", start)
            text  = text[start:end].strip()

        # Ищем первый JSON объект или массив
        for open_c, close_c in [('{', '}'), ('[', ']')]:
            start = text.find(open_c)
            end   = text.rfind(close_c)
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(text[start:end + 1])
                except json.JSONDecodeError:
                    continue

        print(f"⚠️ JSON не найден в ответе: {content[:300]}")
        return {}

    # ─────────────────────────────────────────
    #  ГЛАВНЫЙ МЕТОД
    # ─────────────────────────────────────────
    def query(
        self,
        prompt:      str,
        system:      str  = "",
        return_json: bool = False,
    ) -> dict:
        """
        Возвращает:
          {"success": True,  "data": ..., "model": "gemini"}
          {"success": False, "error": "...", "data": None}
        """
        last_error = None

        for model in self.model_priority:
            try:
                print(f"🤖 Пробуем: {model}")

                if model == "gemini":
                    content = self._call_gemini(prompt, system)
                elif model == "openai":
                    content = self._call_openai(prompt, system)
                else:
                    print(f"⚠️ Неизвестная модель: {model}")
                    continue

                # Успех
                if return_json:
                    parsed = self._extract_json(content)
                    if not parsed:
                        print(f"⚠️ {model}: JSON пустой, пробуем следующую")
                        continue
                    return {"success": True, "data": parsed, "model": model}

                return {"success": True, "data": content, "model": model}

            except Exception as e:
                print(f"❌ {model} ошибка: {e}")
                last_error = e
                continue

        # Все модели упали
        return {
            "success": False,
            "error":   str(last_error) if last_error else "Все модели недоступны",
            "data":    None,
            "model":   None,
        }


# Глобальный экземпляр
ai = AILayer()