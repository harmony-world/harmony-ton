import type pino from "pino";
import { Cell } from "@ton/core";
import type { TonCenterClient, TonTransaction } from "./ton-api.js";

export async function verifyCampaignMaster(input: {
  client: TonCenterClient;
  campaignAddr: string;
  expectedMaster: string;
  testnet: boolean;
  toFriendly: (addr: string) => string;
  log: pino.Logger;
}): Promise<boolean | null> {
  try {
    const result = await input.client.runGetMethod(input.campaignAddr, "master");
    if (result.exit_code !== 0 || !result.stack?.length) return false;
    const entry = result.stack[0] as { type?: string; value?: string };
    if (entry.type !== "cell" || !entry.value) return false;
    const cell = Cell.fromBase64(entry.value);
    const addr = cell.beginParse().loadAddress();
    const masterFriendly = addr.toString({ testOnly: input.testnet });
    return input.toFriendly(masterFriendly) === input.toFriendly(input.expectedMaster);
  } catch (err) {
    input.log.warn({ campaignAddr: input.campaignAddr, err }, "verifyCampaignMaster: getter call failed");
    return null;
  }
}

export async function handleDeployCampaignEvent(input: {
  client: TonCenterClient;
  contractAddr: string;
  raw: TonTransaction;
  testnet: boolean;
  toFriendly: (addr: string) => string;
  verifyCampaignMaster?: (campaignAddr: string, expectedMaster: string) => Promise<boolean | null>;
  addCampaign: (addr: string) => Promise<void>;
  log: pino.Logger;
}): Promise<void> {
  const campaignAddr = input.raw.out_msgs?.[0]?.destination ?? null;
  if (campaignAddr) {
    const verified = input.verifyCampaignMaster
      ? await input.verifyCampaignMaster(campaignAddr, input.contractAddr)
      : await verifyCampaignMaster({
          client: input.client,
          campaignAddr,
          expectedMaster: input.contractAddr,
          testnet: input.testnet,
          toFriendly: input.toFriendly,
          log: input.log,
        });
    if (verified !== false) {
      if (verified === null) {
        input.log.warn(
          { contractAddr: input.contractAddr, campaignAddr, txHash: input.raw.hash },
          "DeployCampaign: master() verification unavailable, adding campaign from trusted master event",
        );
      }
      await input.addCampaign(campaignAddr);
    } else {
      input.log.warn(
        { contractAddr: input.contractAddr, campaignAddr, txHash: input.raw.hash },
        "DeployCampaign: master() verification failed, skipping",
      );
    }
  }
  input.log.info({ contractAddr: input.contractAddr, campaignAddr, txHash: input.raw.hash }, "DeployCampaign detected on master");
}
