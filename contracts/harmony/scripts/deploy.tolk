import "@acton/io"
import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

// Returns campaign goal in nanoTON (Phase 0: TON, Phase 1+: nUSDT 1e6)
fun deployCampaign(
    master:       HarmonyMaster,
    from:         address,
    goalNano:     uint64,
    deadlineUnix: uint32,
): void {
    val res = master.sendDeployCampaign(
        from,
        from,          // recipient = deployer for testnet
        0,             // USDT goal disabled in TON-only smoke campaigns
        goalNano,      // TON goal in nanotons
        deadlineUnix,
        ton("0.08"),   // deployValue forwarded to child campaign
        from,
        from,
        from,
        { value: ton("0.15") },
    );
    val trace = res.waitForTrace();
    if (trace == null) {
        println("  ERROR: campaign deploy tx not confirmed");
    }
}

fun main() {
    val deployer = scripts.wallet("deployer");

    // ── 1. Deploy HarmonyMaster ───────────────────────────────────────────────

    val master = HarmonyMaster.fromStorage({
        owner:          deployer.address,
        platformWallet: deployer.address,
        tipBps:         100,
        campaignCount:  0,
        campaignCode:   build("HarmonyCampaign"),
        campaigns:      null,
        moderators:     null,
        strayFunds:  0,
        gasPool:        0,
        extra: MasterExtra {
            usdtMasterAddress: deployer.address,
        }.toCell(),
    });

    val masterDeploy = master.deploy(deployer.address, { value: ton("0.1") });
    if (masterDeploy.waitForFirstTransaction() == null) {
        println("ERROR: HarmonyMaster deploy failed");
        return;
    }
    println("HarmonyMaster: {}", master.address);

    val now = blockchain.now() as uint32;

    // ── 2. Deploy 5 test campaigns ────────────────────────────────────────────
    // Campaign 0 — smoke-test target: tiny goal, 30-day deadline
    println("Deploying campaign 0 (smoke-test, goal=0.2 TON, deadline=30d)...");
    deployCampaign(master, deployer.address, 200_000_000, now + 86400 * 30);

    // Campaign 1 — medium goal
    println("Deploying campaign 1 (goal=1 TON, deadline=60d)...");
    deployCampaign(master, deployer.address, 1_000_000_000, now + 86400 * 60);

    // Campaign 2 — large goal
    println("Deploying campaign 2 (goal=5 TON, deadline=90d)...");
    deployCampaign(master, deployer.address, 5_000_000_000, now + 86400 * 90);

    // Campaign 3 — short deadline
    println("Deploying campaign 3 (goal=0.5 TON, deadline=7d)...");
    deployCampaign(master, deployer.address, 500_000_000, now + 86400 * 7);

    // Campaign 4 — long deadline
    println("Deploying campaign 4 (goal=2 TON, deadline=180d)...");
    deployCampaign(master, deployer.address, 2_000_000_000, now + 86400 * 180);

    val campaignCount = master.campaignCount();
    println("Campaigns deployed: {}", campaignCount);

    // ── 3. Smoke test: donate → get_status → claim on campaign 0 ─────────────
    val c0addr = master.get_campaign(0);
    println("Campaign 0 address: {}", c0addr);
    val c0 = HarmonyCampaign.fromAddress(c0addr);

    // Donate 0.5 TON — after 1% tip net = 0.495 TON > goal 0.2 TON
    println("Smoke test: donating 0.5 TON to campaign 0...");
    val donateRes = c0.sendDonate(deployer.address, { value: ton("0.5") });
    if (donateRes.waitForFirstTransaction() == null) {
        println("ERROR: donate failed");
        return;
    }

    val afterDonate = c0.get_status();
    println("After donate  — raised={} goal={} status={} donors={}",
        afterDonate.raisedTon,
        afterDonate.goalTon,
        afterDonate.status,
        afterDonate.donorCount,
    );

    // Claim: deployer == recipient; goal is reached
    println("Smoke test: claiming campaign 0...");
    val claimRes = c0.sendClaim(deployer.address, { value: ton("0.05") });
    if (claimRes.waitForFirstTransaction() == null) {
        println("ERROR: claim failed");
        return;
    }

    val afterClaim = c0.get_status();
    println("After claim   — status={} (1=FUNDED expected)", afterClaim.status);

    // ── 4. Print all campaign addresses ──────────────────────────────────────
    println("");
    println("=== Testnet addresses ===");
    println("HarmonyMaster: {}", master.address);
    println("Campaign 0 (smoke): {}", master.get_campaign(0));
    println("Campaign 1:         {}", master.get_campaign(1));
    println("Campaign 2:         {}", master.get_campaign(2));
    println("Campaign 3:         {}", master.get_campaign(3));
    println("Campaign 4:         {}", master.get_campaign(4));
}
