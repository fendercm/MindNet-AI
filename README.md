# 🧠 MindNet AI

**Внешний мозг для разработчика и студента** — интерактивная карта знаний с ИИ-аналитикой.

![status](https://img.shields.io/badge/status-MVP-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Python](https://img.shields.io/badge/Python-3.10+-green) ![React](https://img.shields.io/badge/React-18-blue) ![SQLite](https://img.shields.io/badge/SQLite-embedded-lightgrey)

![MindNet AI — карта знаний](docs/img/main.png)

## 🎯 О проекте

MindNet AI — это не просто заметки. Это **граф знаний**, который визуализирует твои навыки, технологии и учебные предметы в виде интерактивной карты-созвездия: навыки группируются по категориям, связи подписаны и расцвечены, а фон — живая туманность со звёздами.

![Чат с AI-ментором](docs/img/chat.png)

### 🔥 Ключевые возможности

- **Интерактивный граф** — узлы-созвездия по категориям, редактирование навыка кликом (название, тип, уровень, удаление)
- **ИИ-аналитик** — рекомендует, что изучать дальше
- **Генератор проектов** — предлагает пет-проекты на основе твоих навыков
- **Извлечение навыков из текста** — опиши свой опыт, AI сам разложит его на граф
- **Чат с ментором** — видит твой граф, история переживает перезапуск
- **Бэкап вселенной** — экспорт/импорт графа в JSON одним кликом (вместе со связями)
- **Без установки** — один exe: сервер и база внутри, ключи вводятся в приложении
- **Живой интерфейс** — тёмная космическая тема, сплэш-экран, горячие клавиши (`Ctrl+K` — поиск, `Esc` — закрыть панели)

## 💾 Установка (для пользователя)

1. Скачать `MindNet-AI-<версия>-win-x64.zip` и распаковать в любую папку.
2. Запустить `MindNet AI.exe`.
3. При первом запуске вставить ключ AI-провайдера — проще всего бесплатный [Google Gemini](https://aistudio.google.com/apikey).

Больше ничего ставить не нужно: Python, сервер и база данных уже внутри. Граф и настройки хранятся в `%APPDATA%\MindNet AI` и переживают обновления приложения. Ключи можно поменять в любой момент кнопкой ⚙ внизу панели.

## 🏗 Архитектура

| Слой | Технологии | Где лежит |
|---|---|---|
| Бэкенд | Python 3.10+, FastAPI, SQLite, pydantic v2; в релизе — `mindnet-backend.exe` (PyInstaller) | `backend/` |
| Фронтенд | React 18 + Vite 5, reactflow, axios | `frontend/` |
| Десктоп | Electron 28, портативная сборка | `frontend/electron-app/` |
| ИИ | мультипровайдерный слой с фолбэком (Gemini, OpenAI, Qwen/HuggingFace, DeepSeek, Grok) | `backend/ai_service.py`, `backend/ai_layer.py` |

## 🚀 Разработка

### Требования

- Python 3.10+
- Node.js 18+

### Бэкенд

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # ключи для разработки (или ввести их в окне настроек)
uvicorn main:app --reload         # http://localhost:8000, /health для проверки
```

База (`mindnet.db`) и `settings.json` в дев-режиме лежат в `backend/data/`.

### Фронтенд

```bash
cd frontend
npm install
npm run dev                       # дев-режим в браузере
npm run electron:dev              # дев-режим в Electron
```

## 🧪 Тесты и CI

```bash
cd frontend
npm test                          # vitest: парсер данных, раскладка, вьюпорт
npx eslint src                    # статический анализ

cd backend
pip install -r requirements-dev.txt
python -m pytest -q tests         # API: CRUD графа, связи, настройки
```

GitHub Actions (`.github/workflows/ci.yml`) прогоняет lint, тесты и сборку на каждый push.

## 📦 Сборка релиза (Windows)

Одной командой из корня репозитория:

```bat
build.bat
```

Скрипт собирает Vite-бандл, упаковывает бэкенд в `mindnet-backend.exe` через PyInstaller (в отдельном окружении `backend\.build-venv`) и складывает всё в `frontend\electron-app\release\MindNet AI\MindNet AI.exe` плюс архив `MindNet-AI-1.0.0-win-x64.zip` для раздачи. Python и Node.js нужны только на машине сборки. Ключи разработчика в сборку не попадают.

`build.bat --no-pause` — без пауз и окна проводника (для скриптов).

## ⚙️ Настройки

В приложении — окно ⚙ «Настройки». Для разработки те же значения можно задать в `backend/.env`; сохранённые в приложении настройки имеют приоритет.

| Переменная | Назначение |
|---|---|
| `AI_MODELS` | порядок провайдеров через запятую; пусто — все, для которых есть ключ |
| `AI_TIMEOUT` | таймаут запроса к ИИ |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Google Gemini |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI |
| `HF_API_KEY` | HuggingFace — для `qwen3` |
| `DEEPSEEK_API_KEY` / `GROK_API_KEY` | дополнительные провайдеры |
| `USE_PROXY` / `PROXY_URL` | прокси для запросов к AI |
| `MINDNET_DATA_DIR` | папка с базой и настройками |

## 🗂 Структура

```
backend/
├── main.py            # FastAPI: /nodes (CRUD), /edges, /graph, /health, /settings, /ai/*
├── crud.py            # операции над графом
├── database.py        # встроенная SQLite-база
├── settings.py        # ключи и прокси из окна настроек
├── schemas.py         # pydantic-схемы
├── ai_layer.py        # мультипровайдерный ИИ-слой с фолбэком
├── ai_service.py      # промпты: навыки, связи, проекты, рекомендации
└── tests/             # pytest
frontend/
├── src/
│   ├── components/    # GraphCanvas (канва), ChatPanel (ментор), SettingsModal
│   ├── lib/graph.js   # чистая логика: парсер, раскладка, вьюпорт (+ тесты)
│   ├── fonts/         # шрифты вшиты — приложение работает офлайн
│   └── api/client.js  # клиент API
└── electron-app/      # оболочка Electron: запускает backend.exe, сплэш
docs/img/              # скриншоты
build.bat, package.ps1 # сборка релиза в один клик
```

## 📄 Лицензия

MIT — см. [LICENSE](LICENSE).
