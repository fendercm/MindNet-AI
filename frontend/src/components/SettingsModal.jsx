// frontend/src/components/SettingsModal.jsx
import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

/* Провайдеры: ключ хранится в профиле пользователя, наружу — только маской */
const PROVIDERS = [
  { key: 'GEMINI_API_KEY', label: 'Google Gemini', hint: 'бесплатный ключ', url: 'https://aistudio.google.com/apikey' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  { key: 'HF_API_KEY', label: 'HuggingFace (Qwen)', url: 'https://huggingface.co/settings/tokens' },
]
const EXTRA_PROVIDERS = [
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
  { key: 'GROK_API_KEY', label: 'Grok (xAI)', url: 'https://console.x.ai' },
]

const KeyField = ({ p, saved, value, onChange }) => {
  const cleared = value === ''
  const placeholder = cleared
    ? 'будет удалён'
    : saved?.set ? `сохранён ${saved.hint || ''}`.trim() : 'вставь ключ'
  return (
    <div className="setting">
      <div className="setting__head">
        <span className={`setting__dot${saved?.set && !cleared ? ' setting__dot--on' : ''}`} />
        <span className="setting__label">{p.label}</span>
        {p.hint && <span className="setting__hint">{p.hint}</span>}
        <a className="setting__link" href={p.url} target="_blank" rel="noreferrer">где взять ↗</a>
      </div>
      <div className="field-row" style={{ marginTop: 6 }}>
        <input
          className="field"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        {saved?.set && (
          <button
            className="icon-btn"
            title={cleared ? 'Не удалять' : 'Удалить ключ'}
            onClick={() => onChange(cleared ? undefined : '')}
          >
            {cleared ? '↺' : '✕'}
          </button>
        )}
      </div>
    </div>
  )
}

const SettingsModal = ({ onClose, onSaved, firstRun }) => {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState({})
  const [extra, setExtra] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setSaved(s)
        setDraft({
          AI_MODELS: s.AI_MODELS || '',
          OPENAI_MODEL: s.OPENAI_MODEL || '',
          USE_PROXY: s.USE_PROXY || 'false',
          PROXY_URL: s.PROXY_URL || '',
        })
        if (s.AI_MODELS || s.PROXY_URL || s.DEEPSEEK_API_KEY?.set || s.GROK_API_KEY?.set) setExtra(true)
      })
      .catch(() => setStatus({ ok: false, text: 'Сервер не отвечает — настройки недоступны' }))
  }, [])

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }))

  /* undefined у ключа = не трогать, '' = удалить */
  const changes = () => {
    const out = {}
    for (const [k, v] of Object.entries(draft)) if (v !== undefined) out[k] = v
    return out
  }

  const save = async ({ test } = {}) => {
    setBusy(true)
    setStatus(null)
    try {
      const res = await api.saveSettings(changes())
      setSaved(res)
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.endsWith('_API_KEY'))))
      onSaved?.(res)
      if (!res.ai_configured) {
        setStatus({ ok: false, text: 'Сохранено, но ни одного ключа нет — AI-функции не заработают' })
        return
      }
      if (test) {
        setStatus({ ok: null, text: 'Проверяю связь с AI…' })
        const t = await api.testSettings()
        setStatus(t.success
          ? { ok: true, text: `✓ Работает · отвечает ${t.model}` }
          : { ok: false, text: `Ключ не сработал: ${t.error}` })
      } else {
        onClose()
      }
    } catch (e) {
      setStatus({ ok: false, text: e.message || 'Не удалось сохранить' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={firstRun ? undefined : onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">{firstRun ? 'Подключим AI' : 'Настройки'}</div>
        <p className="modal__text">
          {firstRun
            ? 'Чтобы работали ментор и анализ навыков, нужен ключ хотя бы одного AI-провайдера. Проще всего — бесплатный ключ Gemini.'
            : 'Ключи хранятся только на этом компьютере. Достаточно одного — остальные станут запасными.'}
        </p>

        {saved && (
          <>
            {PROVIDERS.map((p) => (
              <KeyField key={p.key} p={p} saved={saved[p.key]} value={draft[p.key]} onChange={set(p.key)} />
            ))}

            <button className="setting__toggle" onClick={() => setExtra((x) => !x)}>
              {extra ? '▾' : '▸'} Дополнительно
            </button>
            {extra && (
              <>
                {EXTRA_PROVIDERS.map((p) => (
                  <KeyField key={p.key} p={p} saved={saved[p.key]} value={draft[p.key]} onChange={set(p.key)} />
                ))}
                <div className="setting">
                  <div className="setting__head"><span className="setting__label">Порядок провайдеров</span></div>
                  <input
                    className="field"
                    style={{ marginTop: 6 }}
                    value={draft.AI_MODELS}
                    onChange={(e) => set('AI_MODELS')(e.target.value)}
                    placeholder="авто: все, для которых есть ключ (gemini,openai,…)"
                  />
                </div>
                <div className="setting">
                  <div className="setting__head"><span className="setting__label">Модель OpenAI</span></div>
                  <input
                    className="field"
                    style={{ marginTop: 6 }}
                    value={draft.OPENAI_MODEL}
                    onChange={(e) => set('OPENAI_MODEL')(e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="setting">
                  <label className="setting__head setting__check">
                    <input
                      type="checkbox"
                      checked={draft.USE_PROXY === 'true'}
                      onChange={(e) => set('USE_PROXY')(e.target.checked ? 'true' : 'false')}
                    />
                    <span className="setting__label">Ходить к AI через прокси</span>
                  </label>
                  {draft.USE_PROXY === 'true' && (
                    <input
                      className="field"
                      style={{ marginTop: 6 }}
                      value={draft.PROXY_URL}
                      onChange={(e) => set('PROXY_URL')(e.target.value)}
                      placeholder="http://127.0.0.1:1080"
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}

        {status && (
          <div className={`setting__status setting__status--${status.ok === null ? 'wait' : status.ok ? 'ok' : 'err'}`}>
            {status.text}
          </div>
        )}

        <div className="modal__row" style={{ marginTop: 14 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {firstRun ? 'Позже' : 'Закрыть'}
          </button>
          <button className="btn btn--ghost" onClick={() => save({ test: true })} disabled={busy || !saved}>
            Проверить
          </button>
          <button className="btn btn--primary" onClick={() => save()} disabled={busy || !saved}>
            {busy ? <span className="spinner" /> : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
