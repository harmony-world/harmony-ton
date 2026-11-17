// Owner closes a dead campaign and gets the deploy value back.
//
// A campaign that never took a donation is a dead end by construction: `Claim`
// asserts `anyRaised`, `Refund` asserts a donor exists. Whatever was attached at
// deploy stays on it forever. `CloseEmptyCampaign` is the way out — owner-signed,
// deadline-gated, and only for campaigns that are genuinely empty.
//
// The guards are what this file is really about: the happy path proves the branch
// works, and each refusal test is paired with that happy path so a green refusal
// cannot be confused with "the branch is dead".

import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

const CLOSE_GOAL:   uint64 = 1_000_000_000_000;  // 1000 TON — unreachable, so nothing ever funds
const CLOSE_DEPLOY: coins  = ton("0.15");        // what the deployer really attaches in production

// A registered campaign under a Master whose deployerWallet is set, which is the
// production shape: returned value must land on the deploy wallet, not in gasPool.
fun setupCloseEmpty(): (HarmonyMaster, Treasury, Treasury, HarmonyCampaign, uint32) {
    val owner      = testing.treasury("close_owner");
    val deployWlt  = testing.treasury("close_deploywallet");
    val recipient  = testing.treasury("close_recip");
    val usdtMaster = testing.treasury("close_usdtm");
    val usdtWallet = testing.treasury("close_usdtw");

    val master = HarmonyMaster.fromStorage({
        owner:          owner.address,
        platformWallet: owner.address,
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
    master.deploy(owner.address, { value: ton("0.5") });
    master.sendSetDeployerWallet(owner.address, deployWlt.address, { value: ton("0.05") });

    val deadline = (blockchain.now() + 86400) as uint32;
    master.sendDeployCampaign(
        owner.address, recipient.address, 0, CLOSE_GOAL, deadline, CLOSE_DEPLOY,
        usdtMaster.address, usdtWallet.address, owner.address,
        { value: ton("0.3") },
    );
    val campaign = HarmonyCampaign.fromAddress(master.get_campaign(0));
    return (master, owner, deployWlt, campaign, deadline);
}

// ── the point of the whole ticket ────────────────────────────────────────────

get fun `test owner closes an empty expired campaign and the value comes back`() {
    val (master, owner, deployWlt, campaign, deadline) = setupCloseEmpty();

    // The deploy value is really sitting there, otherwise the test below proves nothing.
    expect(testing.getAccountBalance(campaign.address)).toBeGreater(ton("0.1"));

    testing.setNow(deadline + 1);
    val before = testing.getAccountBalance(deployWlt.address);
    val res = master.sendCloseEmptyCampaign(owner.address, 0, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<CloseEmptyCampaign>({
        from: owner.address,
        to: master.address,
    });

    // The campaign is gone: DESTROY leaves nothing behind.
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);

    // …and the money walked the gas-return path to the deploy wallet.
    expect(testing.getAccountBalance(deployWlt.address) - before).toBeGreater(ton("0.1"));
}

// ── guard: a campaign that took money is not ours to destroy ─────────────────

get fun `test a campaign with a donation cannot be closed`() {
    val (master, owner, _, campaign, deadline) = setupCloseEmpty();
    val donor = testing.treasury("close_donor");

    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    expect(campaign.get_status().donorCount).toEqual(1);

    testing.setNow(deadline + 1);
    val res = master.sendCloseEmptyCampaign(owner.address, 0, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.CampaignNotEmpty,
    });

    // The donor's money is still where it belongs.
    expect(testing.getAccountBalance(campaign.address)).toBeGreater(ton("1"));
}

// ── guard: a campaign without donations yet is young, not dead ───────────────

get fun `test an empty campaign before its deadline cannot be closed`() {
    val (master, owner, _, campaign, _) = setupCloseEmpty();

    val res = master.sendCloseEmptyCampaign(owner.address, 0, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.DeadlineNotPassed,
    });
    expect(testing.getAccountBalance(campaign.address)).toBeGreater(ton("0.1"));
}

// ── guard: destroying a contract is an owner power, not a moderator one ──────

get fun `test a moderator cannot close a campaign`() {
    val (master, owner, _, campaign, deadline) = setupCloseEmpty();
    val moderator = testing.treasury("close_mod");

    master.sendAddModerator(owner.address, moderator.address, { value: ton("0.05") });
    expect(master.is_moderator(moderator.address)).toEqual(true);

    testing.setNow(deadline + 1);
    val res = master.sendCloseEmptyCampaign(moderator.address, 0, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: moderator.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
    expect(testing.getAccountBalance(campaign.address)).toBeGreater(ton("0.1"));

    // Negative control: the same call from the owner goes through, so the refusal
    // above is about the sender and not about the campaign's state.
    val ok = master.sendCloseEmptyCampaign(owner.address, 0, { value: ton("0.05") });
    expect(ok).toHaveSuccessfulTx<CloseEmptyCampaign>({
        from: owner.address,
        to: master.address,
    });
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
}

// ── guard: the order is only valid coming from Master ────────────────────────
//
// Master checks the sender before forwarding; this checks that the campaign does
// not take the word of anyone who reproduces the opcode.

get fun `test a stranger cannot order a campaign to close itself`() {
    val (_, _, _, campaign, deadline) = setupCloseEmpty();
    val stranger = testing.treasury("close_stranger");

    testing.setNow(deadline + 1);
    val res = campaign.sendCloseEmpty(stranger.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: stranger.address,
        to: campaign.address,
        exitCode: Errors.NotMaster,
    });
    expect(testing.getAccountBalance(campaign.address)).toBeGreater(ton("0.1"));
}

// ── guard: an id Master never deployed ───────────────────────────────────────

get fun `test closing an unknown campaign id is refused`() {
    val (master, owner, _, _, deadline) = setupCloseEmpty();

    testing.setNow(deadline + 1);
    val res = master.sendCloseEmptyCampaign(owner.address, 99, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: owner.address,
        to: master.address,
        exitCode: Errors.CampaignNotFound,
    });
}
