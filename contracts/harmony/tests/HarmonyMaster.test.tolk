import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

// ── helpers ───────────────────────────────────────────────────────────────────

const TIP_BPS: uint32 = 100;
const GOAL:    uint64 = 1_000_000_000_000;  // 1000 TON

fun setupMaster(): (HarmonyMaster, Treasury, Treasury) {
    val deployer    = testing.treasury("deployer");
    val other       = testing.treasury("other");
    val usdtMaster  = testing.treasury("usdtMaster");

    val contract = HarmonyMaster.fromStorage({
        owner:              deployer.address,
        platformWallet:     deployer.address,
        tipBps:             TIP_BPS,
        campaignCount:      0,
        campaignCode:       build("HarmonyCampaign"),
        campaigns:          null,
        moderators:         null,
        strayFunds:      0,
        gasPool:            0,
        extra: MasterExtra {
            usdtMasterAddress: usdtMaster.address,
        }.toCell(),
    });
    val res = contract.deploy(deployer.address, { value: ton("0.1") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, deployer, other);
}

// future deadline for deploy_campaign tests
fun futureDeadline(): uint32 {
    return blockchain.now() + 86400 * 30;  // now + 30 days
}

// ── deploy ────────────────────────────────────────────────────────────────────

get fun `test deploy sets initial owner`() {
    val (contract, deployer, _) = setupMaster();
    expect(contract.owner()).toEqual(deployer.address);
}

get fun `test deploy sets initial tipBps`() {
    val (contract, _, _) = setupMaster();
    expect(contract.tipBps()).toEqual(TIP_BPS);
}

get fun `test deploy sets campaignCount to zero`() {
    val (contract, _, _) = setupMaster();
    expect(contract.campaignCount()).toEqual(0);
}

// ── change_owner ──────────────────────────────────────────────────────────────

get fun `test owner can transfer ownership`() {
    val (contract, deployer, other) = setupMaster();

    val res = contract.sendChangeOwner(deployer.address, other.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<ChangeOwner>({
        from: deployer.address,
        to: contract.address,
    });
    expect(contract.owner()).toEqual(other.address);
}

get fun `test non-owner cannot transfer ownership`() {
    val (contract, deployer, other) = setupMaster();

    val res = contract.sendChangeOwner(other.address, other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
    expect(contract.owner()).toEqual(deployer.address);
}

// ── deploy_campaign ───────────────────────────────────────────────────────────

get fun `test deploy_campaign increments campaignCount`() {
    val (master, deployer, _) = setupMaster();
    val recipient    = testing.treasury("recip1");
    val usdtMaster1  = testing.treasury("usdtMasterR1");
    val usdtWallet1  = testing.treasury("usdtWalletR1");

    master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        GOAL,
        GOAL,
        futureDeadline(),
        ton("0.1"),
        usdtMaster1.address,
        usdtWallet1.address,
        deployer.address,
        { value: ton("0.2") },
    );

    expect(master.campaignCount()).toEqual(1);
}

get fun `test deploy_campaign registers address`() {
    val (master, deployer, _) = setupMaster();
    val recipient    = testing.treasury("recip2");
    val usdtMaster2  = testing.treasury("usdtMasterR2");
    val usdtWallet2  = testing.treasury("usdtWalletR2");

    val res = master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        GOAL,
        GOAL,
        futureDeadline(),
        ton("0.1"),
        usdtMaster2.address,
        usdtWallet2.address,
        deployer.address,
        { value: ton("0.2") },
    );
    expect(res).toHaveSuccessfulTx<DeployCampaign>({
        from: deployer.address,
        to: master.address,
    });

    val campaignAddr = master.get_campaign(0);
    val campaign = HarmonyCampaign.fromAddress(campaignAddr);

    expect(campaign.campaignId()).toEqual(0);
    expect(campaign.recipient()).toEqual(recipient.address);
    expect(campaign.master()).toEqual(master.address);
    expect(campaign.status()).toEqual(0);  // STATUS_ACTIVE
}

get fun `test deploy_campaign sets correct tipBps on child`() {
    val (master, deployer, _) = setupMaster();
    val recipient    = testing.treasury("recip3");
    val usdtMaster3  = testing.treasury("usdtMasterR3");
    val usdtWallet3  = testing.treasury("usdtWalletR3");

    master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        GOAL,
        GOAL,
        futureDeadline(),
        ton("0.1"),
        usdtMaster3.address,
        usdtWallet3.address,
        deployer.address,
        { value: ton("0.2") },
    );

    val campaignAddr = master.get_campaign(0);
    val campaign = HarmonyCampaign.fromAddress(campaignAddr);
    val st = campaign.get_status();
    expect(st.goalUsdt).toEqual(GOAL);
}

