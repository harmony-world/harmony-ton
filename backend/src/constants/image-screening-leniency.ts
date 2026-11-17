export const LENIENT_IMAGE_CODES_BY_CATEGORY: Partial<Record<string, readonly string[]>> = {};

export const CATEGORY_LENIENCY_CODE = "IMAGE_FLAG_SOFTENED_BY_CATEGORY";

export function isLenientForCategory(_category: string, _reasonCodes: readonly string[]): boolean {
  return false;
}
