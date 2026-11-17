import type pino from "pino";

export interface AiDetectionResult {
  photoIndex: number;
  score: number;
  provider: string;
  suspectedAi: boolean;
  checkedAt: string;
  generators?: Record<string, number>;
}

export interface AiDetectionSummary {
  results: AiDetectionResult[];
  suspectedCount: number;
  autoReject: boolean;
  autoRejectIndex?: number;
}

export function getSuspectThreshold(): number {
  return 1;
}

export function getAutoRejectThreshold(): number {
  return 1;
}

export async function checkPhotos(_photoUrls: string[], log: pino.Logger): Promise<AiDetectionSummary | null> {
  log.debug("automated report photo check is not part of the open edition");
  return null;
}

export function formatAiWarning(_summary: AiDetectionSummary): string | null {
  return null;
}
