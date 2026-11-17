export type TransactionExecution = "succeeded" | "reverted" | "unknown";

type ComputePhase = {
  success?: boolean;
  exit_code?: number;
  skipped?: boolean;
};

type ExecutionFields = {
  aborted?: boolean;
  compute_ph?: ComputePhase;
  compute_phase?: ComputePhase;
};

type WithExecution = {
  description?: ExecutionFields;
} & ExecutionFields;

function computePhaseOf(source: ExecutionFields | undefined): ComputePhase | undefined {
  return source?.compute_ph ?? source?.compute_phase;
}

export function revertExitCode(raw: unknown): number | null {
  const tx = raw as WithExecution | undefined;
  const compute = computePhaseOf(tx?.description) ?? computePhaseOf(tx);
  return typeof compute?.exit_code === "number" && compute.exit_code !== 0 ? compute.exit_code : null;
}

export function transactionExecution(raw: unknown): TransactionExecution {
  const tx = raw as WithExecution | undefined;
  if (!tx || typeof tx !== "object") return "unknown";

  const source: ExecutionFields | undefined =
    tx.description && typeof tx.description === "object" ? tx.description : tx;
  const compute = computePhaseOf(source);
  const aborted = source?.aborted;

  if (typeof aborted !== "boolean" && !compute) return "unknown";
  if (aborted === true) return "reverted";

  if (compute?.skipped === true) return "reverted";
  if (compute?.success === false) return "reverted";
  if (typeof compute?.exit_code === "number" && compute.exit_code !== 0) return "reverted";

  return "succeeded";
}
