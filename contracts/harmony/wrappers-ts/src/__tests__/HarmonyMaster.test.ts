import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { describe, it, expect } from 'vitest';
import {
    Ops,
    Errors,
    CampaignStatus,
    storeMasterStorage,
    storeCampaignUsdtConfig,
    loadCampaignUsdtConfig,
} from '../types.js';
import {
    buildChangeOwnerMsg,
    buildDeployCampaignMsg,
    buildWithdrawStrayFundsMsg,
    buildAddModeratorMsg,
    buildRemoveModeratorMsg,
    buildSetDeployerWalletMsg,
    buildCloseEmptyCampaignMsg,
    buildFreezeCampaignMsg,
    buildUnfreezeCampaignMsg,
    buildRefundCampaignMsg,
} from '../HarmonyMaster.js';

const ADDR_A = Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111');
const ADDR_B = Address.parse('0:2222222222222222222222222222222222222222222222222222222222222222');
const ADDR_C = Address.parse('0:3333333333333333333333333333333333333333333333333333333333333333');

function readOp(cell: Cell): number {
    return cell.beginParse().loadUint(32);
}

describe('Ops', () => {
    it('ChangeOwner', () => expect(Ops.ChangeOwner).toBe(0x2ce05111));
    it('DeployCampaign', () => expect(Ops.DeployCampaign).toBe(0x20000001));
    it('WithdrawStrayFunds', () => expect(Ops.WithdrawStrayFunds).toBe(0x20000002));
    it('AddModerator', () => expect(Ops.AddModerator).toBe(0x20000003));
    it('RemoveModerator', () => expect(Ops.RemoveModerator).toBe(0x20000004));
});

describe('buildChangeOwnerMsg', () => {
    it('contains correct op code', () => {
        expect(readOp(buildChangeOwnerMsg(ADDR_B))).toBe(Ops.ChangeOwner);
    });

    it('encodes newOwner address', () => {
        const cell = buildChangeOwnerMsg(ADDR_B);
        const s = cell.beginParse();
        s.loadUint(32);
        const addr = s.loadAddress();
        expect(addr.equals(ADDR_B)).toBe(true);
    });
});

describe('buildDeployCampaignMsg', () => {
    const params = {
        recipient:   ADDR_A,
        goalUsdt:    1_000_000_000n,
        goalTon:     toNano('270'),
        deadline:    2_000_000_000,
        deployValue: toNano('0.08'),
        usdtConfig: {
            usdtMasterAddress: ADDR_B,
            usdtJettonWallet:  ADDR_C,
            platformWallet:    ADDR_A,
        },
    };

    it('contains correct op code', () => {
        expect(readOp(buildDeployCampaignMsg(params))).toBe(Ops.DeployCampaign);
    });

    it('encodes all scalar fields in order', () => {
        const cell = buildDeployCampaignMsg(params);
        const s = cell.beginParse();
        s.loadUint(32);
        const recipient = s.loadAddress();
        const goalUsdt  = s.loadUintBig(64);
        const goalTon   = s.loadUintBig(64);
        const deadline  = s.loadUint(32);
        const deployValue = s.loadCoins();
        expect(recipient.equals(ADDR_A)).toBe(true);
        expect(goalUsdt).toBe(1_000_000_000n);
        expect(goalTon).toBe(toNano('270'));
        expect(deadline).toBe(2_000_000_000);
        expect(deployValue).toBe(toNano('0.08'));
    });

    it('stores usdtConfig as ref', () => {
        const cell = buildDeployCampaignMsg(params);
        const s = cell.beginParse();
        s.loadUint(32); s.loadAddress(); s.loadUintBig(64); s.loadUintBig(64); s.loadUint(32); s.loadCoins();
        const configCell = s.loadRef();
        const cfg = loadCampaignUsdtConfig(configCell);
        expect(cfg.usdtMasterAddress.equals(ADDR_B)).toBe(true);
        expect(cfg.usdtJettonWallet.equals(ADDR_C)).toBe(true);
        expect(cfg.platformWallet.equals(ADDR_A)).toBe(true);
    });
});

