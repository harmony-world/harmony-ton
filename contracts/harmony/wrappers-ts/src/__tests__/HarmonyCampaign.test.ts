import { Address, Cell, beginCell, toNano } from '@ton/core';
import { describe, it, expect } from 'vitest';
import { Ops, CampaignStatus, storeCampaignStorage } from '../types.js';
import {
    HarmonyCampaign,
    buildChangeMasterMsg,
    buildDonateMsg,
    buildClaimMsg,
    buildRefundMsg,
    buildFreezeMsg,
    buildUnfreezeMsg,
    buildTransferNotificationMsg,
    buildJettonTransferMsg,
    buildCloseEmptyMsg,
    buildRefundBatchMsg,
} from '../HarmonyCampaign.js';

const ADDR_A = Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111');
const ADDR_B = Address.parse('0:2222222222222222222222222222222222222222222222222222222222222222');
const ADDR_C = Address.parse('0:3333333333333333333333333333333333333333333333333333333333333333');

function readOp(cell: Cell): number {
    return cell.beginParse().loadUint(32);
}

describe('Campaign op codes', () => {
    it('Donate', ()   => expect(Ops.Donate).toBe(0x10000001));
    it('Claim', ()    => expect(Ops.Claim).toBe(0x10000002));
    it('Refund', ()   => expect(Ops.Refund).toBe(0x10000003));
    it('Freeze', ()   => expect(Ops.Freeze).toBe(0x10000004));
    it('Unfreeze', () => expect(Ops.Unfreeze).toBe(0x10000005));
    it('TransferNotification', () => expect(Ops.TransferNotification).toBe(0x7362d09c));
    it('JettonTransfer', ()       => expect(Ops.JettonTransfer).toBe(0x0f8a7ea5));
});

describe('buildDonateMsg', () => {
    it('op + default tipBps (100 = 1%)', () => {
        const cell = buildDonateMsg();
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.Donate);
        expect(s.loadUint(32)).toBe(100);
        expect(s.remainingBits).toBe(0);
    });
});

describe('buildClaimMsg', () => {
    it('correct op', () => expect(readOp(buildClaimMsg())).toBe(Ops.Claim));
});

describe('buildRefundMsg', () => {
    it('correct op', () => expect(readOp(buildRefundMsg())).toBe(Ops.Refund));
});

describe('buildFreezeMsg', () => {
    it('correct op', () => expect(readOp(buildFreezeMsg())).toBe(Ops.Freeze));
});

describe('buildUnfreezeMsg', () => {
    it('correct op', () => expect(readOp(buildUnfreezeMsg())).toBe(Ops.Unfreeze));
});

describe('buildChangeMasterMsg', () => {
    it('correct op + address', () => {
        const cell = buildChangeMasterMsg(ADDR_A);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.ChangeOwner);
        expect(s.loadAddress().equals(ADDR_A)).toBe(true);
    });
});

describe('buildTransferNotificationMsg', () => {
    it('op + queryId + amount + sender', () => {
        const cell = buildTransferNotificationMsg(42n, 1_000_000n, ADDR_B);
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.TransferNotification);
        expect(s.loadUintBig(64)).toBe(42n);
        expect(s.loadCoins()).toBe(1_000_000n);
        expect(s.loadAddress().equals(ADDR_B)).toBe(true);
        expect(s.loadBit()).toBe(false);
    });

    it('encodes optional Donate tipBps as ref forward_payload', () => {
        const cell = buildTransferNotificationMsg(42n, 1_000_000n, ADDR_B, 1304);
        const s = cell.beginParse();
        s.loadUint(32);
        s.loadUintBig(64);
        s.loadCoins();
        s.loadAddress();
        expect(s.loadBit()).toBe(true);
        const payload = s.loadRef().beginParse();
        expect(payload.loadUint(32)).toBe(Ops.Donate);
        expect(payload.loadUint(32)).toBe(1304);
    });
});

describe('buildJettonTransferMsg', () => {
    it('op + queryId + amount + destination + response', () => {
        const cell = buildJettonTransferMsg({
            queryId:             0n,
            amount:              500_000n,
            destination:         ADDR_A,
            responseDestination: ADDR_B,
            forwardTonAmount:    1n,
        });
        const s = cell.beginParse();
        expect(s.loadUint(32)).toBe(Ops.JettonTransfer);
        s.loadUintBig(64);
        expect(s.loadCoins()).toBe(500_000n);
        expect(s.loadAddress().equals(ADDR_A)).toBe(true);
        expect(s.loadAddress().equals(ADDR_B)).toBe(true);
    });
});

