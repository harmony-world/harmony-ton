export const DONOR_LEVEL_THRESHOLDS_USD: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0,
  2: 50,
  3: 200,
  4: 500,
  5: 1000,
};

export type DonorLevel = 1 | 2 | 3 | 4 | 5;

let runtimeIds: Record<DonorLevel, string> | null = null;

export function setRuntimeEmojiIds(ids: Record<DonorLevel, string>): void {
  runtimeIds = ids;
}

export function getDonorLevelForUsd(totalUsd: number): DonorLevel {
  let result: DonorLevel = 1;
  for (const level of [1, 2, 3, 4, 5] as DonorLevel[]) {
    if (totalUsd >= DONOR_LEVEL_THRESHOLDS_USD[level]) result = level;
  }
  return result;
}

function envId(level: DonorLevel): string | null {
  const raw = process.env[`HARMONY_EMOJI_STATUS_LEVEL_${level}_ID`];
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function getEmojiStatusIdForLevel(level: DonorLevel): string | null {
  return envId(level) ?? runtimeIds?.[level] ?? null;
}

export function areAllEmojiStatusIdsConfigured(): boolean {
  for (const level of [1, 2, 3, 4, 5] as DonorLevel[]) {
    if (getEmojiStatusIdForLevel(level) === null) return false;
  }
  return true;
}
