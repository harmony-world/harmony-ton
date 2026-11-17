const DEFAULT_WEB_APP_URL = "https://app.harmonymarket.click";
const DEFAULT_BOT_USERNAME = "Gram_Harmony_Bot";

export function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} not set`);
  return value;
}

export function getWebAppUrl(): string {
  return getEnv("WEB_APP_URL") ?? getEnv("MINI_APP_URL") ?? DEFAULT_WEB_APP_URL;
}

export function getBotUsername(): string {
  return getEnv("BOT_USERNAME") ?? DEFAULT_BOT_USERNAME;
}
