import React, { useState, useRef, useEffect } from 'react'

const API_BASE = 'http://localhost:8000'

export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Привет! Я твой ментор по программированию. 🎓\n\nЯ вижу твой граф навыков и могу помочь:\n- Подсказать что учить дальше\n- Объяснить сложные концепции\n- Предложить проекты для практики\n\nЧто тебя интересует?',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/ai/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      })

      const data = await response.json()

      const assistantMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        actions: data.actions || []
      }

      setMessages(prev => [...prev, assistantMessage])

      // Если есть предложенные действия
      if (data.actions && data.actions.length > 0) {
        console.log('Suggested actions:', data.actions)
        // Здесь можно добавить обработку действий
      }

    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage = {
        role: 'assistant',
        content: 'Извини, произошла ошибка. Попробуй ещё раз.',
        timestamp: new Date(),
        error: true
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleAction = async (action) => {
  if (action.type === 'add_skill') {
    try {
      const response = await fetch(`${API_BASE}/ai/add-skills/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: action.skill })
      })

      const result = await response.json()

      if (result.skills && result.skills.length > 0) {
        alert(`✅ Навык "${action.skill}" добавлен!`)
        // Перезагружаем страницу чтобы обновить граф
        window.location.reload()
      } else if (result.error) {
        alert(`❌ Ошибка: ${result.error}`)
      }
    } catch (error) {
      console.error('Error adding skill:', error)
      alert('Ошибка при добавлении навыка')
    }
  }
}

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: '400px',
      background: 'white',
      boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 2000
    }}>
      {/* Header */}
      <div style={{
        padding: '15px',
        background: '#9C27B0',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0 }}>💬 Чат с ментором</h3>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '15px'
      }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            marginBottom: '15px',
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '10px 15px',
              borderRadius: '10px',
              background: msg.role === 'user' ? '#9C27B0' : '#f0f0f0',
              color: msg.role === 'user' ? 'white' : 'black',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {msg.content}

              {/* Proposed actions */}
              {msg.actions && msg.actions.length > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                  {msg.actions.map((action, aidx) => (
                    <button
                      key={aidx}
                      onClick={() => handleAction(action)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '8px',
                        marginTop: '5px',
                        background: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {msg.error && (
                <div style={{ marginTop: '5px', color: '#f44336', fontSize: '12px' }}>
                  ⚠️ Ошибка соединения
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{
            padding: '10px',
            color: '#666',
            fontStyle: 'italic'
          }}>
            🤖 Ментор печатает...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '15px',
        borderTop: '1px solid #ddd',
        background: '#fafafa'
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Задай вопрос ментору..."
          rows={3}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'none',
            fontFamily: 'inherit',
            marginBottom: '10px'
          }}
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            width: '100%',
            padding: '10px',
            background: loading || !input.trim() ? '#ccc' : '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
    </div>
  )
}