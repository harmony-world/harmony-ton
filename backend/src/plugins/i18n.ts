import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { resolveLocale, t, type Locale, type TranslationVars } from "../i18n/index.js";

declare module "fastify" {
  interface FastifyRequest {
    locale: Locale;
    t: (key: string, vars?: TranslationVars) => string;
  }
}

const i18nPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorateRequest("locale", "ru");
  app.decorateRequest("t", function translate(this: { locale?: Locale }, key: string, vars?: TranslationVars) {
    return t(this.locale, key, vars);
  });

  app.addHook("onRequest", async (request) => {
    const explicitLanguage = request.headers["x-harmony-language"];
    const headerLanguage = Array.isArray(explicitLanguage)
      ? explicitLanguage[0]
      : explicitLanguage ?? request.headers["accept-language"];
    request.locale = resolveLocale(headerLanguage);
  });
});

export default i18nPlugin;
