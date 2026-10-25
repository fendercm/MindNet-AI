# backend/settings.py
"""
Настройки, которые пользователь вводит в приложении (API-ключи, прокси).
Хранятся в settings.json в папке данных и перекрывают .env.
"""
import json
import os

from database import data_dir

# имя переменной → секрет ли (секреты наружу отдаём только маской)
FIELDS = {
    "GEMINI_API_KEY":   True,
    "OPENAI_API_KEY":   True,
    "HF_API_KEY":       True,
    "DEEPSEEK_API_KEY": True,
    "GROK_API_KEY":     True,
    "AI_MODELS":        False,
    "OPENAI_MODEL":     False,
    "GEMINI_MODEL":     False,
    "USE_PROXY":        False,
    "PROXY_URL":        False,
}


def _path():
    return data_dir() / "settings.json"


def load() -> dict:
    try:
        with open(_path(), encoding="utf-8") as f:
            data = json.load(f)
        return {k: str(v) for k, v in data.items() if k in FIELDS}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def apply_saved():
    """Кладёт сохранённые настройки в окружение — их читает AILayer."""
    for key, value in load().items():
        os.environ[key] = value


def update(changes: dict) -> dict:
    """
    Сохраняет изменения. Для секретов None/отсутствие — оставить как есть,
    пустая строка — удалить ключ.
    """
    saved = load()
    for key, value in changes.items():
        if key not in FIELDS or value is None:
            continue
        saved[key] = str(value).strip()
    tmp = _path().with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(saved, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _path())
    apply_saved()
    return public_view()


def public_view() -> dict:
    """Текущие значения для UI: секреты — только факт наличия и хвост."""
    view = {}
    for key, secret in FIELDS.items():
        value = os.getenv(key, "")
        if secret:
            view[key] = {"set": bool(value), "hint": f"…{value[-4:]}" if len(value) > 8 else ""}
        else:
            view[key] = value
    return view