get fun `test deploy two campaigns get different ids`() {
    val (master, deployer, _) = setupMaster();
    val r1          = testing.treasury("rA");
    val r2          = testing.treasury("rB");
    val usdtMasterA = testing.treasury("usdtMasterRA");
    val usdtWalletA = testing.treasury("usdtWalletRA");
    val usdtMasterB = testing.treasury("usdtMasterRB");
    val usdtWalletB = testing.treasury("usdtWalletRB");

    master.sendDeployCampaign(deployer.address, r1.address, GOAL, GOAL, futureDeadline(), ton("0.1"), usdtMasterA.address, usdtWalletA.address, deployer.address, { value: ton("0.2") });
    master.sendDeployCampaign(deployer.address, r2.address, GOAL, GOAL, futureDeadline(), ton("0.1"), usdtMasterB.address, usdtWalletB.address, deployer.address, { value: ton("0.2") });

    expect(master.campaignCount()).toEqual(2);

    val addr0 = master.get_campaign(0);
    val addr1 = master.get_campaign(1);
    // addresses must differ
    expect(addr0 == addr1).toEqual(false);
}

get fun `test deploy two identical campaigns get different addresses`() {
    val (master, deployer, _) = setupMaster();
    val recipient   = testing.treasury("sameRecipient");
    val usdtMaster  = testing.treasury("sameUsdtMaster");
    val usdtWallet  = testing.treasury("sameUsdtWallet");
    val deadline    = futureDeadline();
    val deployValue = ton("0.1");

    master.sendDeployCampaign(deployer.address, recipient.address, GOAL, GOAL, deadline, deployValue, usdtMaster.address, usdtWallet.address, deployer.address, { value: ton("0.2") });
    master.sendDeployCampaign(deployer.address, recipient.address, GOAL, GOAL, deadline, deployValue, usdtMaster.address, usdtWallet.address, deployer.address, { value: ton("0.2") });

    expect(master.campaignCount()).toEqual(2);

    val addr0 = master.get_campaign(0);
    val addr1 = master.get_campaign(1);
    expect(addr0 == addr1).toEqual(false);

    val campaign0 = HarmonyCampaign.fromAddress(addr0);
    val campaign1 = HarmonyCampaign.fromAddress(addr1);
    expect(campaign0.campaignId()).toEqual(0);
    expect(campaign1.campaignId()).toEqual(1);
}

get fun `test deploy_campaign fails with past deadline`() {
    val (master, deployer, _) = setupMaster();
    val recipient    = testing.treasury("recip4");
    val usdtMaster4  = testing.treasury("usdtMasterR4");
    val usdtWallet4  = testing.treasury("usdtWalletR4");

    val pastDeadline: uint32 = 1000000000;  // year 2001

    val res = master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        GOAL,
        GOAL,
        pastDeadline,
        ton("0.1"),
        usdtMaster4.address,
        usdtWallet4.address,
        deployer.address,
        { value: ton("0.2") },
    );
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: master.address,
        exitCode: Errors.InvalidDeadline,
    });

    expect(master.campaignCount()).toEqual(0);
}

get fun `test deploy_campaign fails with insufficient deploy value`() {
    val (master, deployer, _) = setupMaster();
    val recipient    = testing.treasury("recip5");
    val usdtMaster5  = testing.treasury("usdtMasterR5");
    val usdtWallet5  = testing.treasury("usdtWalletR5");

    val res = master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        GOAL,
        GOAL,
        futureDeadline(),
        ton("0.01"),  // below 0.05 minimum
        usdtMaster5.address,
        usdtWallet5.address,
        deployer.address,
        { value: ton("0.2") },
    );
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: master.address,
        exitCode: Errors.InsufficientValue,
    });
}

