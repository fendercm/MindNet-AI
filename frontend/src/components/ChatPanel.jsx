// frontend/src/components/ChatPanel.jsx
import React, { useState, useRef, useEffect } from 'react'

const API_BASE = 'http://localhost:8000'

const WELCOME = `Привет! Я твой AI-ментор по программированию.

Я вижу твой граф навыков и могу помочь:
• Подсказать что учить дальше
• Объяснить концепции и связи между технологиями
• Предложить проекты для практики
• Разобрать твой стек

Что тебя интересует?`

export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME, timestamp: new Date() },
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()

    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }])
    setInput('')
    setLoading(true)

    try {
      const resp = await fetch(`${API_BASE}/ai/chat/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
      })
      const data = await resp.json()

      setMessages(prev => [...prev, {
        role:      'assistant',
        content:   data.response,
        timestamp: new Date(),
        actions:   data.actions || [],
        context:   data.context,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role:      'assistant',
        content:   'Ошибка соединения с сервером. Убедись что backend запущен.',
        timestamp: new Date(),
        error:     true,
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action) => {
    if (action.type !== 'add_skill') return
    try {
      await fetch(`${API_BASE}/ai/add-skills/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: action.skill }),
      })
      window.location.reload()
    } catch {
      console.error('Error adding skill')
    }
  }

  const fmt = (date) => date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      position:   'fixed',
      right:      0, top: 0, bottom: 0,
      width:      400,
      background: '#0a0a1a',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      display:    'flex',
      flexDirection: 'column',
      zIndex:     2000,
      boxShadow:  '-8px 0 32px rgba(0,0,0,0.5)',
    }}>

      {/* Шапка */}
      <div style={{
        padding:    '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>
          🎓
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>AI Ментор</div>
          <div style={{ fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
            Онлайн
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            color: '#475569', fontSize: 20, cursor: 'pointer',
            padding: '2px 6px', borderRadius: 6,
          }}
        >×</button>
      </div>

      {/* Сообщения */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display:       'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              gap:           8,
              alignItems:    'flex-end',
            }}
          >
            {/* Аватар */}
            {msg.role === 'assistant' && (
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, flexShrink: 0,
              }}>🎓</div>
            )}

            <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 3,
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                padding:      '10px 13px',
                borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                background:   msg.role === 'user'
                  ? 'rgba(167,139,250,0.15)'
                  : msg.error ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                border:       `1px solid ${
                  msg.role === 'user' ? 'rgba(167,139,250,0.3)'
                  : msg.error ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                color:        msg.role === 'user' ? '#c4b5fd' : msg.error ? '#f87171' : '#e2e8f0',
                fontSize:     13,
                lineHeight:   1.6,
                whiteSpace:   'pre-wrap',
                wordBreak:    'break-word',
              }}>
                {msg.content}

                {/* Действия */}
                {msg.actions?.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {msg.actions.map((action, ai) => (
                      <button
                        key={ai}
                        onClick={() => handleAction(action)}
                        style={{
                          padding: '6px 10px',
                          background: 'rgba(74,222,128,0.1)',
                          border: '1px solid rgba(74,222,128,0.3)',
                          borderRadius: 6,
                          color: '#4ade80',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        + {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span style={{ fontSize: 10, color: '#334155', paddingLeft: msg.role === 'user' ? 0 : 4 }}>
                {fmt(msg.timestamp)}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
            }}>🎓</div>
            <div style={{
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '3px 12px 12px 12px',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#a78bfa',
                  animation: `dot .9s ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Поле ввода */}
      <div style={{
        padding:    '12px 14px',
        borderTop:  '1px solid rgba(255,255,255,0.06)',
        background: '#080814',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Задай вопрос... (Enter — отправить, Shift+Enter — перенос)"
            rows={2}
            disabled={loading}
            style={{
              flex:         1,
              padding:      '9px 12px',
              background:   'rgba(255,255,255,0.04)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              color:        '#e2e8f0',
              fontSize:     13,
              resize:       'none',
              outline:      'none',
              lineHeight:   1.5,
              fontFamily:   'inherit',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              padding:      '9px 14px',
              background:   loading || !input.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(167,139,250,0.2)',
              border:       `1px solid ${loading || !input.trim() ? 'rgba(255,255,255,0.06)' : 'rgba(167,139,250,0.4)'}`,
              borderRadius: 8,
              color:        loading || !input.trim() ? '#334155' : '#a78bfa',
              fontWeight:   700,
              fontSize:     18,
              cursor:       loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition:   'all .15s',
              lineHeight:   1,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#1e293b', marginTop: 5, textAlign: 'right' }}>
          Shift+Enter для переноса строки
        </div>
      </div>

      <style>{`
        @keyframes dot {
          0%, 100% { opacity: .3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  )
}