describe('buildWithdrawStrayFundsMsg', () => {
    it('correct op + address', () => {
        const cell = buildWithdrawStrayFundsMsg(ADDR_A);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.WithdrawStrayFunds);
        expect(s.loadAddress().equals(ADDR_A)).toBe(true);
    });
});

describe('buildAddModeratorMsg', () => {
    it('correct op + address', () => {
        const cell = buildAddModeratorMsg(ADDR_B);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.AddModerator);
        expect(s.loadAddress().equals(ADDR_B)).toBe(true);
    });
});

describe('buildRemoveModeratorMsg', () => {
    it('correct op + address', () => {
        const cell = buildRemoveModeratorMsg(ADDR_C);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.RemoveModerator);
        expect(s.loadAddress().equals(ADDR_C)).toBe(true);
    });
});

describe('buildSetDeployerWalletMsg', () => {
    it('correct op + address', () => {
        const cell = buildSetDeployerWalletMsg(ADDR_B);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.SetDeployerWallet);
        expect(s.loadAddress().equals(ADDR_B)).toBe(true);
    });
});

describe('buildCloseEmptyCampaignMsg', () => {
    it('correct op + campaignId', () => {
        const cell = buildCloseEmptyCampaignMsg(7n);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.CloseEmptyCampaign);
        expect(s.loadUintBig(64)).toBe(7n);
        expect(s.remainingBits).toBe(0);
    });

    it('keeps a 64-bit id intact', () => {
        const maxId = (1n << 64n) - 1n;
        const s = buildCloseEmptyCampaignMsg(maxId).beginParse();
        s.loadUint(32);
        expect(s.loadUintBig(64)).toBe(maxId);
    });
});

describe('freeze / unfreeze / refund orders', () => {
    it('each carries its own op and the 64-bit id', () => {
        const cases: Array<[Cell, number]> = [
            [buildFreezeCampaignMsg(7n),   Ops.FreezeCampaign],
            [buildUnfreezeCampaignMsg(7n), Ops.UnfreezeCampaign],
            [buildRefundCampaignMsg(7n),   Ops.RefundCampaign],
        ];
        for (const [cell, op] of cases) {
            const s = cell.beginParse();
            expect(s.loadUint(32)).toBe(op);
            expect(s.loadUintBig(64)).toBe(7n);
            expect(s.remainingBits).toBe(0);
        }
    });

    it('keeps a 64-bit id intact', () => {
        const maxId = (1n << 64n) - 1n;
        const s = buildRefundCampaignMsg(maxId).beginParse();
        s.loadUint(32);
        expect(s.loadUintBig(64)).toBe(maxId);
    });
});

