import type { FastifyBaseLogger } from "fastify";

export type ImageScreenResult = {
  dominated: boolean;
  reasonCodes: string[];
  details: Array<{ source: string; label: string; score: number; reasonCode: string }>;
  nsfwScores: Record<string, number>;
};

export const SCREENING_UNAVAILABLE_CODE = "IMAGE_SCREENING_UNAVAILABLE";
export const HUMAN_REVIEW_ONLY_IMAGE_CODES: readonly string[] = [SCREENING_UNAVAILABLE_CODE];

export function isHumanReviewOnlyImageCode(code: string): boolean {
  return HUMAN_REVIEW_ONLY_IMAGE_CODES.includes(code);
}

export type UploadedPhotosCheck = {
  flagged: boolean;
  reasonCodes: string[];
  results: Array<{ url: string; result: ImageScreenResult }>;
  screeningFailed: boolean;
  unscreened: string[];
};

export async function checkUploadedPhotos(
  photoUrls: string[],
  _uploadsDir: string,
  _logger?: FastifyBaseLogger,
): Promise<UploadedPhotosCheck> {
  return { flagged: false, reasonCodes: [], results: [], screeningFailed: false, unscreened: [...photoUrls] };
}

export async function preloadModel(_logger?: FastifyBaseLogger): Promise<void> {}
