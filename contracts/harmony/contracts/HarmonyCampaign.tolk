import "types"
import "@stdlib/tvm-dicts"

// Per-campaign escrow. Deployed by HarmonyMaster.
// Tips are sent to platformWallet on each donation. Claim when goal reached; refund otherwise.
contract HarmonyCampaign {
    author: "luciymetist"
    version: "0.2.0"
    description: "Harmony per-campaign escrow"
    storage: CampaignStorage
    incomingMessages: CampaignMessage
}

type CampaignMessage = ChangeOwner | Donate | Claim | Refund | Freeze | Unfreeze | TransferNotification | SetUsdtJettonWallet | CloseEmpty | RefundBatch | ExtendDeadline

// How many donors one RefundBatch message serves before handing the rest to
// the next one. A constant rather than a message field, so nothing external can ask
// for a batch that exceeds the gas limit. The worst case per donor is two outgoing
// messages (TON leg + USDT jetton transfer), so the real ceiling is 2× this number.
const REFUND_BATCH_SIZE: int = 10;

// TON attached to the self-sent continuation. Comes out of the campaign
// balance — that is, out of the deploy fee and the platform's own gas, never out of
// a donation: a donor must get back exactly what they gave.
const REFUND_BATCH_GAS: coins = ton("0.1");

// The donation dicts are keyed by address hash alone, so the workchain is not
// stored. Every wallet the platform deals with is on the basechain — donations arrive
// from TonConnect wallets, and the pull-refund path works from any workchain because
// it answers the sender directly. Push refunds rebuild the address and therefore have
// to assume workchain 0.
const REFUND_WORKCHAIN: int8 = 0;

