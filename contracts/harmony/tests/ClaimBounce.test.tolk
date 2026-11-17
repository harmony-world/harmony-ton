// Fixed behaviour for audit findings A-01 and A-02.
//
// A-01: `onBouncedMessage` used to react to any bounce. Claim sends three
// bounceable messages and they mean opposite things when they return, so the
// handler now tells them apart by the opcode left in the bounced body.
// A-02: `SetDeployerWallet` used to accept any address; the master forward that
// address feeds is also sent with IGNORE_ERRORS now.
//
// The defect itself is proven in `ClaimBounceRepro.test.tolk`; this file proves the
// behaviour after the fix. Mutation check for A-01 is written under each test.

import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyMaster.gen"
import "@wrappers/HarmonyCampaign.gen"

// An address nobody deployed. A bounceable message sent here comes back, which is
// how a failing payout leg is reproduced without breaking the recipient wallet.
fun deadAddress(): address {
    return address.fromWorkchainAndHash(BASECHAIN,
        0x5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead);
}

// Same shape as the repro setup: campaignId 99 is absent from Master's registry,
// so the gas return is answered with CampaignNotFound and bounces back.
fun setupUnregisteredCampaign(recipientAddr: address): HarmonyCampaign {
    val deployer   = testing.treasury("bounce_deployer");
    val usdtMaster = testing.treasury("bounce_usdtm");
    val usdtWallet = testing.treasury("bounce_usdtw");
    val donor      = testing.treasury("bounce_donor");

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

    val campaign = HarmonyCampaign.fromStorage({
        master:     master.address,
        campaignId: 99,
        recipient:  recipientAddr,
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
    return campaign;
}

// ── A-01 fixed: the gas return bounces, the recipient keeps the money ─────────
//
// This is the repro scenario with the expectation inverted. Mutation check:
// drop the `0x20000006` early return from `onBouncedMessage` (that is, go back to
// "react to any bounce") and this test fails on the status assertion — it reads
// STATUS_ACTIVE, exactly what the repro test records as the defect.

get fun `test a bounced gas return leaves the paid campaign closed`() {
    val recipient = testing.treasury("bounce_recip");
    val campaign = setupUnregisteredCampaign(recipient.address);

    val before = testing.getAccountBalance(recipient.address);
    campaign.sendClaim(recipient.address, { value: ton("0.05") });
    val after = testing.getAccountBalance(recipient.address);

    // The payout leg went through, as in the repro.
    expect(after - before).toBeGreater(ton("0.9"));

    // …and the bounced gas return no longer rewinds the campaign.
    val status = campaign.get_status();
    expect(status.status).toEqual(STATUS_FUNDED);
}

// ── The fix must not silence the bounces that do matter ──────────────────────
//
// Guard against over-fixing: if `onBouncedMessage` ignored every bounce, the
// campaign below would stay FUNDED with nobody paid. Here the recipient does not
// exist, so the payout leg bounces too, and the payout bounce must still reopen
// the campaign. (The gas return bounces as well in this setup; that leg is now a
// no-op, so the outcome is decided by the payout leg alone.)

get fun `test a bounced payout still reopens the campaign`() {
    val campaign = setupUnregisteredCampaign(deadAddress());

    campaign.sendClaim(deadAddress(), { value: ton("0.05") });

    val status = campaign.get_status();
    expect(status.status).toEqual(STATUS_ACTIVE);
}

// ── A-02 fixed: SetDeployerWallet refuses an address outside basechain ───────

get fun `test SetDeployerWallet rejects a non-basechain address`() {
    val owner      = testing.treasury("bounceb_owner");
    val usdtMaster = testing.treasury("bounceb_usdtm");

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
    master.deploy(owner.address, { value: ton("0.1") });

    val masterchainWallet = address.fromWorkchainAndHash(MASTERCHAIN,
        0x5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead5ec1dead);
    val res = master.sendSetDeployerWallet(owner.address, masterchainWallet, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: owner.address,
        to: master.address,
        exitCode: Errors.InvalidDeployerWallet,
    });
    expect(master.deployerWallet()).toEqual(null);

    // Negative control: a basechain address still goes through, otherwise the
    // check would be indistinguishable from "SetDeployerWallet is broken".
    val ok = master.sendSetDeployerWallet(owner.address, deadAddress(), { value: ton("0.05") });
    expect(ok).toHaveSuccessfulTx<SetDeployerWallet>({
        from: owner.address,
        to: master.address,
    });
    expect(master.deployerWallet()).toEqual(deadAddress());
}