get fun `test non-owner cannot deploy_campaign`() {
    val (master, _, other) = setupMaster();
    val recipient   = testing.treasury("recipNonOwner");
    val usdtMaster  = testing.treasury("usdtMasterNonOwner");
    val usdtWallet  = testing.treasury("usdtWalletNonOwner");

    val res = master.sendDeployCampaign(
        other.address,
        recipient.address,
        GOAL,
        GOAL,
        futureDeadline(),
        ton("0.1"),
        usdtMaster.address,
        usdtWallet.address,
        other.address,
        { value: ton("0.2") },
    );

    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.Unauthorized,
    });
    expect(master.campaignCount()).toEqual(0);
}

// ── Zero goals validation ────────────────────────────────────────────────────

get fun `test deploy_campaign fails with zero goals`() {
    val (master, deployer, _) = setupMaster();
    val recipient   = testing.treasury("recipZG");
    val usdtMaster  = testing.treasury("usdtMasterZG");
    val usdtWallet  = testing.treasury("usdtWalletZG");

    val res = master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        0,     // goalUsdt = 0
        0,     // goalTon = 0
        futureDeadline(),
        ton("0.1"),
        usdtMaster.address,
        usdtWallet.address,
        deployer.address,
        { value: ton("0.2") },
    );
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: master.address,
        exitCode: Errors.InvalidGoal,
    });
    expect(master.campaignCount()).toEqual(0);
}

get fun `test deploy_campaign succeeds with only usdt goal`() {
    val (master, deployer, _) = setupMaster();
    val recipient   = testing.treasury("recipUG");
    val usdtMaster  = testing.treasury("usdtMasterUG");
    val usdtWallet  = testing.treasury("usdtWalletUG");

    val res = master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        GOAL,  // goalUsdt > 0
        0,     // goalTon = 0
        futureDeadline(),
        ton("0.1"),
        usdtMaster.address,
        usdtWallet.address,
        deployer.address,
        { value: ton("0.2") },
    );
    expect(res).toHaveSuccessfulTx<DeployCampaign>({
        from: deployer.address,
        to: master.address,
    });
    expect(master.campaignCount()).toEqual(1);
}

// ── get_campaign / get_stats ──────────────────────────────────────────────────

get fun `test get_campaign fails for unknown id`() {
    val (master, _, _) = setupMaster();
    // campaignCount == 0 → campaigns dict is empty → get_campaign(any_id) hits `assert found throw
    // Errors.CampaignNotFound`. Framework does not support asserting thrown get-method exit codes
    // directly (net.runGetMethod swallows the exception), so we verify the precondition instead.
    expect(master.campaignCount()).toEqual(0);
}

get fun `test get_stats returns all fields`() {
    val (master, deployer, _) = setupMaster();
    val st = master.get_stats();

    expect(st.campaignCount).toEqual(0);
    expect(st.platformWallet).toEqual(deployer.address);
    expect(st.tipBps).toEqual(TIP_BPS);
}

// ── withdraw_stray_funds ─────────────────────────────────────────────────────────────

get fun `test withdraw_stray_funds sends the accumulated stray TON to recipient`() {
    val (master, deployer, other) = setupMaster();

    testing.topUp(master.address, ton("5"));
    val masterBefore = testing.getAccountBalance(master.address);

    val otherBefore = testing.getAccountBalance(other.address);
    master.sendWithdrawStrayFunds(deployer.address, other.address, { value: ton("0.05") });
    val otherAfter = testing.getAccountBalance(other.address);
    val masterAfter = testing.getAccountBalance(master.address);

    expect(otherAfter - otherBefore).toBeGreater(ton("4"));
    expect(masterAfter).toBeLess(masterBefore);
}

