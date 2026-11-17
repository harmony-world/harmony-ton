// Reproduction tests for findings of a contract audit.
//
// These are not behaviour tests for a feature — they are the proofs attached to
// audit findings. They are kept in their own file so the gas-return suite stays
// readable and so nobody mistakes a deliberately broken scenario for expected
// behaviour.

import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

// ── A-01: a bounced gas return must not rewind a campaign already paid out ────
//
// Claim sends three bounceable messages: the jetton transfer, the TON payout and
// the gas return. `onBouncedMessage` used to react to all of them alike —
// any bounce flipped STATUS_FUNDED back to STATUS_ACTIVE and zeroed deployFee.
//
// The fix changed that; this test was inverted along with the fix and now guards the
// finding instead of demonstrating it. The scenario is unchanged: the campaign is
// built with a campaignId that Master's registry does not know, so Master answers
// the gas return with CampaignNotFound and the message bounces. That is the
// mechanism; in production the same bounce is reached through a misconfigured
// deployerWallet.
//
// The reading of the fix — which leg is which, and why the payout leg must still
// reopen the campaign — lives in `ClaimBounce.test.tolk`.

fun setupUnregisteredCampaign(): (HarmonyMaster, HarmonyCampaign, Treasury, Treasury) {
    val deployer   = testing.treasury("repro_deployer");
    val recipient  = testing.treasury("repro_recip");
    val usdtMaster = testing.treasury("repro_usdtm");
    val usdtWallet = testing.treasury("repro_usdtw");
    val donor      = testing.treasury("repro_donor");

    val master = HarmonyMaster.fromStorage({
        owner:          deployer.address,
        platformWallet: deployer.address,
        tipBps:         0,
        campaignCount:  0,
        campaignCode:   build("HarmonyCampaign"),
        campaigns:      null,
        moderators:     null,
        strayFunds:     0,
        gasPool:        0,
        extra: MasterExtra {
            usdtMasterAddress: usdtMaster.address,
        }.toCell(),
    });
    master.deploy(deployer.address, { value: ton("0.1") });

    // campaignId 99 is deliberately absent from Master's registry.
    val campaign = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 99,
        recipient:  recipient.address,
        goalUsdt:   0,
        goalTon:    ton("1") as uint64,
        deadline:   blockchain.now() + 86400,
        tipBps:     0,
        deployFee:  ton("0.3"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     STATUS_ACTIVE,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster.address,
                usdtJettonWallet:  usdtWallet.address,
                platformWallet:    deployer.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    campaign.deploy(deployer.address, { value: ton("0.3") });
    campaign.sendDonate(donor.address, 0, { value: ton("1.1") });

    return (master, campaign, deployer, recipient);
}

get fun `test A-01 a bounced gas return does not reopen an already paid campaign`() {
    val (_, campaign, _, recipient) = setupUnregisteredCampaign();

    val before = testing.getAccountBalance(recipient.address);
    campaign.sendClaim(recipient.address, { value: ton("0.05") });
    val after = testing.getAccountBalance(recipient.address);

    // The recipient really was paid: the payout leg succeeded.
    expect(after - before).toBeGreater(ton("0.9"));

    // Before the fix this read STATUS_ACTIVE — the campaign looked unclaimed while
    // the money was already gone, which is the whole of finding A-01.
    val status = campaign.get_status();
    expect(status.status).toEqual(STATUS_FUNDED);
}

// ── A-02: MasterStorage survives worst-case coins values ─────────────────────
//
// TSA reports cell-overflow (exit 8) on HarmonyMaster when it invents a C4 that
// is already fuller than the real layout can ever be. The layout is fixed-width,
// so the inline part is bounded; this pins that bound down with the largest
// values `coins` can hold instead of trusting the arithmetic on paper.

get fun `test A-02 master storage packs with maximum coins values`() {
    val deployer   = testing.treasury("reprob_deployer");
    val usdtMaster = testing.treasury("reprob_usdtm");

    // More nanotons than TON will ever have (total supply ~5.1e9 TON), so this is
    // above every value the two counters can actually reach on-chain.
    val maxCoins = 5_100_000_000_000_000_000;  // 5.1e9 TON in nanotons

    val master = HarmonyMaster.fromStorage({
        owner:          deployer.address,
        platformWallet: deployer.address,
        tipBps:         1500,
        campaignCount:  0xFFFFFFFFFFFFFFFF,
        campaignCode:   build("HarmonyCampaign"),
        campaigns:      null,
        moderators:     null,
        strayFunds:     maxCoins as coins,
        gasPool:        maxCoins as coins,
        extra: MasterExtra {
            usdtMasterAddress: usdtMaster.address,
            deployerWallet:    deployer.address,
        }.toCell(),
    });
    val res = master.deploy(deployer.address, { value: ton("0.1") });
    expect(res).toHaveSuccessfulDeploy({ to: master.address });

    // Reading back proves the cell packed and unpacked at full width.
    // The deploy value itself lands in strayFunds via the empty-body branch,
    // which is also a live check that that branch still credits strayFunds.
    expect(master.strayFunds()).toEqual((maxCoins + ton("0.1")) as coins);
    expect(master.gasPool()).toEqual(maxCoins as coins);
    expect(master.campaignCount()).toEqual(0xFFFFFFFFFFFFFFFF);
}
