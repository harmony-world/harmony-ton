import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@stdlib/tvm-dicts"

import "@contracts/types"
import "@wrappers/HarmonyCampaign.gen"

// ── helpers ──────────────────────────────────────────────────────────────────

// Deadline far in the future (unix 2037-01-01).
const DEADLINE_FUTURE: uint32 = 2114380800;

// Deadline in the past (unix 2001-09-09).
const DEADLINE_PAST: uint32 = 1000000000;

// 1000 TON in nanotons — default TON goal.
const GOAL: uint64 = 1000_000_000_000;

// 1000 USDT in nUSDT (1e6 units) — default USDT goal.
const GOAL_USDT: uint64 = 1000_000_000;

// Donate 100 TON; tipBps=100 means 1 TON tip, 99 TON raised.
const TIP_BPS: uint32 = 100;

fun setupCampaign(): (HarmonyCampaign, Treasury, Treasury, Treasury) {
    val master       = testing.treasury("master");
    val recipient    = testing.treasury("recipient");
    val other        = testing.treasury("other");
    val usdtMaster   = testing.treasury("usdtMaster");
    val usdtWallet   = testing.treasury("usdtWallet");

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 0,
        recipient:  recipient.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,  // STATUS_ACTIVE
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster.address,
                usdtJettonWallet:  usdtWallet.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    val res = contract.deploy(master.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, master, recipient, other);
}

// Returns (campaign, master, recipient, donor, usdtWallet) for USDT-specific tests.
fun setupUsdtCampaign(): (HarmonyCampaign, Treasury, Treasury, Treasury, Treasury) {
    val master       = testing.treasury("umaster");
    val recipient    = testing.treasury("urecipient");
    val donor        = testing.treasury("udonor");
    val usdtMaster   = testing.treasury("uusdtMaster");
    val usdtWallet   = testing.treasury("uusdtWallet");

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 1,
        recipient:  recipient.address,
        goalUsdt:   GOAL_USDT,
        goalTon:    0,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.5"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,  // STATUS_ACTIVE
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster.address,
                usdtJettonWallet:  usdtWallet.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    val res = contract.deploy(master.address, { value: ton("0.5") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, master, recipient, donor, usdtWallet);
}

fun setupCampaignWithPastDeadline(): (HarmonyCampaign, Treasury, Treasury, Treasury) {
    val master       = testing.treasury("master2");
    val recipient    = testing.treasury("recipient2");
    val other        = testing.treasury("other2");
    val usdtMaster   = testing.treasury("usdtMaster2");
    val usdtWallet   = testing.treasury("usdtWallet2");

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 2,
        recipient:  recipient.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_PAST,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster.address,
                usdtJettonWallet:  usdtWallet.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    val res = contract.deploy(master.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, master, recipient, other);
}

// ── deploy ────────────────────────────────────────────────────────────────────

get fun `test deploy sets initial master`() {
    val (contract, master, _, _) = setupCampaign();
    expect(contract.master()).toEqual(master.address);
}

get fun `test deploy stores campaignId`() {
    val (contract, _, _, _) = setupCampaign();
    expect(contract.campaignId()).toEqual(0);
}

get fun `test deploy sets raisedTon to zero`() {
    val (contract, _, _, _) = setupCampaign();
    expect(contract.raisedTon()).toEqual(0);
}

get fun `test deploy sets raisedUsdt to zero`() {
    val (contract, _, _, _) = setupCampaign();
    expect(contract.raisedUsdt()).toEqual(0);
}

get fun `test deploy sets status to ACTIVE`() {
    val (contract, _, _, _) = setupCampaign();
    expect(contract.status()).toEqual(0);
}

// ── donate ────────────────────────────────────────────────────────────────────

get fun `test donate increments raisedTon`() {
    val (contract, _, _, donor) = setupCampaign();

    val res = contract.sendDonate(donor.address, 100, { value: ton("100") });
    expect(res).toHaveSuccessfulTx<Donate>({
        from: donor.address,
        to: contract.address,
    });

    // tip = 1%, donation = 99 TON net
    val expectedRaised: coins = ton("100") - ton("100") * TIP_BPS / 10000;
    expect(contract.raisedTon()).toEqual(expectedRaised);
    // USDT field stays zero on TON donation
    expect(contract.raisedUsdt()).toEqual(0);
}

get fun `test donate increments donorCount`() {
    val (contract, _, _, donor) = setupCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("10") });

    val st = contract.get_status();
    expect(st.donorCount).toEqual(1);
}

