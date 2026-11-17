import { API_URL } from './env'

type Entry = string

const BRIDGE_STREAM = /\/events\?client_id=/
const STALL_REPORT_MS = 90_000
const MAX_ENTRIES = 80

let started = 0
let entries: Entry[] = []
let attempt = 0
let stallTimer: ReturnType<typeof setTimeout> | undefined

function now(): string {
  return started ? `+${((Date.now() - started) / 1000).toFixed(1)}s` : '-'
}

function note(text: string) {
  if (!started) return
  if (entries.length < MAX_ENTRIES) entries.push(`${now()} ${text}`)
}

function flush(reason: string) {
  if (!started) return
  if (stallTimer) clearTimeout(stallTimer)
  const lines = [`attempt=${attempt} reason=${reason}`, ...entries]
  started = 0
  entries = []
  const body = {
    message: `[tonconnect-diag] ${reason}`.slice(0, 500),
    name: 'TonConnectDiagnostics',
    stack: lines.join('\n').slice(0, 2000),
    url: window.location.href.slice(0, 500),
    userAgent: navigator.userAgent.slice(0, 500),
    timestamp: new Date().toISOString(),
    source: 'tonconnect-diag',
  }
  fetch(`${API_URL}/frontend-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined)
}

function begin(label: string) {
  if (started) flush('superseded')
  attempt += 1
  started = Date.now()
  entries = []
  note(`${label} visibility=${document.visibilityState} online=${navigator.onLine}`)
  stallTimer = setTimeout(() => flush('no-result-90s'), STALL_REPORT_MS)
}

function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.searchParams.has('last_event_id') ? ' +last_event_id' : ''}`
  } catch {
    return 'bad-url'
  }
}

function wrapEventSource(): () => void {
  const Native = window.EventSource
  if (!Native || (Native as unknown as { __hot255?: boolean }).__hot255) return () => undefined
  let seq = 0
  class TracedEventSource extends Native {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init)
      const href = String(url)
      if (!BRIDGE_STREAM.test(href)) return
      const n = ++seq
      let messages = 0
      note(`sse#${n} new ${hostOf(href)}`)
      this.addEventListener('open', () => note(`sse#${n} open`))
      this.addEventListener('error', () => note(`sse#${n} error readyState=${this.readyState}`))
      this.addEventListener('message', (e) => {
        messages += 1
        if (messages <= 5) note(`sse#${n} message#${messages} ${(e as MessageEvent).data === 'heartbeat' ? 'heartbeat' : 'data'}`)
      })
      const close = this.close.bind(this)
      this.close = () => {
        note(`sse#${n} close by sdk (messages=${messages})`)
        close()
      }
    }
  }
  ;(TracedEventSource as unknown as { __hot255?: boolean }).__hot255 = true
  window.EventSource = TracedEventSource
  return () => {
    window.EventSource = Native
  }
}

export function installTonConnectDiagnostics(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const restoreEventSource = wrapEventSource()
  const ac = new AbortController()
  const opts = { signal: ac.signal }

  window.addEventListener('ton-connect-ui-connection-started', () => begin('connection-started'), opts)
  window.addEventListener(
    'ton-connect-ui-connection-completed',
    () => {
      note('connection-completed')
      flush('completed')
    },
    opts,
  )
  window.addEventListener(
    'ton-connect-ui-connection-error',
    (e) => {
      const detail = (e as CustomEvent<{ error_message?: string; error_code?: number }>).detail
      note(`connection-error code=${detail?.error_code ?? '-'} ${String(detail?.error_message ?? '').slice(0, 120)}`)
      flush('error')
    },
    opts,
  )
  for (const name of ['wallet-modal-opened', 'selected-wallet', 'connection-restoring-started', 'connection-restoring-error']) {
    window.addEventListener(
      `ton-connect-ui-${name}`,
      (e) => {
        const detail = (e as CustomEvent<{ app_name?: string }>).detail
        note(`${name}${detail?.app_name ? ` app=${detail.app_name}` : ''}`)
      },
      opts,
    )
  }
  document.addEventListener('visibilitychange', () => note(`visibility=${document.visibilityState}`), opts)
  window.addEventListener('online', () => note('online'), opts)
  window.addEventListener('offline', () => note('offline'), opts)
  window.addEventListener(
    'pagehide',
    () => {
      note('pagehide')
      flush('pagehide')
    },
    opts,
  )

  return () => {
    ac.abort()
    restoreEventSource()
    if (stallTimer) clearTimeout(stallTimer)
    started = 0
    entries = []
  }
}
