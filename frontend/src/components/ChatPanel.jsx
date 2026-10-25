// frontend/src/components/ChatPanel.jsx
import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

const WELCOME = `Привет! Я — твой AI-ментор.

Я вижу граф твоих знаний и могу:
• подсказать, что учить дальше
• объяснить концепции и связи между технологиями
• предложить проект для практики
• разобрать твой стек по косточкам

О чём поговорим?`

/* Мини-markdown: **жирный** и `код` */
const renderInline = (text) => {
  const parts = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) parts.push(<b key={k++}>{tok.slice(2, -2)}</b>)
    else parts.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const HISTORY_KEY = 'mindnet.chat.history'
const HISTORY_LIMIT = 60

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) && list.length
      ? list
      : [{ role: 'assistant', content: WELCOME, timestamp: new Date().toISOString() }]
  } catch {
    return [{ role: 'assistant', content: WELCOME, timestamp: new Date().toISOString() }]
  }
}

const fmt = (ts) => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })

export default function ChatPanel({ onClose, onRefresh }) {
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  /* История переживает перезагрузку */
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_LIMIT)))
    } catch { /* переполнение хранилища — не критично */ }
  }, [messages])

  useEffect(() => {
    taRef.current?.focus()
  }, [])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }])
    setInput('')
    setLoading(true)

    try {
      const data = await api.aiChat(text)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.response || '…',
        timestamp: new Date().toISOString(),
        actions: data.actions || [],
      }])
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Не достучался до сервера. Убедись, что backend запущен.',
        timestamp: new Date().toISOString(),
        error: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action) => {
    if (action.type !== 'add_skill') return
    try {
      await api.aiExtractSkills(action.skill)
      onRefresh?.()
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Добавил «${action.skill}» в твой граф ✦`,
        timestamp: new Date().toISOString(),
      }])
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Не смог добавить навык — сервер или AI не отвечает.',
        timestamp: new Date().toISOString(),
        error: true,
      }])
    }
  }

  return (
    <div className="chat">
      <div className="chat__head">
        <div className="chat__avatar">🎓</div>
        <div style={{ flex: 1 }}>
          <div className="chat__name">AI-ментор</div>
          <div className="chat__status">видит твой граф</div>
        </div>
        <button
          className="icon-btn"
          title="Забыть историю"
          onClick={() => setMessages([{ role: 'assistant', content: WELCOME, timestamp: new Date().toISOString() }])}
        >⌫</button>
        <button className="icon-btn" onClick={onClose} title="Закрыть (Esc)">‹</button>
      </div>

      <div className="chat__log">
        {messages.map((msg, i) => (
          <div key={i} className={`msg msg--${msg.role === 'user' ? 'user' : msg.error ? 'err' : 'bot'}`}>
            <div className="msg__bubble">
              {renderInline(msg.content)}
              {msg.actions?.length > 0 && (
                <div className="msg__actions">
                  {msg.actions.map((action, ai) => (
                    <button key={ai} className="msg__action" onClick={() => handleAction(action)}>
                      ＋ {action.label || action.skill}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="msg__time">{fmt(msg.timestamp)}</span>
          </div>
        ))}

        {loading && (
          <div className="typing">
            <span className="typing__dot" />
            <span className="typing__dot" />
            <span className="typing__dot" />
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="chat__input-zone">
        <div className="chat__input-row">
          <textarea
            ref={taRef}
            className="chat__ta"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Спроси что угодно…"
            rows={2}
            disabled={loading}
          />
          <button
            className="chat__send"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            title="Отправить"
          >
            ↑
          </button>
        </div>
        <div className="chat__hint">Enter — отправить · Shift+Enter — новая строка</div>
      </div>
    </div>
  )
}