get fun `test donate same donor counted once`() {
    val (contract, _, _, donor) = setupCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("10") });
    contract.sendDonate(donor.address, 100, { value: ton("10") });

    val st = contract.get_status();
    expect(st.donorCount).toEqual(1);  // same donor donates twice
}

get fun `test donate sends tip to master`() {
    val (contract, master, _, donor) = setupCampaign();

    val masterBalanceBefore = testing.getAccountBalance(master.address);
    contract.sendDonate(donor.address, 100, { value: ton("100") });
    val masterBalanceAfter = testing.getAccountBalance(master.address);

    // master should have received ~1 TON tip (minus gas overhead)
    val tipAmount = ton("100") * TIP_BPS / 10000;
    expect(masterBalanceAfter - masterBalanceBefore).toBeGreaterOrEqual(tipAmount - ton("0.01"));
}

get fun `test donate fails when campaign not active (frozen)`() {
    val (contract, master, _, donor) = setupCampaign();

    contract.sendFreeze(master.address, { value: ton("0.05") });

    val res = contract.sendDonate(donor.address, 100, { value: ton("10") });
    expect(res).toHaveFailedTx({
        from: donor.address,
        to: contract.address,
        exitCode: Errors.CampaignNotActive,
    });
}

get fun `test donate fails after deadline`() {
    val (contract, _, _, donor) = setupCampaignWithPastDeadline();

    val res = contract.sendDonate(donor.address, 100, { value: ton("10") });
    expect(res).toHaveFailedTx({
        from: donor.address,
        to: contract.address,
        exitCode: Errors.DeadlinePassed,
    });
}

// ── user-selectable tipBps ────────────────────────────────────────────────────

get fun `test donate with tipBps 0 sends no tip`() {
    val (contract, master, _, donor) = setupCampaign();

    val masterBalanceBefore = testing.getAccountBalance(master.address);
    contract.sendDonate(donor.address, 0, { value: ton("100") });
    val masterBalanceAfter = testing.getAccountBalance(master.address);

    // master should receive no tip (only gas dust)
    expect(masterBalanceAfter - masterBalanceBefore).toBeLess(ton("0.01"));

    // full 100 TON should go to raisedTon (minus gas)
    expect(contract.raisedTon()).toEqual(ton("100"));
}

get fun `test donate with tipBps 1500 sends 15 pct tip`() {
    val (contract, master, _, donor) = setupCampaign();

    val masterBalanceBefore = testing.getAccountBalance(master.address);
    contract.sendDonate(donor.address, 1500, { value: ton("100") });
    val masterBalanceAfter = testing.getAccountBalance(master.address);

    // master should receive ~15 TON tip
    val expectedTip = ton("100") * 1500 / 10000;
    expect(masterBalanceAfter - masterBalanceBefore).toBeGreaterOrEqual(expectedTip - ton("0.01"));

    // raised = 100 - 15 = 85 TON
    val expectedRaised = ton("100") - expectedTip;
    expect(contract.raisedTon()).toEqual(expectedRaised);
}

get fun `test donate with tipBps 500 sends 5 pct tip`() {
    val (contract, master, _, donor) = setupCampaign();

    val masterBalanceBefore = testing.getAccountBalance(master.address);
    contract.sendDonate(donor.address, 500, { value: ton("100") });
    val masterBalanceAfter = testing.getAccountBalance(master.address);

    val expectedTip = ton("100") * 500 / 10000;
    expect(masterBalanceAfter - masterBalanceBefore).toBeGreaterOrEqual(expectedTip - ton("0.01"));

    val expectedRaised = ton("100") - expectedTip;
    expect(contract.raisedTon()).toEqual(expectedRaised);
}

get fun `test donate with tipBps above 1500 fails`() {
    val (contract, _, _, donor) = setupCampaign();

    val res = contract.sendDonate(donor.address, 1501, { value: ton("10") });
    expect(res).toHaveFailedTx({
        from: donor.address,
        to: contract.address,
        exitCode: Errors.InvalidTipBps,
    });
}

// ── claim ─────────────────────────────────────────────────────────────────────

get fun `test claim succeeds when goal reached`() {
    val (contract, master, recipient, donor) = setupCampaign();

    // donate enough to reach goal: 1011 * 0.99 ≈ 1000.89 TON net > GOAL 1000 TON
    contract.sendDonate(donor.address, 100, { value: ton("1011") });

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Claim>({
        from: recipient.address,
        to: contract.address,
    });

    expect(contract.status()).toEqual(1);  // STATUS_FUNDED
}

