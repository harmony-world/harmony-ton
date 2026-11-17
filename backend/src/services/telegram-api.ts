export type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export type TelegramChat = {
  id: number;
  title?: string;
  username?: string;
  type?: string;
  photo?: { small_file_id: string };
};

export type TelegramChatMember = {
  status: string;
  can_post_messages?: boolean;
};

export type TelegramFile = {
  file_path?: string;
};

export type TelegramMessage = {
  message_id: number;
};

type QueryValue = string | number | bigint | boolean;

function buildQuery(params: Record<string, QueryValue>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, value.toString());
  }
  return searchParams.toString();
}

export class TelegramApiClient {
  private readonly apiBase: string;
  private readonly fileBase: string;

  constructor(private readonly botToken: string) {
    this.apiBase = `https://api.telegram.org/bot${botToken}`;
    this.fileBase = `https://api.telegram.org/file/bot${botToken}`;
  }

  async get<T>(method: string, params: Record<string, QueryValue> = {}): Promise<TelegramApiResponse<T>> {
    const query = buildQuery(params);
    const url = query ? `${this.apiBase}/${method}?${query}` : `${this.apiBase}/${method}`;
    const res = await fetch(url);
    return (await res.json()) as TelegramApiResponse<T>;
  }

  async post<T>(method: string, body: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
    const res = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as TelegramApiResponse<T>;
  }

  fetchFile(filePath: string): Promise<Response> {
    return fetch(`${this.fileBase}/${filePath}`);
  }
}

export function telegramApi(botToken: string): TelegramApiClient {
  return new TelegramApiClient(botToken);
}
