// The platform returns everyone's money after freezing a campaign.
//
// `Refund` is a pull: it refunds whoever sent it. A platform that froze a fraudulent
// campaign cannot wait for every donor to come back and ask, so this adds the push —
// owner freezes through Master, then orders a full refund, and the campaign walks its
// own donor list in batches until both dicts are empty.
//
// The prior state of this feature is the reason the guards below matter: the campaign
// had a working `Freeze` branch and a green test for it, while nothing in production
// could ever send that message. So every test here starts from the owner's wallet and
// goes through Master, the way it actually happens.

import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

const REFUND_GOAL:   uint64 = 1_000_000_000_000;  // 1000 TON — never reached, so nothing funds
const REFUND_DEPLOY: coins  = ton("0.5");         // enough balance to pay for the batch walk

fun setupRefund(): (HarmonyMaster, Treasury, HarmonyCampaign, uint32) {
    val owner      = testing.treasury("refund_owner");
    val recipient  = testing.treasury("refund_recip");
    val usdtMaster = testing.treasury("refund_usdtm");
    val usdtWallet = testing.treasury("refund_usdtw");

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
    master.deploy(owner.address, { value: ton("1") });

    val deadline = (blockchain.now() + 86400) as uint32;
    master.sendDeployCampaign(
        owner.address, recipient.address, 0, REFUND_GOAL, deadline, REFUND_DEPLOY,
        usdtMaster.address, usdtWallet.address, owner.address,
        { value: ton("1") },
    );
    val campaign = HarmonyCampaign.fromAddress(master.get_campaign(0));
    return (master, owner, campaign, deadline);
}

// ── the point of the whole ticket ────────────────────────────────────────────

get fun `test owner freezes and refunds every donor through the admin path`() {
    val (master, owner, campaign, _) = setupRefund();
    val d1 = testing.treasury("refund_d1");
    val d2 = testing.treasury("refund_d2");
    val d3 = testing.treasury("refund_d3");

    campaign.sendDonate(d1.address, 0, { value: ton("1") });
    campaign.sendDonate(d2.address, 0, { value: ton("2") });
    campaign.sendDonate(d3.address, 0, { value: ton("3") });
    expect(campaign.get_status().donorCount).toEqual(3);

    // Freeze first — the refund branch refuses to run on a live campaign.
    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });
    expect(campaign.get_status().status).toEqual(STATUS_FROZEN);

    val before1 = testing.getAccountBalance(d1.address);
    val before2 = testing.getAccountBalance(d2.address);
    val before3 = testing.getAccountBalance(d3.address);

    val res = master.sendRefundCampaign(owner.address, 0, { value: ton("0.1") });
    expect(res).toHaveSuccessfulTx<RefundCampaign>({
        from: owner.address,
        to: master.address,
    });

    // Everyone got back what they gave. PAY_FEES_SEPARATELY puts the forward fee on the
    // campaign, so the only thing missing is ~0.00002 TON that the receiving wallet
    // spends processing its own incoming message — outside the campaign's reach.
    expect(testing.getAccountBalance(d1.address) - before1).toBeGreater(ton("0.9999"));
    expect(testing.getAccountBalance(d2.address) - before2).toBeGreater(ton("1.9999"));
    expect(testing.getAccountBalance(d3.address) - before3).toBeGreater(ton("2.9999"));

    // Nothing is left to refund and nothing is left of the campaign.
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
}

// ── the batch actually continues itself ──────────────────────────────────────
//
// REFUND_BATCH_SIZE is 10, so 12 donors cannot fit in one message. If the
// self-continuation were broken, two donors would be silently left with nothing.

get fun `test more donors than one batch are all refunded`() {
    val (master, owner, campaign, _) = setupRefund();

    // Twelve named treasuries, unrolled: the emulator derives a treasury from a
    // literal seed, so there is no loop that can produce twelve distinct wallets.
    val m01 = testing.treasury("refund_many_01");
    val m02 = testing.treasury("refund_many_02");
    val m03 = testing.treasury("refund_many_03");
    val m04 = testing.treasury("refund_many_04");
    val m05 = testing.treasury("refund_many_05");
    val m06 = testing.treasury("refund_many_06");
    val m07 = testing.treasury("refund_many_07");
    val m08 = testing.treasury("refund_many_08");
    val m09 = testing.treasury("refund_many_09");
    val m10 = testing.treasury("refund_many_10");
    val m11 = testing.treasury("refund_many_11");
    val m12 = testing.treasury("refund_many_12");

    campaign.sendDonate(m01.address, 0, { value: ton("1") });
    campaign.sendDonate(m02.address, 0, { value: ton("1") });
    campaign.sendDonate(m03.address, 0, { value: ton("1") });
    campaign.sendDonate(m04.address, 0, { value: ton("1") });
    campaign.sendDonate(m05.address, 0, { value: ton("1") });
    campaign.sendDonate(m06.address, 0, { value: ton("1") });
    campaign.sendDonate(m07.address, 0, { value: ton("1") });
    campaign.sendDonate(m08.address, 0, { value: ton("1") });
    campaign.sendDonate(m09.address, 0, { value: ton("1") });
    campaign.sendDonate(m10.address, 0, { value: ton("1") });
    campaign.sendDonate(m11.address, 0, { value: ton("1") });
    campaign.sendDonate(m12.address, 0, { value: ton("1") });
    expect(campaign.get_status().donorCount).toEqual(12);

    val beforeLast = testing.getAccountBalance(m12.address);

    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });
    master.sendRefundCampaign(owner.address, 0, { value: ton("0.1") });

    // The contract is gone, which can only happen after the last donor was paid —
    // and the twelfth donor, the one past the batch boundary, has his TON back.
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
    expect(testing.getAccountBalance(m12.address) - beforeLast).toBeGreater(ton("0.9999"));
    expect(testing.getAccountBalance(m11.address)).toBeGreater(ton("0.9"));
}