describe('storeMasterStorage', () => {
    it('round-trips owner, platformWallet, tipBps, campaignCount', () => {
        const dummyCode = beginCell().storeUint(0, 8).endCell();
        const cell = storeMasterStorage({
            owner:              ADDR_A,
            platformWallet:     ADDR_B,
            tipBps:             100,
            campaignCode:       dummyCode,
            usdtMasterAddress:  ADDR_C,
            campaignCount:      7n,
        });
        const s = cell.beginParse();
        expect(s.loadAddress().equals(ADDR_A)).toBe(true);
        expect(s.loadAddress().equals(ADDR_B)).toBe(true);
        expect(s.loadUint(32)).toBe(100);
        expect(s.loadUintBig(64)).toBe(7n);
    });

    it('stores campaignCode as first ref', () => {
        const dummyCode = beginCell().storeUint(0xdeadbeef, 32).endCell();
        const cell = storeMasterStorage({
            owner:             ADDR_A,
            platformWallet:    ADDR_A,
            tipBps:            0,
            campaignCode:      dummyCode,
            usdtMasterAddress: ADDR_A,
        });
        const s = cell.beginParse();
        s.loadAddress(); s.loadAddress(); s.loadUint(32); s.loadUintBig(64);
        const codeRef = s.loadRef();
        expect(codeRef.beginParse().loadUint(32)).toBe(0xdeadbeef);
    });

    it('stores empty campaigns and moderators as HashmapE zero-bit', () => {
        const dummyCode = beginCell().endCell();
        const cell = storeMasterStorage({
            owner:             ADDR_A,
            platformWallet:    ADDR_A,
            tipBps:            0,
            campaignCode:      dummyCode,
            usdtMasterAddress: ADDR_A,
        });
        const s = cell.beginParse();
        s.loadAddress(); s.loadAddress(); s.loadUint(32); s.loadUintBig(64);
        s.loadRef();
        const campaignsBit = s.loadUint(1);
        expect(campaignsBit).toBe(0);
        const moderatorsBit = s.loadUint(1);
        expect(moderatorsBit).toBe(0);
    });

    it('stores strayFunds, gasPool and the extra ref after dicts', () => {
        const dummyCode = beginCell().endCell();
        const cell = storeMasterStorage({
            owner:             ADDR_A,
            platformWallet:    ADDR_A,
            tipBps:            0,
            campaignCode:      dummyCode,
            usdtMasterAddress: ADDR_C,
            strayFunds:     toNano('1.5'),
            gasPool:           toNano('0.25'),
        });
        const s = cell.beginParse();
        s.loadAddress(); s.loadAddress(); s.loadUint(32); s.loadUintBig(64);
        s.loadRef();
        s.loadUint(1);
        s.loadUint(1);
        expect(s.loadCoins()).toBe(toNano('1.5'));
        expect(s.loadCoins()).toBe(toNano('0.25'));

        const extra = s.loadRef().beginParse();
        expect(extra.loadAddress().equals(ADDR_C)).toBe(true);
        expect(extra.loadMaybeAddress()).toBe(null);
    });

    it('stores the deployer wallet in the extra ref when given', () => {
        const cell = storeMasterStorage({
            owner:             ADDR_A,
            platformWallet:    ADDR_A,
            tipBps:            0,
            campaignCode:      beginCell().endCell(),
            usdtMasterAddress: ADDR_C,
            deployerWallet:    ADDR_B,
        });
        const s = cell.beginParse();
        s.loadAddress(); s.loadAddress(); s.loadUint(32); s.loadUintBig(64);
        s.loadRef(); s.loadUint(1); s.loadUint(1); s.loadCoins(); s.loadCoins();
        const extra = s.loadRef().beginParse();
        expect(extra.loadAddress().equals(ADDR_C)).toBe(true);
        expect(extra.loadMaybeAddress()?.equals(ADDR_B)).toBe(true);
    });

    it('defaults gasPool to zero', () => {
        const cell = storeMasterStorage({
            owner:             ADDR_A,
            platformWallet:    ADDR_A,
            tipBps:            0,
            campaignCode:      beginCell().endCell(),
            usdtMasterAddress: ADDR_C,
        });
        const s = cell.beginParse();
        s.loadAddress(); s.loadAddress(); s.loadUint(32); s.loadUintBig(64);
        s.loadRef(); s.loadUint(1); s.loadUint(1);
        expect(s.loadCoins()).toBe(0n);
        expect(s.loadCoins()).toBe(0n);
    });
});

describe('CampaignUsdtConfig', () => {
    it('stores and loads back correctly', () => {
        const cfg = { usdtMasterAddress: ADDR_A, usdtJettonWallet: ADDR_B, platformWallet: ADDR_C };
        const cell = storeCampaignUsdtConfig(cfg);
        const back = loadCampaignUsdtConfig(cell);
        expect(back.usdtMasterAddress.equals(ADDR_A)).toBe(true);
        expect(back.usdtJettonWallet.equals(ADDR_B)).toBe(true);
        expect(back.platformWallet.equals(ADDR_C)).toBe(true);
    });
});

describe('CampaignStatus', () => {
    it('Active = 0', () => expect(CampaignStatus.Active).toBe(0));
    it('Funded = 1', () => expect(CampaignStatus.Funded).toBe(1));
    it('Refunded = 2', () => expect(CampaignStatus.Refunded).toBe(2));
    it('Frozen = 3', () => expect(CampaignStatus.Frozen).toBe(3));
});

describe('Errors', () => {
    it('NotOwner = 100', () => expect(Errors.NotOwner).toBe(100));
    it('InvalidJettonSender = 115', () => expect(Errors.InvalidJettonSender).toBe(115));
});
