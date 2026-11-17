// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeEventSource extends EventTarget {
  readyState = 0
  url: string
  constructor(url: string) {
    super()
    this.url = url
  }
  close() {
    this.readyState = 2
  }
}

let uninstall: (() => void) | undefined

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function setup() {
  vi.useFakeTimers()
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('EventSource', FakeEventSource)
  window.EventSource = FakeEventSource as unknown as typeof EventSource
  const { installTonConnectDiagnostics } = await import('./tonConnectDiagnostics')
  uninstall = installTonConnectDiagnostics()
  return fetchMock
}

function sentStack(fetchMock: ReturnType<typeof vi.fn>): string {
  const init = fetchMock.mock.calls.at(-1)?.[1] as { body: string }
  return (JSON.parse(init.body) as { stack: string; message: string }).stack
}

describe('TON Connect diagnostics', () => {
  it('reports the bridge stream timeline when the attempt stalls, without message contents or ids', async () => {
    const fetchMock = await setup()
    window.dispatchEvent(new CustomEvent('ton-connect-ui-connection-started'))
    const es = new window.EventSource('https://tonbridge.telegram.org/events?client_id=deadbeef')
    es.dispatchEvent(new Event('open'))
    es.dispatchEvent(new MessageEvent('message', { data: '{"from":"secret","message":"payload"}' }))
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.advanceTimersByTimeAsync(90_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const stack = sentStack(fetchMock)
    expect(stack).toContain('reason=no-result-90s')
    expect(stack).toContain('sse#1 new tonbridge.telegram.org')
    expect(stack).toContain('sse#1 open')
    expect(stack).toContain('sse#1 message#1 data')
    expect(stack).not.toContain('deadbeef')
    expect(stack).not.toContain('secret')
    expect(stack).not.toContain('payload')
  })

  it('reports once on completion and ignores non-bridge EventSources', async () => {
    const fetchMock = await setup()
    window.dispatchEvent(new CustomEvent('ton-connect-ui-connection-started'))
    new window.EventSource('https://example.com/stream')
    window.dispatchEvent(new CustomEvent('ton-connect-ui-connection-completed'))
    await vi.advanceTimersByTimeAsync(90_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const stack = sentStack(fetchMock)
    expect(stack).toContain('reason=completed')
    expect(stack).not.toContain('example.com')
  })

  it('sends nothing when no connection was started', async () => {
    const fetchMock = await setup()
    new window.EventSource('https://tonbridge.telegram.org/events?client_id=x')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