// ── guard: refunding a live campaign is not a thing ──────────────────────────

get fun `test an active campaign cannot be refunded`() {
    val (master, owner, campaign, _) = setupRefund();
    val donor = testing.treasury("refund_active_donor");
    campaign.sendDonate(donor.address, 0, { value: ton("1") });

    val res = master.sendRefundCampaign(owner.address, 0, { value: ton("0.1") });
    expect(res).toHaveFailedTx({
        from: master.address,
        to: campaign.address,
        exitCode: Errors.NotFrozen,
    });
    expect(campaign.get_status().donorCount).toEqual(1);

    // Negative control: freeze it and the same order goes through, so the refusal is
    // about the status and not about the branch being dead.
    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });
    master.sendRefundCampaign(owner.address, 0, { value: ton("0.1") });
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
}

// ── guard: moving other people's money is an owner power ─────────────────────

get fun `test a moderator can neither freeze nor refund`() {
    val (master, owner, campaign, _) = setupRefund();
    val moderator = testing.treasury("refund_mod");
    val donor     = testing.treasury("refund_mod_donor");

    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    master.sendAddModerator(owner.address, moderator.address, { value: ton("0.05") });
    expect(master.is_moderator(moderator.address)).toEqual(true);

    val frozenRes = master.sendFreezeCampaign(moderator.address, 0, { value: ton("0.05") });
    expect(frozenRes).toHaveFailedTx({
        from: moderator.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
    expect(campaign.get_status().status).toEqual(STATUS_ACTIVE);

    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });
    val refundRes = master.sendRefundCampaign(moderator.address, 0, { value: ton("0.1") });
    expect(refundRes).toHaveFailedTx({
        from: moderator.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
    expect(campaign.get_status().donorCount).toEqual(1);
}

// ── guard: the campaign takes the order only from Master or itself ───────────

get fun `test a stranger cannot start a refund on the campaign directly`() {
    val (master, owner, campaign, _) = setupRefund();
    val donor    = testing.treasury("refund_str_donor");
    val stranger = testing.treasury("refund_stranger");

    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });

    val res = campaign.sendRefundBatch(stranger.address, { value: ton("0.1") });
    expect(res).toHaveFailedTx({
        from: stranger.address,
        to: campaign.address,
        exitCode: Errors.NotMaster,
    });
    expect(campaign.get_status().donorCount).toEqual(1);
}

// ── guard: an id Master never deployed ───────────────────────────────────────

get fun `test freezing an unknown campaign id is refused`() {
    val (master, owner, _, _) = setupRefund();

    val res = master.sendFreezeCampaign(owner.address, 99, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: owner.address,
        to: master.address,
        exitCode: Errors.CampaignNotFound,
    });
}

// ── unfreeze is the way back ─────────────────────────────────────────────────

get fun `test owner unfreezes a campaign and donations resume`() {
    val (master, owner, campaign, _) = setupRefund();
    val donor = testing.treasury("refund_unfreeze_donor");

    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });
    expect(campaign.get_status().status).toEqual(STATUS_FROZEN);

    master.sendUnfreezeCampaign(owner.address, 0, { value: ton("0.05") });
    expect(campaign.get_status().status).toEqual(STATUS_ACTIVE);

    campaign.sendDonate(donor.address, 0, { value: ton("1") });
    expect(campaign.get_status().donorCount).toEqual(1);
}

// ── the pull path is untouched insurance ─────────────────────────────────────
//
// The push must not take away the donor's own way out, which is the
// only thing that works if the owner key is ever lost.

get fun `test a donor can still pull their own refund after the freeze`() {
    val (master, owner, campaign, _) = setupRefund();
    val d1 = testing.treasury("refund_pull_d1");
    val d2 = testing.treasury("refund_pull_d2");

    campaign.sendDonate(d1.address, 0, { value: ton("1") });
    campaign.sendDonate(d2.address, 0, { value: ton("2") });
    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });

    val before = testing.getAccountBalance(d1.address);
    campaign.sendRefund(d1.address, { value: ton("0.05") });
    expect(testing.getAccountBalance(d1.address) - before).toBeGreater(ton("0.9"));
    expect(campaign.get_status().donorCount).toEqual(1);

    // …and the push finishes whoever did not come back.
    val before2 = testing.getAccountBalance(d2.address);
    master.sendRefundCampaign(owner.address, 0, { value: ton("0.1") });
    expect(testing.getAccountBalance(d2.address) - before2).toBeGreater(ton("1.9999"));
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
}