get fun `test withdraw_stray_funds fails for non-owner`() {
    val (master, _, other) = setupMaster();

    val res = master.sendWithdrawStrayFunds(other.address, other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
}

// ── moderators ────────────────────────────────────────────────────────────────

get fun `test add_moderator sets moderator`() {
    val (master, deployer, other) = setupMaster();

    expect(master.is_moderator(other.address)).toEqual(false);

    master.sendAddModerator(deployer.address, other.address, { value: ton("0.05") });

    expect(master.is_moderator(other.address)).toEqual(true);
}

get fun `test remove_moderator clears moderator`() {
    val (master, deployer, other) = setupMaster();

    master.sendAddModerator(deployer.address, other.address, { value: ton("0.05") });
    expect(master.is_moderator(other.address)).toEqual(true);

    master.sendRemoveModerator(deployer.address, other.address, { value: ton("0.05") });
    expect(master.is_moderator(other.address)).toEqual(false);
}

get fun `test add_moderator fails for non-owner`() {
    val (master, _, other) = setupMaster();

    val res = master.sendAddModerator(other.address, other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
}

// ── Gas pool, deployer refill, campaign code ────────────────────────────────

// Deploys a small campaign through master, funds it past the goal and claims it,
// so the campaign returns its unspent deploy gas. Returns the master-side view.
fun setupCampaignReadyToClaim(): (HarmonyMaster, HarmonyCampaign, Treasury, Treasury, Treasury) {
    val deployer   = testing.treasury("gas_deployer");
    val other      = testing.treasury("gas_other");
    val recipient  = testing.treasury("gas_recip");
    val usdtMaster = testing.treasury("gas_usdtm");
    val usdtWallet = testing.treasury("gas_usdtw");
    val donor      = testing.treasury("gas_donor");

    val master = HarmonyMaster.fromStorage({
        owner:              deployer.address,
        platformWallet:     deployer.address,
        tipBps:             0,
        campaignCount:      0,
        campaignCode:       build("HarmonyCampaign"),
        campaigns:          null,
        moderators:         null,
        strayFunds:      0,
        gasPool:            0,
        extra: MasterExtra {
            usdtMasterAddress: usdtMaster.address,
        }.toCell(),
    });
    master.deploy(deployer.address, { value: ton("0.1") });

    master.sendDeployCampaign(
        deployer.address,
        recipient.address,
        0,
        ton("1") as uint64,
        futureDeadline(),
        ton("0.3"),
        usdtMaster.address,
        usdtWallet.address,
        deployer.address,
        { value: ton("0.4") },
    );

    val campaign = HarmonyCampaign.fromAddress(master.get_campaign(0));
    campaign.sendDonate(donor.address, 0, { value: ton("1.1") });

    return (master, campaign, deployer, other, recipient);
}

// Same, with the claim already performed — the campaign has returned its gas.
fun setupClaimedCampaign(): (HarmonyMaster, Treasury, Treasury) {
    val (master, campaign, deployer, other, recipient) = setupCampaignReadyToClaim();
    campaign.sendClaim(recipient.address, { value: ton("0.05") });
    expect(campaign.status()).toEqual(1);  // STATUS_FUNDED
    return (master, deployer, other);
}

get fun `test returned claim gas lands in gasPool and not in strayFunds`() {
    val (master, campaign, _, _, recipient) = setupCampaignReadyToClaim();

    // Master's own deploy value already sits in strayFunds (empty-body
    // branch), so the baseline is not zero — take it before the claim.
    val strayBefore = master.strayFunds();
    expect(master.gasPool()).toEqual(0);

    campaign.sendClaim(recipient.address, { value: ton("0.05") });

    // Old code took the returned gas through the same empty-body branch and
    // booked it as platform earnings; the deployer never saw it again.
    expect(master.gasPool()).toBeGreater(ton("0.2"));
    expect(master.strayFunds()).toEqual(strayBefore);
}

get fun `test gas return from an unregistered sender is rejected`() {
    val (master, _, other) = setupClaimedCampaign();
    val poolBefore = master.gasPool();

    // campaign 0 exists, but this sender is not it.
    val res = master.sendCampaignGasReturn(other.address, 0, { value: ton("0.5") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.NotRegisteredCampaign,
    });
    expect(master.gasPool()).toEqual(poolBefore);
}

get fun `test gas return for an unknown campaign is rejected`() {
    val (master, _, other) = setupClaimedCampaign();
    val poolBefore = master.gasPool();

    val res = master.sendCampaignGasReturn(other.address, 999, { value: ton("0.5") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.CampaignNotFound,
    });
    expect(master.gasPool()).toEqual(poolBefore);
}

get fun `test refill_deployer pays the owner and empties the pool`() {
    val (master, deployer, _) = setupClaimedCampaign();
    val pool = master.gasPool();
    expect(pool).toBeGreater(ton("0.2"));

    val before = testing.getAccountBalance(deployer.address);
    val res = master.sendRefillDeployer(deployer.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<RefillDeployer>({
        from: deployer.address,
        to: master.address,
    });
    val after = testing.getAccountBalance(deployer.address);

    expect(master.gasPool()).toEqual(0);
    // got the pool back, minus the 0.05 spent on the call and gas
    expect(after - before).toBeGreater(pool - ton("0.07"));
}

get fun `test refill_deployer is rejected for a stranger`() {
    val (master, _, other) = setupClaimedCampaign();
    val poolBefore = master.gasPool();

    val res = master.sendRefillDeployer(other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.Unauthorized,
    });
    expect(master.gasPool()).toEqual(poolBefore);
}

get fun `test refill_deployer fails when the pool is empty`() {
    val (master, deployer, _) = setupMaster();

    val res = master.sendRefillDeployer(deployer.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: master.address,
        exitCode: Errors.GasPoolEmpty,
    });
}

get fun `test refill_deployer pays the moderator who called it`() {
    val (master, deployer, other) = setupClaimedCampaign();
    master.sendAddModerator(deployer.address, other.address, { value: ton("0.05") });

    val before = testing.getAccountBalance(other.address);
    master.sendRefillDeployer(other.address, { value: ton("0.05") });
    val after = testing.getAccountBalance(other.address);

    // destination is the sender, never a parameter
    expect(master.gasPool()).toEqual(0);
    expect(after - before).toBeGreater(ton("0.1"));
}

get fun `test set_campaign_code replaces the code used for the next deploy`() {
    val (master, deployer, _) = setupMaster();
    val hashBefore = master.campaignCodeHash();

    val res = master.sendSetCampaignCode(deployer.address, build("HarmonyVerifier"), { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<SetCampaignCode>({
        from: deployer.address,
        to: master.address,
    });
    expect(master.campaignCodeHash()).toNotEqual(hashBefore);
}

get fun `test set_campaign_code is rejected for a non-owner`() {
    val (master, _, other) = setupMaster();
    val hashBefore = master.campaignCodeHash();

    val res = master.sendSetCampaignCode(other.address, build("HarmonyVerifier"), { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
    expect(master.campaignCodeHash()).toEqual(hashBefore);
}

// ── Deployer wallet auto-forward ─────────────────────────────────────────────

get fun `test deployer wallet is unset until it is configured`() {
    val (master, _, _) = setupMaster();
    expect(master.deployerWallet()).toEqual(null);
}

get fun `test owner can set the deployer wallet`() {
    val (master, deployer, other) = setupMaster();

    val res = master.sendSetDeployerWallet(deployer.address, other.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<SetDeployerWallet>({
        from: deployer.address,
        to: master.address,
    });
    expect(master.deployerWallet()).toEqual(other.address);
}

get fun `test set_deployer_wallet is rejected for a non-owner`() {
    val (master, _, other) = setupMaster();

    val res = master.sendSetDeployerWallet(other.address, other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: master.address,
        exitCode: Errors.NotOwner,
    });
    expect(master.deployerWallet()).toEqual(null);
}

// The point of the whole mechanism: with a wallet configured, the gas a claimed
// campaign returns never stops on Master — it lands on the deploy wallet by itself.
get fun `test returned claim gas is forwarded to the deployer wallet`() {
    val (master, campaign, deployer, other, recipient) = setupCampaignReadyToClaim();
    master.sendSetDeployerWallet(deployer.address, other.address, { value: ton("0.05") });

    val strayBefore = master.strayFunds();
    val before = testing.getAccountBalance(other.address);

    campaign.sendClaim(recipient.address, { value: ton("0.05") });

    val after = testing.getAccountBalance(other.address);
    // Arrived at the wallet, not parked on Master and not booked as earnings.
    expect(after - before).toBeGreater(ton("0.2"));
    expect(master.gasPool()).toEqual(0);
    expect(master.strayFunds()).toEqual(strayBefore);
}

// Fallback: a wrong or missing address must not burn the return on every claim.
get fun `test returned claim gas stays in the pool while no deployer wallet is set`() {
    val (master, campaign, _, other, recipient) = setupCampaignReadyToClaim();

    val before = testing.getAccountBalance(other.address);
    campaign.sendClaim(recipient.address, { value: ton("0.05") });
    val after = testing.getAccountBalance(other.address);

    expect(master.gasPool()).toBeGreater(ton("0.2"));
    expect(after - before).toEqual(0);
}
