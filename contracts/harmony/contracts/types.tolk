// Shared types, error codes, and op-code structs for the Harmony contract suite.

enum Errors {
    NotOwner             = 100
    InvalidMessage       = 0xFFFF
    NotMaster            = 101
    CampaignClosed       = 102
    GoalNotReached       = 103
    AlreadyVerified      = 104
    Unauthorized         = 105
    CampaignNotActive    = 106   // status != ACTIVE (or FUNDED for claim)
    NotRecipient         = 107   // claim called not by recipient
    NothingToRefund      = 108   // donor not found in donations dict
    DeadlinePassed       = 109   // donation after deadline
    DeadlineNotPassed    = 110   // refund before deadline
    AlreadyClaimed       = 111   // claim called when status != ACTIVE
    CampaignNotFound     = 112   // get_campaign id not in registry
    InvalidDeadline      = 113   // deadline must be in the future
    InsufficientValue    = 114   // deploy value too small
    InvalidJettonSender  = 115   // transfer_notification from unknown jetton wallet
    InvalidTipBps        = 116   // tip exceeds maximum (1500 = 15%)
    InvalidGoal          = 117   // both goalUsdt and goalTon are zero
    UsdtWalletAlreadySet = 118   // usdtJettonWallet already initialized (not placeholder)
    GasPoolEmpty         = 119   // RefillDeployer called with nothing to send
    NotRegisteredCampaign = 120  // CampaignGasReturn sender does not match the registry entry
    InvalidDeployerWallet = 121  // SetDeployerWallet given an address outside basechain
    CampaignNotEmpty     = 122   // CloseEmptyCampaign on a campaign that took money
    NotFrozen            = 123   // RefundBatch on a campaign that is not FROZEN
    DonorNotBasechain    = 124   // donation from outside workchain 0 — a push refund could not reach it
    DeadlineNotExtended  = 125   // ExtendDeadline that does not move the deadline forward
    DeadlineRightsAccrued = 126  // ExtendDeadline past the deadline on a campaign that has donors
}

// CampaignStatus constants — uint8 + constants instead of enum.
// Tolk 1.1.0 does not support enum comparison in get-methods.
const STATUS_ACTIVE:   uint8 = 0;
const STATUS_FUNDED:   uint8 = 1;
const STATUS_REFUNDED: uint8 = 2;
const STATUS_FROZEN:   uint8 = 3;

// ── HarmonyMaster storage ────────────────────────────────────────────────────

// Cold fields behind a ref: written at deploy, read only by get-methods.
// Adding gasPool inline pushed MasterStorage over 1023 bits; moving
// this address out keeps the hot counters inline and the struct provably in range.
struct MasterExtra {
    usdtMasterAddress: address  // TON USDT jetton master (reference for admin tooling)
    // The wallet that pays for campaign deploys. When set, gas returned by a
    // claimed campaign is forwarded here on arrival instead of piling up on Master.
    // `null` means "not configured yet" — the gas then accumulates in gasPool, so an
    // unset address never burns money on every claim.
    deployerWallet: address? = null
}

// This struct holds exactly four refs — campaignCode, the two dicts
// and extra — which is the TVM cell maximum. A fifth ref-bearing field will not fit,
// so new configuration goes inside MasterExtra, not here.
struct MasterStorage {
    owner: address              // deployer / admin
    platformWallet: address     // receives tips from campaigns
    tipBps: uint32              // platform fee in basis points (e.g. 100 = 1%)
    campaignCount: uint64       // monotonic counter, used as campaign id
    campaignCode: cell          // HarmonyCampaign compiled code for factory deploy
    campaigns: dict             // HashmapE 64 address — campaign_id → campaign address
    moderators: dict            // HashmapE 256 bit — addr_hash → 1 (presence flag)
    strayFunds: coins           // TON that arrived at Master with no op — bounces and
                                // stray transfers. NOT platform tips: tips go straight from the
                                // campaign to platformWallet and never touch Master.
    gasPool: coins              // Deploy gas returned by campaigns on claim; refills the deployer, never withdrawable as tips
    extra: Cell<MasterExtra>    // cold config, see MasterExtra
}

fun MasterStorage.load(): MasterStorage {
    return MasterStorage.fromCell(contract.getData());
}

fun MasterStorage.save(self) {
    contract.setData(self.toCell());
}

// ── HarmonyMaster get-method return ─────────────────────────────────────────

