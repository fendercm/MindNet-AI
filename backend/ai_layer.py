# backend/ai_layer.py
import os
import sys
import json
from pathlib import Path
import requests
from dotenv import load_dotenv
import settings

# .env — только для разработки; собранный exe берёт ключи из настроек приложения
if not getattr(sys, "frozen", False):
    load_dotenv(Path(__file__).resolve().parent / ".env")

# Порядок по умолчанию — из тех провайдеров, для которых есть ключ
DEFAULT_ORDER = ["gemini", "openai", "deepseek", "grok", "qwen3"]


class AILayer:
    """
    Единый интерфейс к ИИ моделям.
    Приоритет: Gemini → DeepSeek → Grok → OpenAI
    Все вызовы через чистый HTTP (без SDK), с поддержкой прокси.
    """

    def __init__(self):
        settings.apply_saved()  # ключи из приложения перекрывают .env

        self.gemini_key   = os.getenv("GEMINI_API_KEY",   "")
        self.openai_key   = os.getenv("OPENAI_API_KEY",   "")
        self.deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.grok_key     = os.getenv("GROK_API_KEY",     "")
        self.hf_key       = os.getenv("HF_API_KEY",       "")

        # Порядок из настроек; если не задан — все провайдеры с ключами
        raw = os.getenv("AI_MODELS", "")
        if not raw.strip():
            raw = ",".join(m for m in DEFAULT_ORDER if self.has_key(m)) or "gemini,qwen3"
        self.model_priority = [m.strip() for m in raw.split(",") if m.strip()]

        # Отдельная сессия для AI-запросов — прокси действует только на неё
        self.session = requests.Session()

        use_proxy = os.getenv("USE_PROXY", "false").lower() == "true"
        proxy_url = os.getenv("PROXY_URL", "")

        if use_proxy and proxy_url:
            self.session.proxies = {
                "http":  proxy_url,
                "https": proxy_url,
            }
            # Локальные адреса — НЕ через прокси
            os.environ["NO_PROXY"]  = "localhost,127.0.0.1,::1"
            os.environ["no_proxy"]  = "localhost,127.0.0.1,::1"
            print(f"🔒 AI через прокси: {proxy_url}")
        else:
            print("🌐 AI без прокси")

        self.timeout = int(os.getenv("AI_TIMEOUT", "45"))
        print(f"🤖 Порядок моделей: {self.model_priority}")
        self._check_keys()

    def reload(self):
        """Перечитывает ключи и прокси после изменения настроек."""
        self.__init__()

    def has_key(self, model: str) -> bool:
        if model in ("qwen3", "llama4", "deepseek_flash"):
            return bool(self.hf_key)
        return bool(getattr(self, f"{model}_key", ""))

    @property
    def configured(self) -> bool:
        return any(self.has_key(m) for m in self.model_priority)

    def _check_keys(self):
        print(f"   Gemini:   {'✅' if self.gemini_key   else '❌'}")
        print(f"   HF (Qwen3/Llama4): {'✅' if self.hf_key else '❌'}")
        print(f"   DeepSeek: {'✅' if self.deepseek_key else '❌'}")
        print(f"   Grok:     {'✅' if self.grok_key     else '❌'}")
        print(f"   OpenAI:   {'✅' if self.openai_key   else '❌'}")

    # ──────────────────────────────────────────────
    #  GEMINI
    # ──────────────────────────────────────────────
    def _call_gemini(self, prompt: str, system: str = "") -> str:
        if not self.gemini_key:
            raise Exception("Gemini: нет API ключа")

        model   = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        full    = f"{system}\n\n{prompt}" if system else prompt
        # Ключ — в заголовке, а не в URL: иначе он попадает в тексты ошибок и логи
        url     = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": full}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096},
        }

        resp = self.session.post(
            url, json=payload, timeout=self.timeout,
            headers={"x-goog-api-key": self.gemini_key},
        )
        if resp.status_code == 429:
            raise Exception("Gemini 429: лимит запросов")
        if resp.status_code == 403:
            raise Exception("Gemini 403: регион заблокирован — нужен VPN/прокси")
        if resp.status_code in (400, 401) and "API_KEY_INVALID" in resp.text:
            raise Exception("Gemini: неверный API-ключ")
        if not resp.ok:
            raise Exception(f"Gemini {resp.status_code}: {resp.text[:300]}")

        return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

    # ──────────────────────────────────────────────
    #  OpenAI-совместимый вызов (DeepSeek, Grok, OpenAI)
    # ──────────────────────────────────────────────
    def _call_openai_compat(
        self,
        prompt:   str,
        system:   str,
        base_url: str,
        api_key:  str,
        model:    str,
        label:    str,
    ) -> str:
        if not api_key:
            raise Exception(f"{label}: нет API ключа")

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = self.session.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       model,
                "messages":    messages,
                "temperature": 0.3,
                "max_tokens":  4096,
            },
            timeout=self.timeout,
        )

        if resp.status_code == 401:
            raise Exception(f"{label} 401: неверный ключ")
        if resp.status_code == 429:
            raise Exception(f"{label} 429: лимит запросов")
        if not resp.ok:
            raise Exception(f"{label} {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()

        return resp.json()["choices"][0]["message"]["content"].strip()

    def _call_hf(self, prompt: str, system: str, model_id: str, label: str) -> str:
        """Hugging Face Inference Router (OpenAI-compatible)"""
        return self._call_openai_compat(
            prompt, system,
            base_url = "https://router.huggingface.co/v1",
            api_key  = self.hf_key,
            model    = model_id,
            label    = label,
        )

    def _call_deepseek_flash(self, prompt: str, system: str = "") -> str:
        return self._call_hf(
            prompt, system,
            model_id = os.getenv("DEEPSEEK_FLASH_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct"),
            label    = "Llama-3.1-8B",
        )

    def _call_qwen3(self, prompt: str, system: str = "") -> str:
        return self._call_hf(
            prompt, system,
            model_id = os.getenv("QWEN3_MODEL", "Qwen/Qwen2.5-72B-Instruct"),
            label    = "Qwen2.5-72B",
        )

    def _call_llama4(self, prompt: str, system: str = "") -> str:
        return self._call_hf(
            prompt, system,
            model_id = os.getenv("LLAMA4_MODEL", "meta-llama/Llama-3.3-70B-Instruct"),
            label    = "Llama-3.3-70B",
        )

    def _call_deepseek(self, prompt: str, system: str = "") -> str:
        return self._call_openai_compat(
            prompt, system,
            base_url = "https://api.deepseek.com/v1",
            api_key  = self.deepseek_key,
            model    = os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            label    = "DeepSeek",
        )

    def _call_grok(self, prompt: str, system: str = "") -> str:
        return self._call_openai_compat(
            prompt, system,
            base_url = "https://api.x.ai/v1",
            api_key  = self.grok_key,
            model    = os.getenv("GROK_MODEL", "grok-3-mini"),
            label    = "Grok",
        )

    def _call_openai(self, prompt: str, system: str = "") -> str:
        return self._call_openai_compat(
            prompt, system,
            base_url = "https://api.openai.com/v1",
            api_key  = self.openai_key,
            model    = os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            label    = "OpenAI",
        )

    # ──────────────────────────────────────────────
    #  JSON парсер
    # ──────────────────────────────────────────────
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

    # ──────────────────────────────────────────────
    #  ГЛАВНЫЙ МЕТОД
    # ──────────────────────────────────────────────
    def query(self, prompt: str, system: str = "", return_json: bool = False) -> dict:
        """
        Пробует модели по приоритету, возвращает первый успешный ответ.
        {"success": True,  "data": ..., "model": "gemini"}
        {"success": False, "error": "...", "data": None}
        """
        last_error = None

        callers = {
            "gemini":         self._call_gemini,
            "deepseek_flash": self._call_deepseek_flash,
            "qwen3":          self._call_qwen3,
            "llama4":         self._call_llama4,
            "deepseek":       self._call_deepseek,
            "grok":           self._call_grok,
            "openai":         self._call_openai,
        }

        for model in self.model_priority:
            caller = callers.get(model)
            if not caller:
                print(f"⚠️ Неизвестная модель: {model}")
                continue

            try:
                print(f"🤖 Пробуем: {model}")
                content = caller(prompt, system)

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

        return {
            "success": False,
            "error":   str(last_error) if last_error else "Все модели недоступны",
            "data":    None,
            "model":   None,
        }


ai = AILayer()