// ── the worst case the batch size has to survive ─────────────────────────────
//
// A USDT donor costs two outgoing messages (the TON leg is zero, but the jetton
// transfer is a full message with 0.05 TON attached), so a batch of USDT-only donors
// is twice the work of a batch of TON donors. This is the case that sets the ceiling
// on REFUND_BATCH_SIZE; if it ever stops fitting, the constant is what moves.

get fun `test a full batch of USDT-only donors is refunded`() {
    val (master, owner, _, _) = setupRefund();
    val usdtWallet = testing.treasury("refund_usdtw");
    val usdtMaster = testing.treasury("refund_usdtm");
    val recipient  = testing.treasury("refund_recip");

    // A second campaign with the production deploy value: 0.15 TON. Twelve jetton legs
    // cost 0.6, so this campaign provably cannot pay for its own refund — which is the
    // whole point of the test.
    val deadline2 = (blockchain.now() + 86400) as uint32;
    master.sendDeployCampaign(
        owner.address, recipient.address, 0, REFUND_GOAL, deadline2, ton("0.15"),
        usdtMaster.address, usdtWallet.address, owner.address,
        { value: ton("0.3") },
    );
    val campaign = HarmonyCampaign.fromAddress(master.get_campaign(1));

    val u01 = testing.treasury("refund_u01");
    val u02 = testing.treasury("refund_u02");
    val u03 = testing.treasury("refund_u03");
    val u04 = testing.treasury("refund_u04");
    val u05 = testing.treasury("refund_u05");
    val u06 = testing.treasury("refund_u06");
    val u07 = testing.treasury("refund_u07");
    val u08 = testing.treasury("refund_u08");
    val u09 = testing.treasury("refund_u09");
    val u10 = testing.treasury("refund_u10");
    val u11 = testing.treasury("refund_u11");
    val u12 = testing.treasury("refund_u12");

    campaign.sendTransferNotification(usdtWallet.address, 0, 1_000_000, u01.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 1, 1_000_000, u02.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 2, 1_000_000, u03.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 3, 1_000_000, u04.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 4, 1_000_000, u05.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 5, 1_000_000, u06.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 6, 1_000_000, u07.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 7, 1_000_000, u08.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 8, 1_000_000, u09.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 9, 1_000_000, u10.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 10, 1_000_000, u11.address, { value: ton("0.01") });
    campaign.sendTransferNotification(usdtWallet.address, 11, 1_000_000, u12.address, { value: ton("0.01") });
    expect(campaign.get_status().donorCount).toEqual(12);

    val beforeWallet = testing.getAccountBalance(usdtWallet.address);

    // The campaign holds its deploy fee plus 12 x 0.01 forward value — far less than the
    // 12 x 0.05 the jetton legs cost. The owner funds the walk by attaching to the order;
    // CARRY_REMAINING_VALUE passes the whole thing through Master to the campaign.
    expect(testing.getAccountBalance(campaign.address)).toBeLess(ton("0.4"));

    master.sendFreezeCampaign(owner.address, 1, { value: ton("0.05") });
    master.sendRefundCampaign(owner.address, 1, { value: ton("1.5") });

    // All twelve jetton transfers left: each carries 0.05 TON to the campaign's own
    // jetton wallet, so the wallet is up by roughly 0.6 TON and the campaign is gone.
    expect(testing.getAccountBalance(usdtWallet.address) - beforeWallet).toBeGreater(ton("0.5"));
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
}

// ── the campaign says which kind of ending this was ──────────────────────────
//
// A campaign's last act is to send its balance to Master and destroy itself. A claimed
// campaign does the same thing. Off-chain the two are only distinguishable by the opcode
// on that final message — and the `refunded` status in the database is written from it.
// So this checks the ending is reported as a refund, and that Master accepts it: if it
// did not, the final message would bounce and the leftover gas would be stranded.

get fun `test the last message of a refunded campaign is CampaignRefunded`() {
    val (master, owner, campaign, _) = setupRefund();
    val d1 = testing.treasury("refund_end_d1");

    campaign.sendDonate(d1.address, 0, { value: ton("1") });
    master.sendFreezeCampaign(owner.address, 0, { value: ton("0.05") });

    // No deployer wallet is configured in this setup, so an accepted return lands in
    // gasPool. That makes the pool the proof that Master took the message rather than
    // throwing it back.
    expect(master.gasPool()).toEqual(0);

    val res = master.sendRefundCampaign(owner.address, 0, { value: ton("0.1") });
    expect(res).toHaveSuccessfulTx<CampaignRefunded>({
        from: campaign.address,
        to: master.address,
    });

    expect(master.gasPool()).toBeGreater(0);
    expect(testing.getAccountBalance(campaign.address)).toEqual(0);
}