struct GetStatsResult {
    campaignCount: uint64
    platformWallet: address
    tipBps: uint32
}

// USDT config packed into a cell ref to keep CampaignStorage within 1023 bits.
struct CampaignUsdtConfig {
    usdtMasterAddress: address  // USDT jetton master (for reference / future checks)
    usdtJettonWallet: address   // campaign's own USDT jetton wallet — verified on transfer_notification
    platformWallet: address     // receives TON and USDT platform tips
}

struct CampaignExtra {
    usdtConfig: Cell<CampaignUsdtConfig>
    usdtDonations: dict // HashmapE 256 coins — donor address hash → USDT donated
}

// ── HarmonyCampaign storage ──────────────────────────────────────────────────
// Inline bits: ~895 (two addresses + campaignId + scalars + HashmapE bit) + 1 cell ref for usdtConfig.

@overflow1023_policy("suppress")
struct CampaignStorage {
    master: address
    campaignId: uint64  // unique id from HarmonyMaster.campaignCount; part of StateInit address derivation
    recipient: address
    goalUsdt: uint64    // fundraising goal in nUSDT (1e6 units = 1 USDT)
    goalTon: uint64     // TON goal in nanotons; 0 disables TON goal check
    deadline: uint32    // unix timestamp
    tipBps: uint32      // tip in basis points, set by master at deploy time
    deployFee: coins    // TON spent on deploy, returned to master on claim
    raisedTon: uint64   // TON raised in nanotons (net of tip)
    raisedUsdt: uint64  // USDT raised in nUSDT units (net of tip)
    donorCount: uint32
    status: uint8       // STATUS_* constant
    donations: dict     // HashmapE 256 coins — donor address hash → TON donated
    extra: Cell<CampaignExtra>
}

fun CampaignStorage.load(): CampaignStorage {
    return CampaignStorage.fromCell(contract.getData());
}

fun CampaignStorage.save(self) {
    contract.setData(self.toCell());
}

// ── HarmonyCampaign get-method return ────────────────────────────────────────

struct GetStatusResult {
    goalUsdt: uint64
    goalTon: uint64
    raisedTon: uint64
    raisedUsdt: uint64
    deadline: uint32
    status: uint8
    donorCount: uint32
    deployFee: coins
}

// ── HarmonyDonationNFT storage ───────────────────────────────────────────────

struct NftCollectionStorage {
    owner: address       // HarmonyMaster
    nextItemIndex: uint64
    collectionContent: cell
    nftItemCode: cell
}

fun NftCollectionStorage.load(): NftCollectionStorage {
    return NftCollectionStorage.fromCell(contract.getData());
}

fun NftCollectionStorage.save(self) {
    contract.setData(self.toCell());
}

// ── HarmonyVerifier storage ──────────────────────────────────────────────────

struct VerifierStorage {
    owner: address       // master admin
    threshold: uint8     // M-of-N required signatures
    signerCount: uint8
    // signers dict omitted in scaffold
}

fun VerifierStorage.load(): VerifierStorage {
    return VerifierStorage.fromCell(contract.getData());
}

fun VerifierStorage.save(self) {
    contract.setData(self.toCell());
}

// ── Shared op-code messages ──────────────────────────────────────────────────

struct (0x2ce05111) ChangeOwner {
    newOwner: address
}

// HarmonyCampaign messages

struct (0x10000001) Donate {
    tipBps: uint32   // 0–1500 (0%–15%), chosen by donor
}

struct (0x10000002) Claim {}       // recipient claims raised funds

struct (0x10000003) Refund {}      // donor reclaims their donation (deadline passed + goal not met, or frozen)

struct (0x10000004) Freeze {}      // master freezes the campaign (blocks donate + claim)

struct (0x10000005) Unfreeze {}    // master unfreezes a previously frozen campaign

// HarmonyMaster messages

struct (0x20000001) DeployCampaign {
    recipient:   address
    goalUsdt:    uint64
    goalTon:     uint64
    deadline:    uint32
    deployValue: coins   // TON to forward to the new campaign for gas/storage
    usdtConfig:  Cell<CampaignUsdtConfig>
}

// TEP-74: incoming jetton transfer notification (op=0x7362d09c)
struct (0x7362d09c) TransferNotification {
    queryId: uint64
    amount:  coins
    sender:  address
    forwardPayload: RemainingBitsAndRefs  // TEP-74 forward_payload: Either Cell ^Cell
}

