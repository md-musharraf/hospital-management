import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Bot as BotIcon, RotateCcw, Send, X } from 'lucide-react'
import { api, consent } from '../api.ts'

type Msg = { from: 'bot' | 'me'; text: string; options?: string[] }

// Remember the chat on this device only if cookies/storage were accepted.
const store = () => (consent() === 'all' ? localStorage : sessionStorage)
const getSid = () => {
  try {
    return store().getItem('bot_sid') || undefined
  } catch {
    return undefined
  }
}
const setSid = (sid: string) => {
  try {
    store().setItem('bot_sid', sid)
  } catch {
    /* storage blocked */
  }
}

/** Open the floating bot from anywhere, optionally replaying a script (e.g. book a given doctor). */
export const openBot = (script?: string[]) => window.dispatchEvent(new CustomEvent('bot:open', { detail: script }))

function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/\S+)/g).map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <Fragment key={i}>{part}</Fragment>
        const url = new URL(part)
        return url.origin === location.origin ? (
          <Link key={i} to={url.pathname}>
            {url.pathname.startsWith('/track/') ? 'Track my token live →' : part}
          </Link>
        ) : (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        )
      })}
    </>
  )
}

export default function Bot({ floating, onClose, script }: { floating?: boolean; onClose?: () => void; script?: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const sid = useRef(getSid())
  const body = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  async function send(t: string, show = true) {
    if (show) setMsgs((m) => [...m, { from: 'me', text: t }])
    setBusy(true)
    try {
      const [r] = await Promise.all([api<{ sid: string; messages: Msg[] }>('/bot', { sid: sid.current, text: t }), new Promise((ok) => setTimeout(ok, 450))])
      sid.current = r.sid
      setSid(r.sid)
      setMsgs((m) => [...m, ...r.messages.map((x) => ({ ...x, from: 'bot' as const }))])
    } catch (e) {
      setMsgs((m) => [...m, { from: 'bot', text: `⚠️ ${(e as Error).message}` }])
    } finally {
      setBusy(false)
      setTimeout(() => input.current?.focus({ preventScroll: true }), 50)
    }
  }

  async function runScript(steps: string[]) {
    setMsgs((m) => [...m, { from: 'me', text: steps.at(-1)!.replace(/ · .*/, '') }])
    setBusy(true)
    try {
      let last: Msg[] = []
      for (const s of steps) {
        const r = await api<{ sid: string; messages: Msg[] }>('/bot', { sid: sid.current, text: s })
        sid.current = r.sid
        last = r.messages
      }
      setSid(sid.current!)
      setMsgs((m) => [...m, ...last.map((x) => ({ ...x, from: 'bot' as const }))])
    } catch (e) {
      setMsgs((m) => [...m, { from: 'bot', text: `⚠️ ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  const ran = useRef<unknown>(Symbol()) // StrictMode runs effects twice in dev; greet once
  useEffect(() => {
    if (ran.current === script) return
    ran.current = script
    if (script?.length) runScript(['hi', ...script])
    else send('hi', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script])

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight })
  }, [msgs, busy])

  const lastOpts = msgs.findLastIndex((m) => m.options?.length)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setText('')
    send(t)
  }

  return (
    <div className={`chat ${floating ? 'chat-pop' : ''}`} role="region" aria-label="Appointment booking chat">
      <div className="chat-h">
        <div className="av">
          <BotIcon size={22} />
          <span className="live-dot" />
        </div>
        <div className="grow">
          <b>CareBot</b>
          <span>Books your OPD token in under a minute</span>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#fff' }} onClick={() => send('menu')} aria-label="Start over" title="Start over">
          <RotateCcw />
        </button>
        {onClose && (
          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#fff' }} onClick={onClose} aria-label="Close chat">
            <X />
          </button>
        )}
      </div>
      <div className="chat-body" ref={body} aria-live="polite">
        {msgs.map((m, i) => (
          <Fragment key={i}>
            <div className={`msg ${m.from}`}>
              <Linkify text={m.text} />
            </div>
            {m.options && m.options.length > 0 && (
              <div className="opts">
                {m.options.map((o) => (
                  <button key={o} disabled={i !== lastOpts || busy} onClick={() => send(o)}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </Fragment>
        ))}
        {busy && (
          <div className="typing" aria-label="CareBot is typing">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      <form className="chat-in" onSubmit={submit}>
        <input ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply…" aria-label="Your reply" maxLength={200} />
        <button className="btn btn-primary" disabled={!text.trim() || busy} aria-label="Send">
          <Send />
        </button>
      </form>
    </div>
  )
}