get fun `test claim transfers all balance to recipient`() {
    val (contract, _, recipient, donor) = setupCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("1011") });

    val balanceBefore = testing.getAccountBalance(recipient.address);
    contract.sendClaim(recipient.address, { value: ton("0.05") });
    val balanceAfter = testing.getAccountBalance(recipient.address);

    // recipient should receive > 900 TON (net donation minus gas)
    expect(balanceAfter - balanceBefore).toBeGreater(ton("900"));
}

get fun `test claim fails if not recipient`() {
    val (contract, _, _, other) = setupCampaign();

    testing.topUp(other.address, ton("1010"));
    contract.sendDonate(other.address, 100, { value: ton("1010") });

    val res = contract.sendClaim(other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: contract.address,
        exitCode: Errors.NotRecipient,
    });
}

get fun `test claim fails before goal and before deadline`() {
    val (contract, _, recipient, donor) = setupCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("10") });

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: recipient.address,
        to: contract.address,
        exitCode: Errors.GoalNotReached,
    });
}

get fun `test ton donation does not satisfy usdt goal when goalTon disabled`() {
    val (contract, _, recipient, donor, _) = setupUsdtCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("2") });

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: recipient.address,
        to: contract.address,
        exitCode: Errors.GoalNotReached,
    });
}

get fun `test claim fails second time (already claimed)`() {
    val (contract, _, recipient, donor) = setupCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("1011") });
    contract.sendClaim(recipient.address, { value: ton("0.05") });

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: recipient.address,
        to: contract.address,
        exitCode: Errors.AlreadyClaimed,
    });
}

