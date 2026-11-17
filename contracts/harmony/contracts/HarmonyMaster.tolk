import "types"
import "@stdlib/tvm-dicts"

// Registry and campaign factory. Deploys HarmonyCampaign children.
// Holds HarmonyCampaign code cell for StateInit-based child deploys.
contract HarmonyMaster {
    author: "luciymetist"
    version: "0.2.0"
    description: "Harmony registry and campaign factory"
    storage: MasterStorage
    incomingMessages: MasterMessage
}

type MasterMessage = ChangeOwner | DeployCampaign | WithdrawStrayFunds | AddModerator | RemoveModerator | SetCampaignUsdtWallet
                   | CampaignGasReturn | RefillDeployer | SetCampaignCode | SetDeployerWallet
                   | CloseEmptyCampaign
                   | FreezeCampaign | UnfreezeCampaign | RefundCampaign | CampaignRefunded
                   | ExtendCampaignDeadline

// Send a bodiless order to a campaign this Master deployed. The address is
// resolved through the registry, so a message body can name a campaign but never an
// address — the only campaigns reachable from here are the ones we made.
fun forwardToCampaign(campaigns: dict, campaignId: uint64, opcode: int32, value: coins, mode: int) {
    var (maybeSlice, found) = campaigns.uDictGet(64, campaignId);
    assert (found) throw Errors.CampaignNotFound;
    var s = maybeSlice!;
    val campaignAddr = s.loadAddress();

    createMessage({
        bounce: BounceMode.NoBounce,
        value: value,
        dest: campaignAddr,
        body: beginCell().storeUint(opcode, 32).endCell(),
    }).send(mode | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

// Money coming home from a campaign — unspent deploy gas after a claim, or
// the last balance of a campaign that has refunded everyone. Both arrive under their own
// opcode so the chain records which happened, and both are handled identically here.
// Verified against the registry, so only a campaign this Master itself deployed can grow
// the pool or trigger a forward.
fun acceptCampaignReturn(campaignId: uint64, sender: address, value: coins) {
    var storage = lazy MasterStorage.load();
    var (maybeSlice, found) = storage.campaigns.uDictGet(64, campaignId);
    assert (found) throw Errors.CampaignNotFound;
    var s = maybeSlice!;
    assert (s.loadAddress() == sender) throw Errors.NotRegisteredCampaign;

    val deployerWallet = storage.extra.load().deployerWallet;
    if (deployerWallet != null) {
        // Straight through to the deploy wallet — no pool, no manual step.
        // CARRY_ALL_REMAINING_MESSAGE_VALUE pays the forwarding fee out of the returned
        // gas, so Master's own balance is untouched.
        // IGNORE_ERRORS. If this forward cannot be built — an
        // unreachable deployer wallet, not enough value to cover the fee — the action
        // phase must drop the message, not abort. Aborting bounces the return back to a
        // campaign that has already paid out, and in the refund case no longer exists.
        createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: deployerWallet,
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
    } else {
        // Not configured: hold it instead of burning it, withdrawable through
        // RefillDeployer.
        storage.gasPool += value;
        storage.save();
    }
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        var storage = lazy MasterStorage.load();
        storage.strayFunds += in.valueCoins;
        storage.save();
        return;
    }

    val msg = lazy MasterMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.owner = msg.newOwner;
            storage.save();
        }

        DeployCampaign => {
            assert (msg.deployValue >= ton("0.05")) throw Errors.InsufficientValue;
            assert (msg.deadline > blockchain.now()) throw Errors.InvalidDeadline;
            assert (msg.goalUsdt > 0 || msg.goalTon > 0) throw Errors.InvalidGoal;

            var storage = lazy MasterStorage.load();
            val (_, senderHash) = in.senderAddress.getWorkchainAndHash();
            val (_, isModerator) = storage.moderators.uDictGet(256, senderHash);
            assert (in.senderAddress == storage.owner || isModerator) throw Errors.Unauthorized;
            assert (storage.tipBps <= 1500) throw Errors.InvalidTipBps;

            val campaignId = storage.campaignCount;
            val incomingUsdtConfig = msg.usdtConfig.load();

            val campaignData = CampaignStorage {
                master:     contract.getAddress(),
                campaignId,
                recipient:  msg.recipient,
                goalUsdt:   msg.goalUsdt,
                goalTon:    msg.goalTon,
                deadline:   msg.deadline,
                tipBps:     storage.tipBps,
                deployFee:  msg.deployValue,
                raisedTon:  0,
                raisedUsdt: 0,
                donorCount: 0,
                status:     STATUS_ACTIVE,
                donations:  null,
                extra: CampaignExtra {
                    usdtConfig: CampaignUsdtConfig {
                        usdtMasterAddress: incomingUsdtConfig.usdtMasterAddress,
                        usdtJettonWallet:  incomingUsdtConfig.usdtJettonWallet,
                        platformWallet:    storage.platformWallet,
                    }.toCell(),
                    usdtDonations: null,
                }.toCell(),
            }.toCell();

            val campaignState = AutoDeployAddress {
                stateInit: ContractState {
                    code: storage.campaignCode,
                    data: campaignData,
                },
            };
            val campaignAddr = campaignState.calculateAddress();

            // Register in campaigns dict (key = uint64 id, value = 267-bit address)
            var campaigns = storage.campaigns;
            val addrSlice = beginCell().storeAddress(campaignAddr).endCell().beginParse();
            campaigns.uDictSet(64, campaignId, addrSlice);
            storage.campaigns = campaigns;

            storage.campaignCount = campaignId + 1;
            storage.save();

            createMessage({
                bounce: BounceMode.NoBounce,
                value: msg.deployValue,
                dest: campaignState,
            }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        // Sweeps money that landed here by accident, not platform revenue.
        WithdrawStrayFunds => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            val amount = storage.strayFunds;
            storage.strayFunds = 0;
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: amount,
                dest: msg.to,
            }).send(SEND_MODE_REGULAR);
        }

        AddModerator => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            val (_, addrHash) = msg.addr.getWorkchainAndHash();
            var mods = storage.moderators;
            val flagSlice = beginCell().storeUint(1, 1).endCell().beginParse();
            mods.uDictSet(256, addrHash, flagSlice);
            storage.moderators = mods;
            storage.save();
        }

        RemoveModerator => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            val (_, addrHash) = msg.addr.getWorkchainAndHash();
            var mods = storage.moderators;
            mods.uDictDelete(256, addrHash);
            storage.moderators = mods;
            storage.save();
        }

        SetCampaignUsdtWallet => {
            var storage = lazy MasterStorage.load();
            val (_, senderHash) = in.senderAddress.getWorkchainAndHash();
            val (_, isModerator) = storage.moderators.uDictGet(256, senderHash);
            assert (in.senderAddress == storage.owner || isModerator) throw Errors.Unauthorized;
            var (maybeSlice, found) = storage.campaigns.uDictGet(64, msg.campaignId);
            assert (found) throw Errors.CampaignNotFound;
            var s = maybeSlice!;
            val campaignAddr = s.loadAddress();
            val forwardBody = beginCell()
                .storeUint(0x10000006, 32)
                .storeAddress(msg.newWallet)
                .endCell();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.05"),
                dest: campaignAddr,
                body: forwardBody,
            }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        // Unspent deploy gas coming back from a campaign at claim time.
        // Verified against the registry, so only a campaign this Master itself
        // deployed can grow the pool or trigger a forward.
        // A campaign that has finished refunding every donor, sending its last
        // balance home as it destroys itself. Handled exactly like a gas return — the
        // money has the same shape and the same destination; only its meaning to an
        // off-chain reader differs, which is why it arrives under its own opcode.
        CampaignRefunded => {
            acceptCampaignReturn(msg.campaignId, in.senderAddress, in.valueCoins);
        }

        CampaignGasReturn => {
            acceptCampaignReturn(msg.campaignId, in.senderAddress, in.valueCoins);
        }

        // Destination is the sender, never a parameter — a leaked moderator
        // key can trigger a refill of the deploy wallet, not a transfer to itself.
        RefillDeployer => {
            var storage = lazy MasterStorage.load();
            val (_, senderHash) = in.senderAddress.getWorkchainAndHash();
            val (_, isModerator) = storage.moderators.uDictGet(256, senderHash);
            assert (in.senderAddress == storage.owner || isModerator) throw Errors.Unauthorized;
            val amount = storage.gasPool;
            assert (amount > 0) throw Errors.GasPoolEmpty;
            storage.gasPool = 0;
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: amount,
                dest: in.senderAddress,
            }).send(SEND_MODE_REGULAR);
        }

        // Affects future deploys only; already deployed campaigns keep their code.
        SetCampaignCode => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.campaignCode = msg.newCode;
            storage.save();
        }

        // Owner only — this address collects money on every future claim.
        SetDeployerWallet => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            // The deploy wallet lives in basechain like everything
            // else here. Refusing anything else costs nothing and closes the only found
            // production path to an undeliverable gas-return forward.
            val (newWalletWorkchain, _) = msg.newWallet.getWorkchainAndHash();
            assert (newWalletWorkchain == BASECHAIN) throw Errors.InvalidDeployerWallet;
            var extra = storage.extra.load();
            extra.deployerWallet = msg.newWallet;
            storage.extra = extra.toCell();
            storage.save();
        }

        // Freeze, unfreeze and refund, all addressed to a campaign the Master
        // itself deployed. The campaign address always comes from the registry, never
        // from the message body: a forged body could otherwise point a freeze order at
        // some other contract. Owner only, all three — freezing stops other people's
        // money from moving and refunding moves it back, so both are signed actions.
        FreezeCampaign => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            forwardToCampaign(storage.campaigns, msg.campaignId, 0x10000004, ton("0.02"), SEND_MODE_REGULAR);
        }

        UnfreezeCampaign => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            forwardToCampaign(storage.campaigns, msg.campaignId, 0x10000005, ton("0.02"), SEND_MODE_REGULAR);
        }

        // CARRY_REMAINING_VALUE, unlike the two above: the whole attached value goes to
        // the campaign. A campaign funded only in USDT holds nothing but its deploy fee,
        // while every jetton leg of the refund costs 0.05 TON — it cannot pay for its own
        // refund out of its own balance. So the owner funds the walk by attaching enough
        // to this order, and the leftover comes back with the campaign's final balance
        // when it destroys itself.
        RefundCampaign => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            forwardToCampaign(storage.campaigns, msg.campaignId, 0x10000008, 0, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        // Move a campaign's deadline forward. Not `forwardToCampaign`, because
        // this is the one order that carries a payload — the helper builds a bare opcode.
        // The campaign address still comes from the registry and never from the body, and
        // `newDeadline` is passed through untouched: validating it twice on two contracts
        // would only create a way for them to disagree. The campaign is where the rules
        // about what a legal new deadline is actually live.
        ExtendCampaignDeadline => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            var (maybeSlice, found) = storage.campaigns.uDictGet(64, msg.campaignId);
            assert (found) throw Errors.CampaignNotFound;
            var s = maybeSlice!;
            val campaignAddr = s.loadAddress();

            val forwardBody = beginCell()
                .storeUint(0x10000009, 32)
                .storeUint(msg.newDeadline, 32)
                .endCell();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.02"),
                dest: campaignAddr,
                body: forwardBody,
            }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        // Order a donation-less campaign past its deadline to hand its deploy
        // value back and destroy itself. Owner only — moderators may freeze a campaign
        // but must not be able to destroy one, and the whole point of the branch is
        // that it is a deliberate, signed accounting action.
        CloseEmptyCampaign => {
            var storage = lazy MasterStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            var (maybeSlice, found) = storage.campaigns.uDictGet(64, msg.campaignId);
            assert (found) throw Errors.CampaignNotFound;
            var s = maybeSlice!;
            val campaignAddr = s.loadAddress();

            // The registry entry is left in place on purpose. campaignId is a monotonic
            // counter and the dictionary is the audit trail of what this Master ever
            // deployed; deleting rows would make `campaignCount` and the registry
            // disagree, and the returning value is verified against exactly this entry.
            val forwardBody = beginCell()
                .storeUint(0x10000007, 32)
                .endCell();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.02"),
                dest: campaignAddr,
                body: forwardBody,
            }).send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    var storage = lazy MasterStorage.load();
    storage.strayFunds += in.valueCoins;
    storage.save();
}

