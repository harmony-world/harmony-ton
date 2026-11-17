import { Address, Builder, Cell, Dictionary, Slice, beginCell } from '@ton/core';

export const CampaignStatus = {
    Active:   0,
    Funded:   1,
    Refunded: 2,
    Frozen:   3,
} as const;
export type CampaignStatusValue = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const Ops = {
    ChangeOwner:          0x2ce05111,
    Donate:               0x10000001,
    Claim:                0x10000002,
    Refund:               0x10000003,
    Freeze:               0x10000004,
    Unfreeze:             0x10000005,
    SetUsdtJettonWallet:  0x10000006,
    CloseEmpty:           0x10000007,
    RefundBatch:          0x10000008,
    ExtendDeadline:       0x10000009,
    DeployCampaign:       0x20000001,
    WithdrawStrayFunds:   0x20000002,
    AddModerator:         0x20000003,
    RemoveModerator:      0x20000004,
    SetCampaignUsdtWallet: 0x20000005,
    CampaignGasReturn:     0x20000006,
    RefillDeployer:        0x20000007,
    SetCampaignCode:       0x20000008,
    SetDeployerWallet:     0x20000009,
    CloseEmptyCampaign:    0x2000000A,
    FreezeCampaign:        0x2000000B,
    UnfreezeCampaign:      0x2000000C,
    RefundCampaign:        0x2000000D,
    CampaignRefunded:      0x2000000E,
    ExtendCampaignDeadline: 0x2000000F,
    TransferNotification: 0x7362d09c,
    JettonTransfer:       0x0f8a7ea5,
} as const;

export const Errors = {
    NotOwner:            100,
    InvalidMessage:      0xFFFF,
    NotMaster:           101,
    CampaignClosed:      102,
    GoalNotReached:      103,
    AlreadyVerified:     104,
    Unauthorized:        105,
    CampaignNotActive:   106,
    NotRecipient:        107,
    NothingToRefund:     108,
    DeadlinePassed:      109,
    DeadlineNotPassed:   110,
    AlreadyClaimed:      111,
    CampaignNotFound:    112,
    InvalidDeadline:     113,
    InsufficientValue:   114,
    InvalidJettonSender: 115,
    InvalidTipBps:       116,
    InvalidGoal:         117,
    UsdtWalletAlreadySet: 118,
    GasPoolEmpty:         119,
    NotRegisteredCampaign: 120,
    InvalidDeployerWallet: 121,
    CampaignNotEmpty:     122,
    NotFrozen:            123,
} as const;

export const AddressValue = {
    serialize: (src: Address, bld: Builder) => { bld.storeAddress(src); },
    parse:     (src: Slice) => src.loadAddress(),
};

export const CoinsValue = {
    serialize: (src: bigint, bld: Builder) => { bld.storeCoins(src); },
    parse:     (src: Slice) => src.loadCoins(),
};

export const FlagValue = {
    serialize: (src: number, bld: Builder) => { bld.storeUint(src, 1); },
    parse:     (src: Slice) => src.loadUint(1),
};

export interface CampaignUsdtConfig {
    usdtMasterAddress: Address;
    usdtJettonWallet:  Address;
    platformWallet:    Address;
}

export function storeCampaignUsdtConfig(cfg: CampaignUsdtConfig): Cell {
    return beginCell()
        .storeAddress(cfg.usdtMasterAddress)
        .storeAddress(cfg.usdtJettonWallet)
        .storeAddress(cfg.platformWallet)
        .endCell();
}

export function loadCampaignUsdtConfig(cell: Cell): CampaignUsdtConfig {
    const s = cell.beginParse();
    return {
        usdtMasterAddress: s.loadAddress(),
        usdtJettonWallet:  s.loadAddress(),
        platformWallet:    s.loadAddress(),
    };
}

export interface CampaignExtra {
    usdtConfig:    CampaignUsdtConfig;
    usdtDonations?: Dictionary<bigint, bigint> | null;
}

export function storeCampaignExtra(extra: CampaignExtra): Cell {
    return beginCell()
        .storeRef(storeCampaignUsdtConfig(extra.usdtConfig))
        .storeDict(extra.usdtDonations ?? null)
        .endCell();
}

export interface MasterExtra {
    usdtMasterAddress: Address;
    deployerWallet?:   Address | null;
}

export function storeMasterExtra(extra: MasterExtra): Cell {
    return beginCell()
        .storeAddress(extra.usdtMasterAddress)
        .storeAddress(extra.deployerWallet ?? null)
        .endCell();
}

export interface MasterStorageInit {
    owner:               Address;
    platformWallet:      Address;
    tipBps:              number;
    campaignCode:        Cell;
    usdtMasterAddress:   Address;
    campaignCount?:      bigint;
    campaigns?:          Dictionary<bigint, Address> | null;
    moderators?:         Dictionary<bigint, number>  | null;
    strayFunds?:         bigint;
    gasPool?:            bigint;
    deployerWallet?:     Address | null;
}

export function storeMasterStorage(s: MasterStorageInit): Cell {
    return beginCell()
        .storeAddress(s.owner)
        .storeAddress(s.platformWallet)
        .storeUint(s.tipBps, 32)
        .storeUint(s.campaignCount ?? 0n, 64)
        .storeRef(s.campaignCode)
        .storeDict(s.campaigns  ?? null)
        .storeDict(s.moderators ?? null)
        .storeCoins(s.strayFunds ?? 0n)
        .storeCoins(s.gasPool ?? 0n)
        .storeRef(storeMasterExtra({
            usdtMasterAddress: s.usdtMasterAddress,
            deployerWallet:    s.deployerWallet ?? null,
        }))
        .endCell();
}

export interface CampaignStorageInit {
    master:      Address;
    campaignId:  bigint;
    recipient:   Address;
    goalUsdt:    bigint;
    goalTon:     bigint;
    deadline:    number;
    tipBps:      number;
    deployFee:   bigint;
    raisedTon:   bigint;
    raisedUsdt:  bigint;
    donorCount:  number;
    status:      number;
    usdtConfig:  CampaignUsdtConfig;
    donations?:  Dictionary<bigint, bigint> | null;
    usdtDonations?: Dictionary<bigint, bigint> | null;
}

export function storeCampaignStorage(s: CampaignStorageInit): Cell {
    return beginCell()
        .storeAddress(s.master)
        .storeUint(s.campaignId, 64)
        .storeAddress(s.recipient)
        .storeUint(s.goalUsdt, 64)
        .storeUint(s.goalTon, 64)
        .storeUint(s.deadline, 32)
        .storeUint(s.tipBps, 32)
        .storeCoins(s.deployFee)
        .storeUint(s.raisedTon, 64)
        .storeUint(s.raisedUsdt, 64)
        .storeUint(s.donorCount, 32)
        .storeUint(s.status, 8)
        .storeDict(s.donations ?? null)
        .storeRef(storeCampaignExtra({
            usdtConfig: s.usdtConfig,
            usdtDonations: s.usdtDonations ?? null,
        }))
        .endCell();
}

export interface GetStatsResult {
    campaignCount:  bigint;
    platformWallet: Address;
    tipBps:         number;
}

export interface GetStatusResult {
    goalUsdt:   bigint;
    goalTon:    bigint;
    raisedTon:  bigint;
    raisedUsdt: bigint;
    deadline:   number;
    status:     number;
    donorCount: number;
    deployFee:  bigint;
}

export interface DeployCampaignParams {
    recipient:    Address;
    goalUsdt:     bigint;
    goalTon:      bigint;
    deadline:     number;
    deployValue:  bigint;
    usdtConfig:   CampaignUsdtConfig;
}