describe('storeCampaignStorage', () => {
    const baseStorage = {
        master:     ADDR_A,
        campaignId: 42n,
        recipient:  ADDR_B,
        goalUsdt:   1_000_000_000n,
        goalTon:    toNano('270'),
        deadline:   2_000_000_000,
        tipBps:     100,
        deployFee:  toNano('0.05'),
        raisedTon:  0n,
        raisedUsdt: 0n,
        donorCount: 0,
        status:     CampaignStatus.Active,
        usdtConfig: { usdtMasterAddress: ADDR_B, usdtJettonWallet: ADDR_C, platformWallet: ADDR_A },
    };

    it('encodes master, campaignId and recipient', () => {
        const cell = storeCampaignStorage(baseStorage);
        const s = cell.beginParse();
        expect(s.loadAddress().equals(ADDR_A)).toBe(true);
        expect(s.loadUintBig(64)).toBe(42n);
        expect(s.loadAddress().equals(ADDR_B)).toBe(true);
    });

    it('encodes goals, deadline, tipBps', () => {
        const cell = storeCampaignStorage(baseStorage);
        const s = cell.beginParse();
        s.loadAddress(); s.loadUintBig(64); s.loadAddress();
        expect(s.loadUintBig(64)).toBe(1_000_000_000n);
        expect(s.loadUintBig(64)).toBe(toNano('270'));
        expect(s.loadUint(32)).toBe(2_000_000_000);
        expect(s.loadUint(32)).toBe(100);
    });

    it('encodes raisedTon, raisedUsdt, donorCount, status', () => {
        const storage = { ...baseStorage, raisedTon: 99n, raisedUsdt: 42n, donorCount: 3, status: CampaignStatus.Frozen };
        const cell = storeCampaignStorage(storage);
        const s = cell.beginParse();
        s.loadAddress(); s.loadUintBig(64); s.loadAddress();
        s.loadUintBig(64); s.loadUintBig(64); s.loadUint(32); s.loadUint(32);
        s.loadCoins();
        expect(s.loadUintBig(64)).toBe(99n);
        expect(s.loadUintBig(64)).toBe(42n);
        expect(s.loadUint(32)).toBe(3);
        expect(s.loadUint(8)).toBe(CampaignStatus.Frozen);
    });

    it('stores empty donations as HashmapE zero-bit', () => {
        const cell = storeCampaignStorage(baseStorage);
        const s = cell.beginParse();
        s.loadAddress(); s.loadUintBig(64); s.loadAddress();
        s.loadUintBig(64); s.loadUintBig(64); s.loadUint(32); s.loadUint(32); s.loadCoins();
        s.loadUintBig(64); s.loadUintBig(64); s.loadUint(32); s.loadUint(8);
        expect(s.loadUint(1)).toBe(0);
    });

    it('stores usdtConfig and usdtDonations in extra ref', () => {
        const cell = storeCampaignStorage(baseStorage);
        const s = cell.beginParse();
        s.loadAddress(); s.loadUintBig(64); s.loadAddress();
        s.loadUintBig(64); s.loadUintBig(64); s.loadUint(32); s.loadUint(32); s.loadCoins();
        s.loadUintBig(64); s.loadUintBig(64); s.loadUint(32); s.loadUint(8);
        s.loadUint(1);
        const extraRef = s.loadRef();
        const extra = extraRef.beginParse();
        const configRef = extra.loadRef();
        expect(extra.loadUint(1)).toBe(0);
        const cs = configRef.beginParse();
        expect(cs.loadAddress().equals(ADDR_B)).toBe(true);
        expect(cs.loadAddress().equals(ADDR_C)).toBe(true);
        expect(cs.loadAddress().equals(ADDR_A)).toBe(true);
    });

    it('total inline bits ≤ 1023', () => {
        expect(() => storeCampaignStorage(baseStorage)).not.toThrow();
    });

    it('campaignId changes derived contract address', () => {
        const campaignCode = beginCell().storeUint(0xfeed, 16).endCell();
        const campaign0 = HarmonyCampaign.createFromInit(
            { ...baseStorage, campaignId: 0n },
            campaignCode,
        );
        const campaign1 = HarmonyCampaign.createFromInit(
            { ...baseStorage, campaignId: 1n },
            campaignCode,
        );

        expect(campaign0.address.equals(campaign1.address)).toBe(false);
    });
});

describe('buildCloseEmptyMsg', () => {
    it('carries the op and nothing else', () => {
        const s = buildCloseEmptyMsg().beginParse();
        expect(s.loadUint(32)).toBe(Ops.CloseEmpty);
        expect(s.remainingBits).toBe(0);
        expect(s.remainingRefs).toBe(0);
    });
});

describe('buildRefundBatchMsg', () => {
    it('carries the op and nothing else', () => {
        const s = buildRefundBatchMsg().beginParse();
        expect(s.loadUint(32)).toBe(Ops.RefundBatch);
        expect(s.remainingBits).toBe(0);
        expect(s.remainingRefs).toBe(0);
    });
});