get fun `test partial claim succeeds after deadline with raised > 0`() {
    val (_, _, _, _) = setupCampaign();
    val master7      = testing.treasury("master7");
    val recipient7   = testing.treasury("recipient7");
    val donor7       = testing.treasury("donor7");
    val usdtMaster7  = testing.treasury("usdtMaster7");
    val usdtWallet7  = testing.treasury("usdtWallet7");

    val c = HarmonyCampaign.fromStorage({
        master:     master7.address,
        campaignId: 7,
        recipient:  recipient7.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster7.address,
                usdtJettonWallet:  usdtWallet7.address,
                platformWallet:    master7.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    c.deploy(master7.address, { value: ton("0.05") });

    c.sendDonate(donor7.address, 100, { value: ton("10") });
    expect(c.raisedTon()).toBeGreater(0);
    expect(c.raisedTon()).toBeLess(GOAL);

    testing.setNow(DEADLINE_FUTURE + 1);

    val balanceBefore = testing.getAccountBalance(recipient7.address);
    val res = c.sendClaim(recipient7.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Claim>({
        from: recipient7.address,
        to: c.address,
    });
    expect(c.status()).toEqual(1);  // STATUS_FUNDED (completed)

    val balanceAfter = testing.getAccountBalance(recipient7.address);
    expect(balanceAfter - balanceBefore).toBeGreater(ton("5"));
}

// ── refund ────────────────────────────────────────────────────────────────────

get fun `test refund fails on active campaign (not frozen)`() {
    val (contract, _, _, donor) = setupCampaign();

    contract.sendDonate(donor.address, 100, { value: ton("10") });

    val res = contract.sendRefund(donor.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: donor.address,
        to: contract.address,
        exitCode: Errors.CampaignNotActive,
    });
}

get fun `test refund fails on expired campaign (not frozen)`() {
    val (contract, _, _, donor) = setupCampaignWithPastDeadline();

    val res = contract.sendRefund(donor.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: donor.address,
        to: contract.address,
        exitCode: Errors.CampaignNotActive,
    });
}

get fun `test refund fails if donor has no donation on frozen campaign`() {
    val (_, _, _, _) = setupCampaign();
    val master5      = testing.treasury("master5");
    val recipient5   = testing.treasury("recipient5");
    val other5       = testing.treasury("other5");
    val usdtMaster5  = testing.treasury("usdtMaster5");
    val usdtWallet5  = testing.treasury("usdtWallet5");

    val c = HarmonyCampaign.fromStorage({
        master:     master5.address,
        campaignId: 5,
        recipient:  recipient5.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     STATUS_FROZEN,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster5.address,
                usdtJettonWallet:  usdtWallet5.address,
                platformWallet:    master5.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    c.deploy(master5.address, { value: ton("0.05") });

    val res = c.sendRefund(other5.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other5.address,
        to: c.address,
        exitCode: Errors.NothingToRefund,
    });
}

// ── freeze / unfreeze ─────────────────────────────────────────────────────────

get fun `test freeze sets status to FROZEN`() {
    val (contract, master, _, _) = setupCampaign();

    val res = contract.sendFreeze(master.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Freeze>({
        from: master.address,
        to: contract.address,
    });
    expect(contract.status()).toEqual(3);  // STATUS_FROZEN
}

get fun `test freeze blocks donate`() {
    val (contract, master, _, donor) = setupCampaign();

    contract.sendFreeze(master.address, { value: ton("0.05") });

    val res = contract.sendDonate(donor.address, 100, { value: ton("10") });
    expect(res).toHaveFailedTx({
        from: donor.address,
        to: contract.address,
        exitCode: Errors.CampaignNotActive,
    });
}

get fun `test freeze fails for non-master`() {
    val (contract, _, _, other) = setupCampaign();

    val res = contract.sendFreeze(other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: contract.address,
        exitCode: Errors.NotMaster,
    });
}

get fun `test unfreeze restores active status`() {
    val (contract, master, _, _) = setupCampaign();

    contract.sendFreeze(master.address, { value: ton("0.05") });
    expect(contract.status()).toEqual(3);  // FROZEN

    val res = contract.sendUnfreeze(master.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Unfreeze>({
        from: master.address,
        to: contract.address,
    });
    expect(contract.status()).toEqual(0);  // STATUS_ACTIVE
}

get fun `test unfreeze allows donate`() {
    val (contract, master, _, donor) = setupCampaign();

    contract.sendFreeze(master.address, { value: ton("0.05") });
    contract.sendUnfreeze(master.address, { value: ton("0.05") });

    val res = contract.sendDonate(donor.address, 100, { value: ton("10") });
    expect(res).toHaveSuccessfulTx<Donate>({
        from: donor.address,
        to: contract.address,
    });
}

get fun `test frozen campaign allows refund`() {
    val (_, _, _, _) = setupCampaign();
    val master6      = testing.treasury("master6");
    val recipient6   = testing.treasury("recipient6");
    val donor6       = testing.treasury("donor6");
    val usdtMaster6  = testing.treasury("usdtMaster6");
    val usdtWallet6  = testing.treasury("usdtWallet6");

    val c = HarmonyCampaign.fromStorage({
        master:     master6.address,
        campaignId: 6,
        recipient:  recipient6.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtMaster6.address,
                usdtJettonWallet:  usdtWallet6.address,
                platformWallet:    master6.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    c.deploy(master6.address, { value: ton("0.05") });

    c.sendDonate(donor6.address, 100, { value: ton("10") });
    c.sendFreeze(master6.address, { value: ton("0.05") });

    val res = c.sendRefund(donor6.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Refund>({
        from: donor6.address,
        to: c.address,
    });
}

get fun `test frozen campaign allows usdt refund`() {
    val (contract, master, _, donor, usdtWallet) = setupUsdtCampaign();

    contract.sendTransferNotification(usdtWallet.address, 0, 1000_000_000, donor.address, { value: ton("0.2") });
    contract.sendFreeze(master.address, { value: ton("0.05") });

    val res = contract.sendRefund(donor.address, { value: ton("0.1") });
    expect(res).toHaveSuccessfulTx<Refund>({
        from: donor.address,
        to: contract.address,
    });
    // After last refund the contract sends CARRY_ALL_BALANCE|DESTROY to master
    // and self-destructs, so get_status() is no longer available.
}

// ── get_status ────────────────────────────────────────────────────────────────

get fun `test get_status returns all fields`() {
    val (contract, _, _, _) = setupCampaign();

    val st = contract.get_status();
    expect(st.goalUsdt).toEqual(GOAL);
    expect(st.raisedTon).toEqual(0);
    expect(st.raisedUsdt).toEqual(0);
    expect(st.deadline).toEqual(DEADLINE_FUTURE);
    expect(st.status).toEqual(0);   // STATUS_ACTIVE
    expect(st.donorCount).toEqual(0);
}

// ── master can update master address ─────────────────────────────────────────

get fun `test master can update master address`() {
    val (contract, master, _, _) = setupCampaign();

    val newMaster = testing.treasury("newMaster");
    val res = contract.sendChangeOwner(master.address, newMaster.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<ChangeOwner>({
        from: master.address,
        to: contract.address,
    });
    expect(contract.master()).toEqual(newMaster.address);
}

get fun `test non-master cannot update master`() {
    val (contract, master, _, other) = setupCampaign();

    val res = contract.sendChangeOwner(other.address, other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: contract.address,
        exitCode: Errors.NotMaster,
    });
    expect(contract.master()).toEqual(master.address);
}

// ── USDT jetton integration ───────────────────────────────────────────────────

get fun `test usdt transfer_notification increments raisedUsdt`() {
    val (contract, _, _, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor2");

    // 1000 nUSDT donation from usdtWallet (simulates the jetton wallet notification)
    val donationAmount: coins = 1000_000_000;
    val res = contract.sendTransferNotification(
        usdtWallet.address,
        0,
        donationAmount,
        donor.address,
        { value: ton("0.1") },
    );
    expect(res).toHaveSuccessfulTx<TransferNotification>({
        from: usdtWallet.address,
        to: contract.address,
    });

    val tipNet = donationAmount * TIP_BPS / 10000;
    expect(contract.raisedUsdt()).toEqual(donationAmount - tipNet);
    expect(contract.raisedTon()).toEqual(0);  // TON field unaffected
}

get fun `test usdt transfer_notification uses tipBps from forward payload`() {
    val (contract, _, _, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor-tip-payload");

    // Frontend sends total = donation + tip. For a user-selected 15% tip,
    // effectiveTipBps = 15 * 10000 / 115 = 1304 so the contract nets ~base donation.
    val totalAmount: coins = 1150_000_000;
    val effectiveTipBps: uint32 = 1304;
    val res = contract.sendTransferNotificationWithTip(
        usdtWallet.address,
        0,
        totalAmount,
        donor.address,
        effectiveTipBps,
        { value: ton("0.2") },
    );
    expect(res).toHaveSuccessfulTx<TransferNotification>({
        from: usdtWallet.address,
        to: contract.address,
    });

    val expectedTip = totalAmount * effectiveTipBps / 10000;
    expect(contract.raisedUsdt()).toEqual(totalAmount - expectedTip);
}

get fun `test usdt transfer_notification rejects tipBps above 1500`() {
    val (contract, _, _, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor-tip-invalid");

    val res = contract.sendTransferNotificationWithTip(
        usdtWallet.address,
        0,
        100_000_000,
        donor.address,
        1501,
        { value: ton("0.2") },
    );
    expect(res).toHaveFailedTx({
        from: usdtWallet.address,
        to: contract.address,
        exitCode: Errors.InvalidTipBps,
    });
}

get fun `test usdt transfer_notification increments donorCount`() {
    val (contract, _, _, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor3");

    contract.sendTransferNotification(usdtWallet.address, 0, 100_000_000, donor.address, { value: ton("0.1") });

    val st = contract.get_status();
    expect(st.donorCount).toEqual(1);
}

get fun `test usdt tip split sends jetton transfer to master`() {
    val (contract, _, _, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor4");

    // Campaign deployed with ton("0.5"), then receives ton("0.2") notification gas.
    // It must spend at least ton("0.05") forwarding the tip jetton transfer.
    contract.sendTransferNotification(usdtWallet.address, 0, 1000_000_000, donor.address, { value: ton("0.2") });
    val contractBalance = testing.getAccountBalance(contract.address);
    val totalFunded = ton("0.5") + ton("0.2");
    // Balance must be lower than total funded — proves the jetton transfer message was sent.
    expect(contractBalance).toBeLess(totalFunded - ton("0.04"));
}

get fun `test usdt transfer_notification fails from wrong jetton wallet`() {
    val (contract, _, _, _, _) = setupUsdtCampaign();
    val fakeWallet = testing.treasury("fakeWallet");
    val donor      = testing.treasury("udonor5");

    val res = contract.sendTransferNotification(fakeWallet.address, 0, 100_000_000, donor.address, { value: ton("0.1") });
    expect(res).toHaveFailedTx({
        from: fakeWallet.address,
        to: contract.address,
        exitCode: Errors.InvalidJettonSender,
    });
}

get fun `test usdt transfer_notification fails on frozen campaign`() {
    val (contract, master, _, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor6");

    contract.sendFreeze(master.address, { value: ton("0.05") });

    val res = contract.sendTransferNotification(usdtWallet.address, 0, 100_000_000, donor.address, { value: ton("0.1") });
    expect(res).toHaveFailedTx({
        from: usdtWallet.address,
        to: contract.address,
        exitCode: Errors.CampaignNotActive,
    });
}

get fun `test usdt campaign claim succeeds when usdt goal reached`() {
    val (contract, master, recipient, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("udonor7");

    // Donate slightly above GOAL_USDT (1000 USDT) to cover tip deduction
    // 1010 nUSDT * 0.99 = ~999.9 nUSDT — not enough; use 1011
    val donateAmount: coins = 1011_000_000;
    contract.sendTransferNotification(usdtWallet.address, 0, donateAmount, donor.address, { value: ton("0.2") });

    val st = contract.get_status();
    expect(st.raisedUsdt).toBeGreater(GOAL_USDT - 1);

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Claim>({
        from: recipient.address,
        to: contract.address,
    });
    expect(contract.status()).toEqual(1);  // STATUS_FUNDED
}

get fun `test mixed campaign tracks ton and usdt separately`() {
    val (contract, _, _, donor, usdtWallet) = setupUsdtCampaign();
    val udonor = testing.treasury("udonorm");

    // TON donation
    contract.sendDonate(donor.address, 100, { value: ton("50") });
    // USDT donation
    contract.sendTransferNotification(usdtWallet.address, 0, 500_000_000, udonor.address, { value: ton("0.1") });

    val st = contract.get_status();
    expect(st.raisedTon).toBeGreater(0);
    expect(st.raisedUsdt).toBeGreater(0);
    // they must not bleed into each other
    expect(st.raisedTon).toBeLess(ton("50") + 1);  // at most 50 TON (minus tip)
    expect(st.raisedUsdt).toBeLess(500_000_001);    // at most 500 USDT (minus tip)
}

// ── Zero goals protection ───────────────────────────────────────────────────

get fun `test claim fails with zero goals even after deadline`() {
    val master    = testing.treasury("zg_master");
    val recipient = testing.treasury("zg_recip");
    val usdtM     = testing.treasury("zg_usdt");
    val usdtW     = testing.treasury("zg_usdtw");

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 90,
        recipient:  recipient.address,
        goalUsdt:   0,
        goalTon:    0,
        deadline:   DEADLINE_PAST,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM.address,
                usdtJettonWallet:  usdtW.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master.address, { value: ton("0.1") });

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: recipient.address,
        to: contract.address,
        exitCode: Errors.GoalNotReached,
    });
}

// ── DeployFee return on last refund ─────────────────────────────────────────

get fun `test last refund returns deployFee to master`() {
    val master7     = testing.treasury("df_master");
    val recipient7  = testing.treasury("df_recip");
    val donor7      = testing.treasury("df_donor");
    val usdtM7      = testing.treasury("df_usdt");
    val usdtW7      = testing.treasury("df_usdtw");

    val contract = HarmonyCampaign.fromStorage({
        master:     master7.address,
        campaignId: 91,
        recipient:  recipient7.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.5"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM7.address,
                usdtJettonWallet:  usdtW7.address,
                platformWallet:    master7.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master7.address, { value: ton("1") });

    contract.sendDonate(donor7.address, 0, { value: ton("10") });
    contract.sendFreeze(master7.address, { value: ton("0.05") });

    val masterBefore = testing.getAccountBalance(master7.address);
    contract.sendRefund(donor7.address, { value: ton("0.05") });
    val masterAfter = testing.getAccountBalance(master7.address);

    expect(masterAfter).toBeGreater(masterBefore);
}

// ── DonorCount underflow guard ──────────────────────────────────────────────

get fun `test refund fails when donorCount is zero`() {
    val master8     = testing.treasury("uf_master");
    val recipient8  = testing.treasury("uf_recip");
    val donor8      = testing.treasury("uf_donor");
    val usdtM8      = testing.treasury("uf_usdt");
    val usdtW8      = testing.treasury("uf_usdtw");

    val contract = HarmonyCampaign.fromStorage({
        master:     master8.address,
        campaignId: 92,
        recipient:  recipient8.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     TIP_BPS,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     STATUS_FROZEN,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM8.address,
                usdtJettonWallet:  usdtW8.address,
                platformWallet:    master8.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master8.address, { value: ton("0.1") });

    val res = contract.sendRefund(donor8.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: donor8.address,
        to: contract.address,
        exitCode: Errors.NothingToRefund,
    });
}

// ── Claim with goalUsdt=0, only goalTon ─────────────────────────────────────

get fun `test claim with goalUsdt zero requires goalTon reached`() {
    val master9     = testing.treasury("gz_master");
    val recipient9  = testing.treasury("gz_recip");
    val donor9      = testing.treasury("gz_donor");
    val usdtM9      = testing.treasury("gz_usdt");
    val usdtW9      = testing.treasury("gz_usdtw");

    val contract = HarmonyCampaign.fromStorage({
        master:     master9.address,
        campaignId: 93,
        recipient:  recipient9.address,
        goalUsdt:   0,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     0,
        deployFee:  ton("0.05"),
        raisedTon:  0,
        raisedUsdt: 0,
        donorCount: 0,
        status:     0,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM9.address,
                usdtJettonWallet:  usdtW9.address,
                platformWallet:    master9.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master9.address, { value: ton("0.1") });

    contract.sendDonate(donor9.address, 0, { value: ton("500") });

    val res = contract.sendClaim(recipient9.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: recipient9.address,
        to: contract.address,
        exitCode: Errors.GoalNotReached,
    });
}

// ── Refund/claim edge cases ─────────────────────────────────────────────────

get fun `test mixed ton and usdt donor refund decrements donorCount once`() {
    val (contract, master, _, donor, usdtWallet) = setupUsdtCampaign();
    val secondDonor = testing.treasury("mixed_refund_second");

    contract.sendDonate(donor.address, 0, { value: ton("10") });
    contract.sendTransferNotification(usdtWallet.address, 0, 100_000_000, donor.address, { value: ton("0.2") });
    contract.sendDonate(secondDonor.address, 0, { value: ton("5") });

    val before = contract.get_status();
    expect(before.donorCount).toEqual(2);
    expect(before.raisedUsdt).toBeGreater(0);

    contract.sendFreeze(master.address, { value: ton("0.05") });
    val res = contract.sendRefund(donor.address, { value: ton("0.1") });
    expect(res).toHaveSuccessfulTx<Refund>({
        from: donor.address,
        to: contract.address,
    });

    val after = contract.get_status();
    expect(after.donorCount).toEqual(1);
    expect(after.raisedUsdt).toEqual(0);
    expect(after.raisedTon).toBeGreater(0);
    expect(after.status).toEqual(STATUS_FROZEN);
}

get fun `test refund action fail preserves donor accounting`() {
    val master     = testing.treasury("rf_low_master");
    val recipient  = testing.treasury("rf_low_recipient");
    val donor      = testing.treasury("rf_low_donor");
    val usdtM      = testing.treasury("rf_low_usdt");
    val usdtW      = testing.treasury("rf_low_usdtw");

    val (_, addrHash) = donor.address.getWorkchainAndHash();
    var donations: dict = null;
    val donationSlice = beginCell().storeCoins(ton("10")).endCell().beginParse();
    donations.uDictSet(256, addrHash, donationSlice);

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 94,
        recipient:  recipient.address,
        goalUsdt:   GOAL,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     0,
        deployFee:  ton("0.05"),
        raisedTon:  10_000_000_000,
        raisedUsdt: 0,
        donorCount: 1,
        status:     STATUS_FROZEN,
        donations:  donations,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM.address,
                usdtJettonWallet:  usdtW.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master.address, { value: ton("0.1") });

    val res = contract.sendRefund(donor.address, { value: ton("0.05") });
    expect(res).toHaveTx({
        from: donor.address,
        to: contract.address,
        success: false,
        actionExitCode: 37,
    });

    val after = contract.get_status();
    expect(after.donorCount).toEqual(1);
    expect(after.raisedTon).toEqual(10_000_000_000);
    expect(after.status).toEqual(STATUS_FROZEN);
}

get fun `test claim fails before two-message payout can starve recipient`() {
    val master     = testing.treasury("claim_low_master");
    val recipient  = testing.treasury("claim_low_recipient");
    val usdtM      = testing.treasury("claim_low_usdt");
    val usdtW      = testing.treasury("claim_low_usdtw");

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 95,
        recipient:  recipient.address,
        goalUsdt:   0,
        goalTon:    GOAL,
        deadline:   DEADLINE_FUTURE,
        tipBps:     0,
        deployFee:  ton("0.5"),
        raisedTon:  GOAL,
        raisedUsdt: 0,
        donorCount: 1,
        status:     STATUS_ACTIVE,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM.address,
                usdtJettonWallet:  usdtW.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master.address, { value: ton("0.1") });

    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: recipient.address,
        to: contract.address,
        exitCode: Errors.InsufficientValue,
    });
    expect(contract.status()).toEqual(STATUS_ACTIVE);
}

// ── Claim must not pay out platform gas ─────────────────────────────────────
//
// The 81 tests that existed before this fix all pass against the leaking code:
// none of them asks how much the recipient got relative to what was raised.
// The three below are written to fail on the old carry-all payout.

get fun `test usdt-only claim pays the recipient no TON at all`() {
    val (contract, _, recipient, _, usdtWallet) = setupUsdtCampaign();
    val donor = testing.treasury("gas_udonor");

    contract.sendTransferNotification(usdtWallet.address, 0, 1011_000_000, donor.address, { value: ton("0.2") });

    val before = testing.getAccountBalance(recipient.address);
    val res = contract.sendClaim(recipient.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<Claim>({
        from: recipient.address,
        to: contract.address,
    });
    val after = testing.getAccountBalance(recipient.address);

    // raisedTon is 0, so the campaign owes the recipient nothing in TON, and
    // nothing is exactly what arrives. Old code carried the whole leftover
    // balance here — a positive delta on a campaign that raised no TON.
    // (Emulator treasuries do not pay for the messages they send, so the 0.05
    // spent on the claim does not show up in this delta.)
    expect(after - before).toEqual(0);
}

get fun `test claim pays the recipient exactly what was raised in TON`() {
    val master    = testing.treasury("gas_master");
    val recipient = testing.treasury("gas_recip");
    val usdtM     = testing.treasury("gas_usdt");
    val usdtW     = testing.treasury("gas_usdtw");

    // 1 TON raised, 0.3 TON of platform gas sitting on top of it.
    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 107,
        recipient:  recipient.address,
        goalUsdt:   0,
        goalTon:    ton("1") as uint64,
        deadline:   DEADLINE_FUTURE,
        tipBps:     0,
        deployFee:  ton("0.15"),
        raisedTon:  ton("1") as uint64,
        raisedUsdt: 0,
        donorCount: 1,
        status:     STATUS_ACTIVE,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM.address,
                usdtJettonWallet:  usdtW.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master.address, { value: ton("1.3") });

    val before = testing.getAccountBalance(recipient.address);
    contract.sendClaim(recipient.address, { value: ton("0.05") });
    val after = testing.getAccountBalance(recipient.address);

    // Upper bound is the discriminating half: the recipient gets the raised TON
    // and not one nanoton more. Old code handed them the 0.3 TON of leftover
    // deploy gas on top. The lower bound keeps the test honest in the other
    // direction — the payout must still actually happen.
    expect(after - before).toBeLessOrEqual(ton("1"));
    expect(after - before).toBeGreater(ton("0.99"));
}

get fun `test claim returns the leftover gas to master`() {
    val master    = testing.treasury("gas_master2");
    val recipient = testing.treasury("gas_recip2");
    val usdtM     = testing.treasury("gas_usdt2");
    val usdtW     = testing.treasury("gas_usdtw2");

    val contract = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 108,
        recipient:  recipient.address,
        goalUsdt:   0,
        goalTon:    ton("1") as uint64,
        deadline:   DEADLINE_FUTURE,
        tipBps:     0,
        deployFee:  ton("0.15"),
        raisedTon:  ton("1") as uint64,
        raisedUsdt: 0,
        donorCount: 1,
        status:     STATUS_ACTIVE,
        donations:  null,
        extra: CampaignExtra {
            usdtConfig: CampaignUsdtConfig {
                usdtMasterAddress: usdtM.address,
                usdtJettonWallet:  usdtW.address,
                platformWallet:    master.address,
            }.toCell(),
            usdtDonations: null,
        }.toCell(),
    });
    contract.deploy(master.address, { value: ton("1.3") });

    val before = testing.getAccountBalance(master.address);
    contract.sendClaim(recipient.address, { value: ton("0.05") });
    val after = testing.getAccountBalance(master.address);

    // 0.3 leftover + the 0.05 the recipient paid, minus gas. Old code sent
    // master only the 0.15 deployFee and gave the rest away.
    expect(after - before).toBeGreater(ton("0.2"));
}

// NOTE: the jetton transfer's response_destination (once the platform wallet,
// now the recipient again) is not covered here.
// The change it refers to is sent by the USDT jetton wallet, which in these
// tests is a plain treasury and never answers, and the emulator exposes no way
// to read an outgoing message body. Verified by code review; the amount can be
// confirmed only by a live claim, and testnet has no USDT to claim with.

// NOTE: bounce recovery (onBouncedMessage rollback) cannot be tested with
// Acton's emulation framework — no sendBounce API. Verified by code review.
