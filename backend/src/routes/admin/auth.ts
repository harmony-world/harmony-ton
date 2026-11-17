import type { FastifyInstance } from "fastify";

export function adminBotLoginReturnUrl(_token: string): string {
  return "";
}

export async function confirmAdminBotLogin(
  _app: FastifyInstance,
  _token: string,
  _telegramUser: { id: number; username?: string; first_name?: string },
): Promise<"confirmed" | "expired" | "forbidden"> {
  return "expired";
}

export function parseAdminBotLoginPayload(_payload: string | undefined): string | null {
  return null;
}
