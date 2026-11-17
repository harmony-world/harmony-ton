export class StaleWrappersError extends Error {
  constructor(missing: string[]) {
    super(
      `Сборка контрактных обёрток устарела: нет ${missing.join(", ")}. ` +
        "Нужно собрать contracts/harmony/wrappers-ts (npm run build) и перезапустить бэкенд.",
    );
    this.name = "StaleWrappersError";
  }
}

export function requireBuilders<T extends string>(
  module: Record<string, unknown>,
  names: readonly T[],
): Record<T, (...args: unknown[]) => unknown> {
  const missing = names.filter((name) => typeof module[name] !== "function");
  if (missing.length > 0) throw new StaleWrappersError(missing);

  return Object.fromEntries(names.map((name) => [name, module[name]])) as Record<
    T,
    (...args: unknown[]) => unknown
  >;
}
