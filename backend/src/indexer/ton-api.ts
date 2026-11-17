export interface TonOutMsg {
  destination: string | null;
  value?: string;
  body?: string;
  message_content?: { body?: string };
}

export interface TonComputePhase {
  success?: boolean;
  exit_code?: number;
  skipped?: boolean;
}

export interface TonTransactionDescription {
  type?: string;
  aborted?: boolean;
  compute_ph?: TonComputePhase;
}

export interface TonTransaction {
  hash: string;
  lt: string;
  account: string;
  now: number;
  mc_block_seqno: number;
  description?: TonTransactionDescription;
  aborted?: boolean;
  compute_phase?: TonComputePhase;
  in_msg?: {
    body?: string;
    value: string;
    source: string | null;
    message_content?: { body?: string };
  };
  out_msgs?: TonOutMsg[];
}

export interface GetTransactionsResponse {
  transactions: TonTransaction[];
}

export class TonCenterClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(opts: { testnet?: boolean; apiKey?: string } = {}) {
    this.baseUrl = opts.testnet
      ? "https://testnet.toncenter.com/api/v3"
      : "https://toncenter.com/api/v3";
    this.apiKey = opts.apiKey;
  }

  async getTransactions(
    account: string,
    opts: { startLt?: bigint; limit?: number } = {}
  ): Promise<TonTransaction[]> {
    const params = new URLSearchParams({
      account,
      limit: String(opts.limit ?? 100),
      sort: "asc",
    });
    if (opts.startLt !== undefined && opts.startLt > 0n) {
      params.set("start_lt", opts.startLt.toString());
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const url = `${this.baseUrl}/transactions?${params}`;

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`TonCenter API error ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as GetTransactionsResponse;
      return json.transactions ?? [];
    }

    throw new Error("TonCenter API: rate limit exceeded after 4 retries");
  }

  async runGetMethod(
    address: string,
    method: string,
  ): Promise<{ exit_code: number; stack: unknown[] }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const url = `${this.baseUrl}/runGetMethod`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ address, method, stack: [] }),
    });
    if (!res.ok) {
      throw new Error(`TonCenter runGetMethod error ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as { exit_code: number; stack: unknown[] };
  }
}