// One donor's refund, shared by the pull (`Refund`) and push (`RefundBatch`)
// paths. Two copies of this arithmetic would drift apart, and the first sign of the
// drift would be someone getting the wrong amount of their own money back.
fun sendDonorRefund(
    donor: address,
    refundTonAmount: coins,
    refundUsdtAmount: coins,
    usdtJettonWallet: address,
) {
    if (refundTonAmount > 0) {
        // PAY_FEES_SEPARATELY: the forward fee comes off the campaign balance, not off
        // the refund. A donor getting back 0.999 of the 1 TON they gave is the platform
        // charging them for its own mistake (decision of 2026-09-21).
        createMessage({
            bounce: BounceMode.NoBounce,
            value: refundTonAmount,
            dest: donor,
        }).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
    }

    if (refundUsdtAmount > 0) {
        val transferBody = beginCell()
            .storeUint(0x0f8a7ea5, 32)
            .storeUint(0, 64)
            .storeCoins(refundUsdtAmount)
            .storeAddress(donor)
            .storeAddress(donor)
            .storeUint(0, 1)
            .storeCoins(1)
            .storeUint(0, 1)
            .endCell();

        createMessage({
            bounce: BounceMode.NoBounce,
            value: ton("0.05"),
            dest: usdtJettonWallet,
            body: transferBody,
        }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
    }
}

fun loadTipBpsFromForwardPayloadBody(payload: slice, fallbackTipBps: uint32): uint32 {
    if (payload.remainingBitsCount() < 64) {
        return fallbackTipBps;
    }

    val op = payload.loadUint(32);
    if (op != 0x10000001) {
        return fallbackTipBps;
    }

    val tipBps: uint32 = payload.loadUint(32);
    assert (tipBps <= 1500) throw Errors.InvalidTipBps;
    return tipBps;
}

fun loadTipBpsFromForwardPayload(payload: RemainingBitsAndRefs, fallbackTipBps: uint32): uint32 {
    if (payload.isEmpty()) {
        return fallbackTipBps;
    }

    var payloadEither = payload;
    val payloadRef = payloadEither.loadMaybeRef();
    if (payloadRef != null) {
        payloadEither.assertEnd();
        return loadTipBpsFromForwardPayloadBody(payloadRef!.beginParse(), fallbackTipBps);
    }

    return loadTipBpsFromForwardPayloadBody(payloadEither, fallbackTipBps);
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy CampaignMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.master) throw Errors.NotMaster;
            storage.master = msg.newOwner;
            storage.save();
        }

        Donate => {
            var storage = lazy CampaignStorage.load();
            assert (storage.status == STATUS_ACTIVE) throw Errors.CampaignNotActive;
            assert (blockchain.now() < storage.deadline) throw Errors.DeadlinePassed;
            assert (msg.tipBps <= 1500) throw Errors.InvalidTipBps;

            val tipAmount = in.valueCoins * msg.tipBps / 10000;
            val donationAmount = in.valueCoins - tipAmount;
            val extra = storage.extra.load();
            val usdtConfig = extra.usdtConfig.load();

            if (tipAmount > 0) {
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: tipAmount,
                    dest: usdtConfig.platformWallet,
                }).send(SEND_MODE_REGULAR);
            }

            // Track per-donor amount for refunds (key = 256-bit address hash).
            // The key is the hash alone, so a push refund has to rebuild the
            // address and can only assume basechain. A masterchain donor would be paid
            // to an address that is not his. Refusing the donation loses him nothing;
            // accepting it could lose him everything.
            val (donorWc, addrHash) = in.senderAddress.getWorkchainAndHash();
            assert (donorWc == 0) throw Errors.DonorNotBasechain;
            var (maybeExisting, alreadyDonated) = storage.donations.uDictGet(256, addrHash);
            val (_, hasUsdtDonation) = extra.usdtDonations.uDictGet(256, addrHash);
            var existingAmount: coins = 0;
            if (alreadyDonated) {
                var existSlice = maybeExisting!;
                existingAmount = existSlice.loadCoins();
            } else if (!hasUsdtDonation) {
                storage.donorCount += 1;
            }

            var donations = storage.donations;
            val newAmount = existingAmount + donationAmount;
            val valSlice = beginCell().storeCoins(newAmount).endCell().beginParse();
            donations.uDictSet(256, addrHash, valSlice);
            storage.donations = donations;

            storage.raisedTon += donationAmount;
            storage.save();
        }

        TransferNotification => {
            var storage = lazy CampaignStorage.load();
            assert (storage.status == STATUS_ACTIVE) throw Errors.CampaignNotActive;
            assert (blockchain.now() < storage.deadline) throw Errors.DeadlinePassed;
            var extra = storage.extra.load();
            val usdtConfig = extra.usdtConfig.load();
            // sender must be the campaign's known USDT jetton wallet
            assert (in.senderAddress == usdtConfig.usdtJettonWallet) throw Errors.InvalidJettonSender;

            val tipBps = loadTipBpsFromForwardPayload(msg.forwardPayload, storage.tipBps);
            val tipAmount = msg.amount * tipBps / 10000;
            val donationAmount = msg.amount - tipAmount;

            if (tipAmount > 0) {
                // TEP-74 transfer: campaign jetton wallet → platform wallet.
                val transferBody = beginCell()
                    .storeUint(0x0f8a7ea5, 32)  // transfer op
                    .storeUint(0, 64)             // query_id
                    .storeCoins(tipAmount)
                    .storeAddress(usdtConfig.platformWallet) // destination
                    .storeAddress(usdtConfig.platformWallet) // response_destination
                    .storeUint(0, 1)              // custom_payload: null
                    .storeCoins(1)                // forward_ton_amount: minimal
                    .storeUint(0, 1)              // forward_payload: empty
                    .endCell();

                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: ton("0.05"),
                    dest: usdtConfig.usdtJettonWallet,
                    body: transferBody,
                }).send(SEND_MODE_REGULAR);
            }

            // Same basechain requirement as the TON leg above.
            val (donorWc, addrHash) = msg.sender.getWorkchainAndHash();
            assert (donorWc == 0) throw Errors.DonorNotBasechain;
            val (_, hasTonDonation) = storage.donations.uDictGet(256, addrHash);
            var (maybeExisting, alreadyDonated) = extra.usdtDonations.uDictGet(256, addrHash);
            var existingAmount: coins = 0;
            if (alreadyDonated) {
                var existSlice = maybeExisting!;
                existingAmount = existSlice.loadCoins();
            } else if (!hasTonDonation) {
                storage.donorCount += 1;
            }

            var usdtDonations = extra.usdtDonations;
            val newAmount = existingAmount + donationAmount;
            val valSlice = beginCell().storeCoins(newAmount).endCell().beginParse();
            usdtDonations.uDictSet(256, addrHash, valSlice);
            extra.usdtDonations = usdtDonations;
            storage.extra = extra.toCell();
            storage.raisedUsdt += donationAmount;
            storage.save();
        }

        Claim => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.recipient) throw Errors.NotRecipient;
            assert (storage.status == STATUS_ACTIVE) throw Errors.AlreadyClaimed;

            val goalReached = (storage.goalUsdt > 0 && storage.raisedUsdt >= storage.goalUsdt)
                           || (storage.goalTon > 0 && storage.raisedTon >= storage.goalTon);
            val deadlinePassed = blockchain.now() >= storage.deadline;
            val anyRaised = storage.raisedUsdt > 0 || storage.raisedTon > 0;
            assert (goalReached || (deadlinePassed && anyRaised)) throw Errors.GoalNotReached;

            // deployFee is no longer a separate outgoing message — it leaves with
            // the carry-all gas return — so it is no longer part of the requirement.
            // What must be covered: the TON payout, the jetton transfer, and gas.
            var requiredClaimBalance = storage.raisedTon + ton("0.02");
            if (storage.raisedUsdt > 0) {
                requiredClaimBalance += ton("0.05");
            }
            assert (contract.getOriginalBalance() >= requiredClaimBalance) throw Errors.InsufficientValue;

            storage.status = STATUS_FUNDED;
            storage.save();

            if (storage.raisedUsdt > 0) {
                var extra = storage.extra.load();
                val usdtConfig = extra.usdtConfig.load();
                val transferBody = beginCell()
                    .storeUint(0x0f8a7ea5, 32)
                    .storeUint(0, 64)
                    .storeCoins(storage.raisedUsdt as coins)
                    .storeAddress(storage.recipient)
                    // response_destination is the recipient, because the 0.05 this
                    // message carries is the recipient's — `ClaimButton` attaches it to the
                    // Claim and the campaign only forwards it. An earlier version sent the change to the
                    // platform wallet on the premise that the gas was ours; a live mainnet
                    // claim showed the chain burns 0.000494 of it and the remaining 0.049388
                    // was landing on the platform. That is a withdrawal fee wearing the word
                    // "gas", on a screen that promises no fees. It still cannot point at
                    // master — the jetton wallet answers with excesses (op 0xd53276db) and
                    // master rejects unknown bodies — but the recipient is a wallet and takes
                    // them fine.
                    .storeAddress(storage.recipient)
                    .storeUint(0, 1)
                    .storeCoins(1)
                    .storeUint(0, 1)
                    .endCell();

                createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: ton("0.05"),
                    dest: usdtConfig.usdtJettonWallet,
                    body: transferBody,
                }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }

            // The recipient gets exactly what was raised in TON, never the leftover
            // deploy gas. With no TON donations there is no message at all — a USDT-only
            // campaign must not pay out a single nanoton of TON.
            if (storage.raisedTon > 0) {
                createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: storage.raisedTon as coins,
                    dest: storage.recipient,
                }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }

            // Whatever is still on the balance is gas the platform put in at deploy
            // time. It goes back to master's gasPool. This message also carries the
            // deployFee, so the separate deployFee leg is gone.
            val gasReturnBody = beginCell()
                .storeUint(0x20000006, 32)
                .storeUint(storage.campaignId, 64)
                .endCell();

            createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: 0,
                dest: storage.master,
                body: gasReturnBody,
            }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        Refund => {
            var storage = lazy CampaignStorage.load();

            assert (storage.status == STATUS_FROZEN) throw Errors.CampaignNotActive;
            assert (storage.donorCount > 0) throw Errors.NothingToRefund;
            var extra = storage.extra.load();

            val (_, addrHash) = in.senderAddress.getWorkchainAndHash();
            var (maybeTonSlice, foundTon) = storage.donations.uDictGet(256, addrHash);
            var (maybeUsdtSlice, foundUsdt) = extra.usdtDonations.uDictGet(256, addrHash);
            assert (foundTon || foundUsdt) throw Errors.NothingToRefund;

            var refundTonAmount: coins = 0;
            if (foundTon) {
                var tonSlice = maybeTonSlice!;
                refundTonAmount = tonSlice.loadCoins();
                assert (storage.raisedTon >= refundTonAmount) throw Errors.NothingToRefund;
            }

            var refundUsdtAmount: coins = 0;
            if (foundUsdt) {
                var usdtSlice = maybeUsdtSlice!;
                refundUsdtAmount = usdtSlice.loadCoins();
                assert (storage.raisedUsdt >= refundUsdtAmount) throw Errors.NothingToRefund;
            }

            var donations = storage.donations;
            if (foundTon) {
                donations.uDictDelete(256, addrHash);
            }
            storage.donations = donations;

            var usdtDonations = extra.usdtDonations;
            if (foundUsdt) {
                usdtDonations.uDictDelete(256, addrHash);
            }
            extra.usdtDonations = usdtDonations;
            storage.extra = extra.toCell();

            storage.raisedTon -= refundTonAmount;
            storage.raisedUsdt -= refundUsdtAmount;
            storage.donorCount -= 1;
            val isLastRefund = storage.donorCount == 0;

            if (isLastRefund) {
                storage.status = STATUS_REFUNDED;
            }
            storage.save();

            sendDonorRefund(
                in.senderAddress,
                refundTonAmount,
                refundUsdtAmount,
                extra.usdtConfig.load().usdtJettonWallet,
            );

            if (isLastRefund) {
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: 0,
                    dest: storage.master,
                }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_DESTROY);
            }
        }

        // The push side of Refund. Master starts it, the campaign continues it
        // by sending the same message to itself until both donation dicts are empty.
        // Each donor gets back exactly what they gave; the gas for the walk comes out
        // of the campaign balance, which is the platform's own deploy value.
        RefundBatch => {
            var storage = lazy CampaignStorage.load();

            val fromSelf = in.senderAddress == contract.getAddress();
            assert (in.senderAddress == storage.master || fromSelf) throw Errors.NotMaster;
            assert (storage.status == STATUS_FROZEN) throw Errors.NotFrozen;
            assert (storage.donorCount > 0) throw Errors.NothingToRefund;

            var extra = storage.extra.load();
            val usdtJettonWallet = extra.usdtConfig.load().usdtJettonWallet;
            var donations = storage.donations;
            var usdtDonations = extra.usdtDonations;

            var processed: int = 0;
            var exhausted: bool = false;

            while (processed < REFUND_BATCH_SIZE && !exhausted) {
                var addrHash: int = 0;
                var refundTonAmount: coins = 0;
                var refundUsdtAmount: coins = 0;
                var found: bool = false;

                // TON donors first, taking the donor's USDT entry along with them — a
                // donor who gave both is one donor, and donorCount counts them once.
                val (tonKey, tonValue, hasTon) = donations.uDictDeleteFirstAndGet(256);
                if (hasTon) {
                    addrHash = tonKey!;
                    var tonSlice = tonValue!;
                    refundTonAmount = tonSlice.loadCoins();
                    found = true;

                    val (usdtValue, hasUsdt) = usdtDonations.uDictGet(256, addrHash);
                    if (hasUsdt) {
                        var usdtSlice = usdtValue!;
                        refundUsdtAmount = usdtSlice.loadCoins();
                        usdtDonations.uDictDelete(256, addrHash);
                    }
                } else {
                    // Then whoever is left: donors who gave USDT only.
                    val (usdtKey, usdtValue, hasUsdt) = usdtDonations.uDictDeleteFirstAndGet(256);
                    if (hasUsdt) {
                        addrHash = usdtKey!;
                        var usdtSlice = usdtValue!;
                        refundUsdtAmount = usdtSlice.loadCoins();
                        found = true;
                    }
                }

                if (!found) {
                    exhausted = true;
                } else {
                    assert (storage.raisedTon >= refundTonAmount) throw Errors.NothingToRefund;
                    assert (storage.raisedUsdt >= refundUsdtAmount) throw Errors.NothingToRefund;
                    assert (storage.donorCount > 0) throw Errors.NothingToRefund;

                    storage.raisedTon -= refundTonAmount;
                    storage.raisedUsdt -= refundUsdtAmount;
                    storage.donorCount -= 1;

                    sendDonorRefund(
                        address.fromWorkchainAndHash(REFUND_WORKCHAIN, addrHash),
                        refundTonAmount,
                        refundUsdtAmount,
                        usdtJettonWallet,
                    );

                    processed += 1;
                }
            }

            storage.donations = donations;
            extra.usdtDonations = usdtDonations;
            storage.extra = extra.toCell();

            val isDone = storage.donorCount == 0 || exhausted;
            if (isDone) {
                storage.status = STATUS_REFUNDED;
            }
            storage.save();

            if (isDone) {
                // Carries an opcode rather than going out empty: an empty final message is
                // indistinguishable from the gas return a claimed campaign sends, and an
                // observer off-chain has no other way to learn that these donors were
                // repaid. NoBounce for the same reason as the gas return — by the time an
                // answer could arrive this contract no longer exists.
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: 0,
                    dest: storage.master,
                    body: beginCell()
                        .storeUint(0x2000000E, 32)
                        .storeUint(storage.campaignId, 64)
                        .endCell(),
                }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_DESTROY);
            } else {
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: REFUND_BATCH_GAS,
                    dest: contract.getAddress(),
                    body: beginCell().storeUint(0x10000008, 32).endCell(),
                }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }
        }

        Freeze => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.master) throw Errors.NotMaster;
            assert (storage.status == STATUS_ACTIVE) throw Errors.CampaignNotActive;
            storage.status = STATUS_FROZEN;
            storage.save();
        }

        Unfreeze => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.master) throw Errors.NotMaster;
            assert (storage.status == STATUS_FROZEN) throw Errors.CampaignNotActive;
            storage.status = STATUS_ACTIVE;
            storage.save();
        }

        // The deadline moves forward, and only forward.
        //
        // Two rights hang on the deadline, and both accrue the moment it passes: the
        // donor's right to a refund of a campaign that missed its goal, and the
        // recipient's right to claim what was raised without reaching it. Moving the
        // deadline after that moment takes an accrued right away from someone who
        // already had it. So the branch splits on whether anything has accrued:
        // before the deadline nobody holds either right yet and the extension is free;
        // after it, the campaign must have no donors at all — which is exactly the case
        // the admin panel needs, a campaign that collected nothing and deserves another
        // run. A campaign with donors past its deadline is finished, and the way to give
        // it another run is a new campaign, not a retroactive one.
        ExtendDeadline => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.master) throw Errors.NotMaster;
            assert (storage.status == STATUS_ACTIVE) throw Errors.CampaignNotActive;

            // Forward of both the old deadline and of now: the first forbids shortening
            // (which would hand the recipient an early claim), the second forbids
            // "extending" an expired campaign into a deadline that is itself already past.
            assert (msg.newDeadline > storage.deadline) throw Errors.DeadlineNotExtended;
            assert (msg.newDeadline > blockchain.now()) throw Errors.DeadlineNotExtended;

            if (blockchain.now() >= storage.deadline) {
                assert (storage.donorCount == 0) throw Errors.DeadlineRightsAccrued;
            }

            storage.deadline = msg.newDeadline;
            storage.save();
        }

        SetUsdtJettonWallet => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.master) throw Errors.NotMaster;
            var extra = storage.extra.load();
            val usdtConfig = extra.usdtConfig.load();
            assert (usdtConfig.usdtJettonWallet == usdtConfig.usdtMasterAddress) throw Errors.UsdtWalletAlreadySet;
            extra.usdtConfig = CampaignUsdtConfig {
                usdtMasterAddress: usdtConfig.usdtMasterAddress,
                usdtJettonWallet:  msg.newWallet,
                platformWallet:    usdtConfig.platformWallet,
            }.toCell();
            storage.extra = extra.toCell();
            storage.save();
        }

        // Reclaim the deploy value from a campaign that never took money.
        // Such a campaign is a dead end by construction — Claim asserts `anyRaised`
        // and Refund asserts a donor exists — so without this branch its balance is
        // parked forever and storage rent grinds it down.
        CloseEmpty => {
            var storage = lazy CampaignStorage.load();
            assert (in.senderAddress == storage.master) throw Errors.NotMaster;

            // "Empty" is checked against the campaign's own books, not against its
            // balance: a donation that arrived and was refunded still leaves traces,
            // and a campaign that ever held someone else's money must not be closable
            // by us. donorCount alone would be enough today; the two raised counters
            // are asserted as well so that a future bug in donor accounting cannot
            // quietly turn this into a way to destroy a funded campaign.
            assert (storage.donorCount == 0) throw Errors.CampaignNotEmpty;
            assert (storage.raisedTon == 0) throw Errors.CampaignNotEmpty;
            assert (storage.raisedUsdt == 0) throw Errors.CampaignNotEmpty;

            // A campaign with no donations yet is not dead, it is young. Waiting for
            // the deadline is what makes this an accounting cleanup rather than a
            // power to cancel someone's fundraiser mid-flight.
            assert (blockchain.now() >= storage.deadline) throw Errors.DeadlineNotPassed;

            // FUNDED is unreachable here (Claim needs `anyRaised`), REFUNDED means the
            // contract is already destroyed. ACTIVE and FROZEN are the live states.
            assert (storage.status == STATUS_ACTIVE || storage.status == STATUS_FROZEN)
                throw Errors.CampaignNotActive;

            // Same body as the claim-time gas return, deliberately: Master already
            // verifies this sender against its registry and forwards the value to the
            // deploy wallet. Reusing the path means no second code path to keep honest.
            val gasReturnBody = beginCell()
                .storeUint(0x20000006, 32)
                .storeUint(storage.campaignId, 64)
                .endCell();

            // NoBounce: the contract is gone by the time an answer could arrive. If
            // Master rejects the message the value stays on Master's balance, where the
            // owner can still reach it — a bounce to a destroyed account could not be
            // delivered anywhere useful.
            createMessage({
                bounce: BounceMode.NoBounce,
                value: 0,
                dest: storage.master,
                body: gasReturnBody,
            }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_DESTROY);
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    // Claim sends three bounceable messages and a returned one
    // means the opposite thing depending on which it is. The payout legs — the TON
    // transfer to the recipient (empty body) and the USDT jetton transfer (0x0f8a7ea5) —
    // mean nobody was paid, so the campaign must reopen. The gas return (0x20000006) is
    // the platform reclaiming its own deploy gas *after* the recipient has been paid; if
    // that one bounces the campaign must stay FUNDED. Otherwise the indexer sees a claim,
    // the getter answers ACTIVE, and a donor past the deadline is offered a Refund that
    // no remaining balance can honour.
    var body = in.bouncedBody;
    body.skipBouncedPrefix();
    if (body.remainingBitsCount() >= 32 && body.loadUint(32) == 0x20000006) {
        return;
    }

    var storage = lazy CampaignStorage.load();
    if (storage.status == STATUS_FUNDED) {
        storage.status = STATUS_ACTIVE;
        // The gas return carries the whole balance and leaves in the same action phase,
        // so by the time a payout leg bounces the deploy fee is already back at master.
        storage.deployFee = 0;
        storage.save();
    }
}

get fun master(): address {
    return CampaignStorage.load().master;
}

get fun campaignId(): uint64 {
    return CampaignStorage.load().campaignId;
}

get fun recipient(): address {
    return CampaignStorage.load().recipient;
}

get fun raisedTon(): uint64 {
    return CampaignStorage.load().raisedTon;
}

get fun raisedUsdt(): uint64 {
    return CampaignStorage.load().raisedUsdt;
}

get fun status(): uint8 {
    return CampaignStorage.load().status;
}

get fun get_status(): GetStatusResult {
    val s = CampaignStorage.load();
    return GetStatusResult {
        goalUsdt:   s.goalUsdt,
        goalTon:    s.goalTon,
        raisedTon:  s.raisedTon,
        raisedUsdt: s.raisedUsdt,
        deadline:   s.deadline,
        status:     s.status,
        donorCount: s.donorCount,
        deployFee:  s.deployFee,
    };
}
