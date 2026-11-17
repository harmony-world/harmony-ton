// Extending a campaign deadline on chain.
//
// Before this branch the deadline was written to storage at deploy and nothing could
// change it. The admin panel could still "resume a campaign with a later deadline": the
// database row changed, the contract never learned about it, the app reopened donations
// and the chain reverted them with exit 109.
//
// The point of this file is not that the deadline can move, but what moving it cannot
// do. The deadline carries the recipient's right to claim what was raised even when the
// goal was not reached (`goalReached || (deadlinePassed && anyRaised)`), and that right
// appears the moment the deadline passes. Extending after that moment would take away a
// right that already exists — and lengthen the time donors' money stays locked. So an
// extension is free before the deadline and refused after it once the campaign has a
// donor.
//
// The donor's right to a refund is not part of this: `Refund` requires `STATUS_FROZEN`,
// so it comes from a freeze, not from an expired deadline.

import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

const EXTEND_GOAL:   uint64 = 1_000_000_000_000;  // 1000 TON — unreachable, the campaign never becomes FUNDED
const EXTEND_DEPLOY: coins  = ton("0.15");

fun setupExtend(): (HarmonyMaster, Treasury, HarmonyCampaign, uint32) {
    val owner      = testing.treasury("extend_owner");
    val deployWlt  = testing.treasury("extend_deploywallet");
    val recipient  = testing.treasury("extend_recip");
    val usdtMaster = testing.treasury("extend_usdtm");
    val usdtWallet = testing.treasury("extend_usdtw");

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
        owner.address, recipient.address, 0, EXTEND_GOAL, deadline, EXTEND_DEPLOY,
        usdtMaster.address, usdtWallet.address, owner.address,
        { value: ton("0.3") },
    );
    val campaign = HarmonyCampaign.fromAddress(master.get_campaign(0));
    return (master, owner, campaign, deadline);
}

// ── what the branch is for ───────────────────────────────────────────────────

get fun `test owner extends the deadline and the contract knows about it`() {
    val (master, owner, campaign, deadline) = setupExtend();
    val extended = (deadline + 7 * 86400) as uint32;

    val res = master.sendExtendCampaignDeadline(owner.address, 0, extended, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<ExtendCampaignDeadline>({
        from: owner.address,
        to: master.address,
    });

    // The getter is the only evidence worth anything here: it reads the very
    // storage field Donate checks the deadline against.
    expect(campaign.get_status().deadline).toEqual(extended);
}

get fun `test an expired campaign without donors takes donations again`() {
    val (master, owner, campaign, deadline) = setupExtend();
    val donor = testing.treasury("extend_late_donor");

    // The deadline has passed — the chain refuses the donation, while the app
    // would still offer to donate.
    testing.setNow(deadline + 1);
    val rejected = campaign.sendDonate(donor.address, 0, { value: ton("1") });
    expect(rejected).toHaveFailedTx({
        from: donor.address,
        to: campaign.address,
        exitCode: Errors.DeadlinePassed,
    });

    val extended = (blockchain.now() + 3 * 86400) as uint32;
    master.sendExtendCampaignDeadline(owner.address, 0, extended, { value: ton("0.05") });
    expect(campaign.get_status().deadline).toEqual(extended);

    // And the same donation now goes through — the extension worked on chain, not in a database.
    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    expect(campaign.get_status().donorCount).toEqual(1);
}

// ── what an extension cannot do ──────────────────────────────────────────────

get fun `test an expired campaign with donors cannot be extended`() {
    val (master, owner, campaign, deadline) = setupExtend();
    val donor = testing.treasury("extend_donor");

    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    expect(campaign.get_status().donorCount).toEqual(1);

    // After this line the recipient may claim what was raised, though the goal was not reached:
    // `goalReached || (deadlinePassed && anyRaised)`.
    testing.setNow(deadline + 1);
    val extended = (blockchain.now() + 7 * 86400) as uint32;
    val res = master.sendExtendCampaignDeadline(owner.address, 0, extended, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.DeadlineRightsAccrued,
    });
    expect(campaign.get_status().deadline).toEqual(deadline);

    // And the recipient keeps that right — otherwise the refusal above would be a formality.
    val recipient = testing.treasury("extend_recip");
    campaign.sendClaim(recipient.address, { value: ton("0.05") });
    expect(campaign.get_status().status).toEqual(STATUS_FUNDED);
}

get fun `test a campaign with donors is extendable while its deadline stands`() {
    val (master, owner, campaign, deadline) = setupExtend();
    val donor = testing.treasury("extend_early_donor");

    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    expect(campaign.get_status().donorCount).toEqual(1);

    // Control case for the test above: same donors, no refusal — so the refusal there
    // is about the passed deadline, not about having donors.
    val extended = (deadline + 7 * 86400) as uint32;
    master.sendExtendCampaignDeadline(owner.address, 0, extended, { value: ton("0.05") });
    expect(campaign.get_status().deadline).toEqual(extended);
}

get fun `test the deadline cannot be moved backwards`() {
    val (master, owner, campaign, deadline) = setupExtend();

    val shortened = (deadline - 3600) as uint32;
    val res = master.sendExtendCampaignDeadline(owner.address, 0, shortened, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.DeadlineNotExtended,
    });
    expect(campaign.get_status().deadline).toEqual(deadline);
}

get fun `test the new deadline must be in the future`() {
    val (master, owner, campaign, deadline) = setupExtend();

    // Later than the old deadline but already in the past: the campaign would stay
    // expired while the platform believed it extended — exactly the drift this prevents.
    testing.setNow(deadline + 10 * 86400);
    val stale = (deadline + 86400) as uint32;
    val res = master.sendExtendCampaignDeadline(owner.address, 0, stale, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.DeadlineNotExtended,
    });
    expect(campaign.get_status().deadline).toEqual(deadline);
}

get fun `test a frozen campaign cannot be extended`() {
    val (master, owner, campaign, deadline) = setupExtend();

    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });
    expect(campaign.get_status().status).toEqual(STATUS_FROZEN);

    val extended = (deadline + 7 * 86400) as uint32;
    val res = master.sendExtendCampaignDeadline(owner.address, 0, extended, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.CampaignNotActive,
    });
    expect(campaign.get_status().deadline).toEqual(deadline);
}

// ── who may extend ───────────────────────────────────────────────────────────

get fun `test a moderator cannot extend a deadline`() {
    val (master, owner, campaign, deadline) = setupExtend();
    val moderator = testing.treasury("extend_mod");

    master.sendAddModerator(owner.address, moderator.address, { value: ton("0.05") });
    expect(master.is_moderator(moderator.address)).toEqual(true);

    val extended = (deadline + 7 * 86400) as uint32;
    val res = master.sendExtendCampaignDeadline(moderator.address, 0, extended, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: moderator.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
    expect(campaign.get_status().deadline).toEqual(deadline);

    // Control: the same call from the owner goes through.
    master.sendExtendCampaignDeadline(owner.address, 0, extended, { value: ton("0.05") });
    expect(campaign.get_status().deadline).toEqual(extended);
}

get fun `test nobody but the master can move a campaign deadline`() {
    val (_, _, campaign, deadline) = setupExtend();
    val stranger = testing.treasury("extend_stranger");

    val extended = (deadline + 7 * 86400) as uint32;
    val res = campaign.sendExtendDeadline(stranger.address, extended, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: stranger.address,
        to: campaign.address,
        exitCode: Errors.NotMaster,
    });
    expect(campaign.get_status().deadline).toEqual(deadline);
}