struct (0x20000002) WithdrawStrayFunds {
    to: address          // destination for collected tips
}

struct (0x20000003) AddModerator {
    addr: address        // add to moderators set
}

struct (0x20000004) RemoveModerator {
    addr: address        // remove from moderators set
}

struct (0x10000006) SetUsdtJettonWallet {
    newWallet: address   // real USDT jetton wallet resolved post-deploy
}

struct (0x20000005) SetCampaignUsdtWallet {
    campaignId: uint64   // target campaign
    newWallet: address   // resolved USDT jetton wallet
}

// A campaign returns its unspent deploy gas on claim. Carries campaignId so
// Master can verify the sender against its own registry — otherwise anyone could
// inflate gasPool and drain it through RefillDeployer.
struct (0x20000006) CampaignGasReturn {
    campaignId: uint64
}

// Owner or moderator pulls the returned gas back to the wallet that pays for
// deploys. Destination is always the sender — never a parameter, so a compromised
// moderator key cannot redirect the pool.
struct (0x20000007) RefillDeployer {}

// Replace the HarmonyCampaign code used for future deploys. Owner only.
// Already deployed campaigns keep their own code and are unaffected.
struct (0x20000008) SetCampaignCode {
    newCode: cell
}

// Point returned campaign gas at the wallet that pays for deploys, so it
// refills itself. Owner only — this address receives money on every claim.
struct (0x20000009) SetDeployerWallet {
    newWallet: address
}

// A campaign that never took a donation cannot be claimed (Claim needs
// `anyRaised`) and cannot be refunded (Refund needs a donor), so the deploy value
// sitting on it has no way out. This is the owner's way out: Master forwards the
// order to the campaign, the campaign checks that it is genuinely empty and past
// its deadline, then destroys itself and sends the balance back along the existing
// gas-return path. Owner only, because it destroys a contract.
struct (0x2000000A) CloseEmptyCampaign {
    campaignId: uint64
}

// The order as the campaign receives it. No fields — the campaign knows its
// own id, and taking the id from the message would let a forged one redirect the
// sweep to another campaign's registry entry.
struct (0x10000007) CloseEmpty {}

// `Refund` is a pull — it refunds whoever sent it, and only that donor. A
// platform that has frozen a fraudulent campaign cannot wait for every donor to
// come back and ask, so these three give the owner a push: freeze, then return
// everything to everyone. Owner only in Master, all three of them: freezing stops
// other people's money moving, and refunding moves it back.
struct (0x2000000B) FreezeCampaign {
    campaignId: uint64
}

struct (0x2000000C) UnfreezeCampaign {
    campaignId: uint64
}

struct (0x2000000D) RefundCampaign {
    campaignId: uint64
}

// The refund order as the campaign receives it — from Master to start, then
// from the campaign to itself until the donation dicts are empty. No fields, for the
// same reason as CloseEmpty: everything it needs is already in storage, and a field
// would only be something to forge. The batch size is a constant in the campaign
// code, not a parameter, so no message can ask for a batch that runs out of gas.
struct (0x10000008) RefundBatch {}

// Move the campaign's deadline forward. Until this branch existed the deadline
// was written once at deploy and nothing could touch it, so "resume the campaign with
// a later deadline" in the admin panel changed a row in the database and lied about the
// chain — donations kept being accepted by the interface and rolled back by the contract
// with exit 109. The new deadline is a field rather than a number of days because the
// campaign must end up with exactly the timestamp the platform recorded, not with one
// computed twice on two clocks.
struct (0x10000009) ExtendDeadline {
    newDeadline: uint32
}

// The campaign's last words. Its final message carries the whole balance back to
// Master and destroys the contract — the same shape as CampaignGasReturn, but it has to
// be a different opcode, because the two mean opposite things to anyone reading the
// chain: one says the recipient was paid, the other says the donors were. Without the
// distinction the indexer cannot tell a completed campaign from a refunded one, and
// `refunded` stays a status nothing ever writes. Master treats it exactly like a gas
// return; the sender is the campaign itself, which is what lets the indexer find it.
struct (0x2000000E) CampaignRefunded {
    campaignId: uint64
}

// The owner's half of ExtendDeadline. Owner only, like the other orders that
// move someone else's position: postponing a deadline postpones the moment donors may
// ask for their money back, so it is a signed action and not a moderator's button.
struct (0x2000000F) ExtendCampaignDeadline {
    campaignId: uint64
    newDeadline: uint32
}
