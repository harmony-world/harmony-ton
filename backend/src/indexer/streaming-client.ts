import type pino from "pino";
import type { TonTransaction } from "./ton-api.js";

export interface StreamingConfig {
  testnet: boolean;
  apiKey?: string;
  minFinality?: "pending" | "confirmed" | "finalized";
}

export type StreamingTransactionHandler = (
  accountAddr: string,
  tx: TonTransaction,
  finality: string,
) => Promise<void> | void;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const KEEPALIVE_TIMEOUT_MS = 60_000;

export class StreamingClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly minFinality: string;
  private readonly log: pino.Logger;
  private readonly handler: StreamingTransactionHandler;

  private addresses: string[] = [];
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private running = false;
  private _connected = false;

  constructor(
    config: StreamingConfig,
    handler: StreamingTransactionHandler,
    log: pino.Logger,
  ) {
    this.baseUrl = config.testnet
      ? "https://testnet.tonapi.io/streaming/v2/sse"
      : "https://tonapi.io/streaming/v2/sse";
    this.apiKey = config.apiKey;
    this.minFinality = config.minFinality ?? "confirmed";
    this.handler = handler;
    this.log = log;
  }

  get connected(): boolean {
    return this._connected;
  }

  async subscribe(addresses: string[]): Promise<void> {
    this.addresses = addresses;
    if (this.addresses.length === 0) {
      this.log.warn("StreamingClient: no addresses to subscribe to");
      return;
    }
    this.running = true;
    this.backoffMs = INITIAL_BACKOFF_MS;
    await this.connect();
  }

  updateAddresses(addresses: string[]): void {
    const changed =
      addresses.length !== this.addresses.length ||
      addresses.some((a, i) => a !== this.addresses[i]);
    if (!changed) return;

    this.addresses = addresses;
    if (this.running && this.addresses.length > 0) {
      this.log.info(
        { count: this.addresses.length },
        "StreamingClient: address list changed, reconnecting",
      );
      this.disconnect();
      this.scheduleReconnect(0);
    }
  }

  stop(): void {
    this.running = false;
    this._connected = false;
    this.disconnect();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private disconnect(): void {
    this._connected = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private scheduleReconnect(delayMs?: number): void {
    if (!this.running) return;
    const delay = delayMs ?? this.backoffMs;
    this.log.info({ delayMs: delay }, "StreamingClient: scheduling reconnect");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        this.log.error({ err }, "StreamingClient: reconnect failed");
      });
    }, delay);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private async connect(): Promise<void> {
    if (!this.running || this.addresses.length === 0) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const body = JSON.stringify({
      types: ["transactions"],
      addresses: this.addresses,
      min_finality: this.minFinality,
    });

    this.log.info(
      { url: this.baseUrl, addressCount: this.addresses.length, minFinality: this.minFinality },
      "StreamingClient: connecting",
    );

    let res: Response;
    try {
      res = await fetch(this.baseUrl, { method: "POST", headers, body, signal });
    } catch (err: unknown) {
      if (signal.aborted) return;
      this.log.error({ err }, "StreamingClient: connection failed");
      this.scheduleReconnect();
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.log.error(
        { status: res.status, body: text.slice(0, 500) },
        "StreamingClient: HTTP error",
      );
      if (res.status === 429) {
        this.backoffMs = Math.max(this.backoffMs, 5_000);
      }
      this.scheduleReconnect();
      return;
    }

    if (!res.body) {
      this.log.error("StreamingClient: response has no body");
      this.scheduleReconnect();
      return;
    }

    this._connected = true;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.log.info("StreamingClient: connected");

    try {
      await this.readStream(res.body, signal);
    } catch (err: unknown) {
      if (signal.aborted) return;
      this.log.error({ err }, "StreamingClient: stream error");
    } finally {
      this._connected = false;
    }

    if (this.running) {
      this.scheduleReconnect();
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffer = "";
    let lastEventAt = Date.now();

    const checkKeepalive = setInterval(() => {
      if (Date.now() - lastEventAt > KEEPALIVE_TIMEOUT_MS) {
        this.log.warn("StreamingClient: keepalive timeout, disconnecting");
        this.disconnect();
      }
    }, KEEPALIVE_TIMEOUT_MS / 2);

    try {
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        lastEventAt = Date.now();

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === "" || trimmed.startsWith(":")) continue;

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            await this.handleSSEData(jsonStr);
          } else {
            try {
              JSON.parse(trimmed);
              await this.handleSSEData(trimmed);
            } catch (err) {
              this.log.debug({ err, line: trimmed.slice(0, 160) }, "StreamingClient: skipped non-JSON SSE line");
            }
          }
        }
      }
    } finally {
      clearInterval(checkKeepalive);
      reader.releaseLock();
    }
  }

  private async handleSSEData(jsonStr: string): Promise<void> {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch (err) {
      this.log.debug({ err, data: jsonStr.slice(0, 160) }, "StreamingClient: skipped malformed SSE data");
      return;
    }

    if ("status" in data) {
      this.log.info({ status: data.status }, "StreamingClient: subscription status");
      return;
    }

    if (data.type !== "transactions") return;

    const finality = (data.finality as string) ?? "unknown";
    const transactions = data.transactions as TonTransaction[] | undefined;
    if (!transactions || !Array.isArray(transactions)) return;

    for (const tx of transactions) {
      const accountAddr = tx.account ?? "";
      try {
        await this.handler(accountAddr, tx, finality);
      } catch (err) {
        this.log.error(
          { err, txHash: tx.hash, account: accountAddr },
          "StreamingClient: handler error",
        );
      }
    }
  }
}
