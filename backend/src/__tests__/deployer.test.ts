import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployNotSentError, deployCampaignOnchain, getDeployerNetworkConfig } from "../services/deployer.js";

const ORIGINAL_ENV = {
  TON_NETWORK: process.env.TON_NETWORK,
  TON_CENTER_V2_ENDPOINT: process.env.TON_CENTER_V2_ENDPOINT,
  TON_WALLET_NETWORK_GLOBAL_ID: process.env.TON_WALLET_NETWORK_GLOBAL_ID,
  DEPLOYER_MNEMONIC: process.env.DEPLOYER_MNEMONIC,
  DEPLOYER_MNEMONIC_FILE: process.env.DEPLOYER_MNEMONIC_FILE,
  HARMONY_MASTER_ADDR: process.env.HARMONY_MASTER_ADDR,
  TON_CENTER_API_KEY: process.env.TON_CENTER_API_KEY,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("getDeployerNetworkConfig", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("defaults to testnet endpoint and wallet global id", () => {
    delete process.env.TON_NETWORK;
    delete process.env.TON_CENTER_V2_ENDPOINT;
    delete process.env.TON_WALLET_NETWORK_GLOBAL_ID;

    delete process.env.TON_CENTER_API_KEY;

    expect(getDeployerNetworkConfig()).toEqual({
      network: "testnet",
      endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
      networkGlobalId: -3,
      testOnly: true,
      apiKey: undefined,
    });
  });

  it("uses mainnet endpoint and wallet global id for TON_NETWORK=mainnet", () => {
    process.env.TON_NETWORK = "mainnet";
    delete process.env.TON_CENTER_V2_ENDPOINT;
    delete process.env.TON_WALLET_NETWORK_GLOBAL_ID;

    expect(getDeployerNetworkConfig()).toEqual({
      network: "mainnet",
      endpoint: "https://toncenter.com/api/v2/jsonRPC",
      networkGlobalId: -239,
      testOnly: false,
      apiKey: undefined,
    });
  });

  it("passes TON_CENTER_API_KEY on to the client that does the reading", () => {
    process.env.TON_NETWORK = "mainnet";
    delete process.env.TON_CENTER_V2_ENDPOINT;
    process.env.TON_CENTER_API_KEY = "test-key";

    expect(getDeployerNetworkConfig().apiKey).toBe("test-key");
  });

  it("leaves the key out entirely when it is not configured", () => {
    process.env.TON_NETWORK = "mainnet";
    delete process.env.TON_CENTER_V2_ENDPOINT;
    process.env.TON_CENTER_API_KEY = "";

    expect(getDeployerNetworkConfig().apiKey).toBeUndefined();
  });

  it("rejects mainnet deployer config pointed at testnet endpoint", () => {
    process.env.TON_NETWORK = "mainnet";
    process.env.TON_CENTER_V2_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";

    expect(() => getDeployerNetworkConfig()).toThrow(
      "TON_NETWORK=mainnet cannot use a testnet TonCenter endpoint",
    );
  });

  it("rejects DEPLOYER_MNEMONIC env on mainnet before deploy", async () => {
    process.env.TON_NETWORK = "mainnet";
    process.env.DEPLOYER_MNEMONIC = "word ".repeat(24).trim();
    delete process.env.DEPLOYER_MNEMONIC_FILE;
    process.env.HARMONY_MASTER_ADDR = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

    await expect(
      deployCampaignOnchain({
        payoutAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
        goalAmountUsd: 100,
        deadlineUnix: 1780000000,
      }),
    ).rejects.toThrow("DEPLOYER_MNEMONIC env is forbidden on mainnet");
  });

  it("marks a failure before any transfer as DeployNotSentError", async () => {
    process.env.TON_NETWORK = "mainnet";
    process.env.DEPLOYER_MNEMONIC = "word ".repeat(24).trim();
    delete process.env.DEPLOYER_MNEMONIC_FILE;
    process.env.HARMONY_MASTER_ADDR = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

    await expect(
      deployCampaignOnchain({
        payoutAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
        goalAmountUsd: 100,
        deadlineUnix: 1780000000,
      }),
    ).rejects.toBeInstanceOf(DeployNotSentError);
  });

  it("requires DEPLOYER_MNEMONIC_FILE mode 0600 on mainnet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "donato-deployer-"));
    const file = join(dir, "mnemonic.txt");
    writeFileSync(file, "word ".repeat(24).trim());
    chmodSync(file, 0o644);
    process.env.TON_NETWORK = "mainnet";
    delete process.env.DEPLOYER_MNEMONIC;
    process.env.DEPLOYER_MNEMONIC_FILE = file;
    process.env.HARMONY_MASTER_ADDR = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

    try {
      await expect(
        deployCampaignOnchain({
          payoutAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
          goalAmountUsd: 100,
          deadlineUnix: 1780000000,
        }),
      ).rejects.toThrow("DEPLOYER_MNEMONIC_FILE must have 0600 permissions");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