get fun owner(): address {
    return MasterStorage.load().owner;
}

get fun tipBps(): uint32 {
    return MasterStorage.load().tipBps;
}

get fun campaignCount(): uint64 {
    return MasterStorage.load().campaignCount;
}

get fun get_campaign(id: uint64): address {
    val storage = MasterStorage.load();
    var (maybeSlice, found) = storage.campaigns.uDictGet(64, id);
    assert (found) throw Errors.CampaignNotFound;
    var s = maybeSlice!;
    return s.loadAddress();
}

get fun get_stats(): GetStatsResult {
    val s = MasterStorage.load();
    return GetStatsResult {
        campaignCount:  s.campaignCount,
        platformWallet: s.platformWallet,
        tipBps:         s.tipBps,
    };
}

get fun is_moderator(addr: address): bool {
    val storage = MasterStorage.load();
    val (_, addrHash) = addr.getWorkchainAndHash();
    val (_, found) = storage.moderators.uDictGet(256, addrHash);
    return found;
}

get fun usdtMasterAddress(): address {
    return MasterStorage.load().extra.load().usdtMasterAddress;
}

get fun strayFunds(): coins {
    return MasterStorage.load().strayFunds;
}

get fun gasPool(): coins {
    return MasterStorage.load().gasPool;
}

// Null until SetDeployerWallet is called; until then returned gas piles up
// in gasPool instead of being forwarded.
get fun deployerWallet(): address? {
    return MasterStorage.load().extra.load().deployerWallet;
}

// Makes SetCampaignCode observable — without it nothing outside the
// contract can tell which code the next deploy will use.
get fun campaignCodeHash(): uint256 {
    return MasterStorage.load().campaignCode.hash();
}
