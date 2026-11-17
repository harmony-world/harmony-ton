// Standalone smoke test: donate → get_status → claim on an existing campaign.
//
// Required env vars:
//   MASTER_ADDRESS   — deployed HarmonyMaster address
//   CAMPAIGN_ID      — campaign index to test (default: 0)
//
// Usage:
//   acton script scripts/smoke-test.tolk --net testnet

import "@acton/io"
import "@acton/env"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    val masterAddr = env<address>("MASTER_ADDRESS");
    if (masterAddr == null) {
        println("ERROR: MASTER_ADDRESS env var is required");
        return;
    }
    val campaignId = env<int>("CAMPAIGN_ID") ?? 0;

    val master = HarmonyMaster.fromAddress(masterAddr!);
    val campaignAddr = master.get_campaign(campaignId as uint64);
    val campaign = HarmonyCampaign.fromAddress(campaignAddr);

    println("Master:   {}", master.address);
    println("Campaign {}: {}", campaignId, campaignAddr);

    val before = campaign.get_status();
    println("Before donate — raised={} goal={} status={} donors={}",
        before.raisedTon,
        before.goalTon,
        before.status,
        before.donorCount,
    );

    val donateValue = before.goalTon * 11000 / 10000;  // 110% of TON goal
    println("Donating {} nanoTON (110%% of goal)...", donateValue);

    val donateRes = campaign.sendDonate(deployer.address, { value: donateValue as coins });
    if (donateRes.waitForFirstTransaction() == null) {
        println("ERROR: donate failed");
        return;
    }

    val afterDonate = campaign.get_status();
    println("After donate  — raised={} goal={} status={} donors={}",
        afterDonate.raisedTon,
        afterDonate.goalTon,
        afterDonate.status,
        afterDonate.donorCount,
    );

    if (afterDonate.raisedTon < afterDonate.goalTon) {
        println("Goal not yet reached — skipping claim");
        return;
    }

    println("Claiming...");
    val claimRes = campaign.sendClaim(deployer.address, { value: ton("0.05") });
    if (claimRes.waitForFirstTransaction() == null) {
        println("ERROR: claim failed");
        return;
    }

    val afterClaim = campaign.get_status();
    println("After claim   — status={} (1=FUNDED expected)", afterClaim.status);
    println("Smoke test PASSED");
}
