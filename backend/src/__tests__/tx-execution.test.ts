import { describe, expect, it } from "vitest";
import { revertExitCode, transactionExecution } from "../indexer/tx-execution.js";

const REVERTED_TONCENTER = {
  hash: "lWVQ97jWFtWDSgICd1RIMb6t6rPpW6W1LM/qrb0F99w=",
  lt: "105130783000007",
  now: 1790070033,
  mc_block_seqno: 94327439,
  description: {
    type: "ord",
    aborted: true,
    destroyed: false,
    compute_ph: { skipped: false, success: false, exit_code: 109 },
  },
};

const SUCCEEDED_TONCENTER = {
  hash: "1MtLrWJNpdVc",
  lt: "105098765000003",
  now: 1789813116,
  mc_block_seqno: 94300000,
  description: {
    type: "ord",
    aborted: false,
    compute_ph: { skipped: false, success: true, exit_code: 0 },
    action: { success: true },
  },
};

describe("transactionExecution", () => {
  it("reads the revert out of a real reverted transaction", () => {
    expect(transactionExecution(REVERTED_TONCENTER)).toBe("reverted");
    expect(revertExitCode(REVERTED_TONCENTER)).toBe(109);
  });

  it("accepts a transaction that computed and acted", () => {
    expect(transactionExecution(SUCCEEDED_TONCENTER)).toBe("succeeded");
    expect(revertExitCode(SUCCEEDED_TONCENTER)).toBeNull();
  });

  it("reads the tonapi shape, where the same fields sit on the transaction itself", () => {
    expect(transactionExecution({ aborted: true, compute_phase: { success: false, exit_code: 109 } }))
      .toBe("reverted");
    expect(transactionExecution({ aborted: false, compute_phase: { success: true, exit_code: 0 } }))
      .toBe("succeeded");
    expect(revertExitCode({ aborted: true, compute_phase: { success: false, exit_code: 109 } })).toBe(109);
  });

  it("counts a non-zero exit code as a revert even when nothing set aborted", () => {
    expect(transactionExecution({ description: { compute_ph: { exit_code: 103 } } })).toBe("reverted");
  });

  it("counts a skipped compute phase as a revert — no code ran, so nothing was accepted", () => {
    expect(transactionExecution({ description: { aborted: false, compute_ph: { skipped: true } } }))
      .toBe("reverted");
  });

  it("says unknown when the payload carries no outcome at all", () => {
    expect(transactionExecution({ hash: "abc", lt: "1", now: 1, mc_block_seqno: 1 })).toBe("unknown");
    expect(transactionExecution({ description: { type: "ord" } })).toBe("unknown");
    expect(transactionExecution(undefined)).toBe("unknown");
    expect(transactionExecution(null)).toBe("unknown");
  });
});
