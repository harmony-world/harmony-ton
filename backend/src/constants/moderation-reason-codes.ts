export const LIST_REASON_CODES = [
  "MILITARY_TOPIC",
  "PROHIBITED_TERROR_EXTREMISM",
  "PROHIBITED_WEAPONS",
  "PROHIBITED_DRUGS",
  "PROHIBITED_GAMBLING",
  "PROHIBITED_ADULT",
  "PROHIBITED_FINANCIAL_SCHEME",
  "PROHIBITED_PROFANITY",
  "PROHIBITED_CATEGORY",
] as const;

export type ListReasonCode = (typeof LIST_REASON_CODES)[number];

export const LIST_SEVERITIES = ["critical", "high"] as const;

export type ListSeverity = (typeof LIST_SEVERITIES)[number];

export const LIST_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const MAX_PATTERN_LENGTH = 200;
