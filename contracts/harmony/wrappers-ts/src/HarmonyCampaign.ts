import {
    Address,
    Cell,
    Contract,
    ContractProvider,
    Sender,
    SendMode,
    StateInit,
    beginCell,
    contractAddress,
    toNano,
} from '@ton/core';
import {
    CampaignStorageInit,
    GetStatusResult,
    Ops,
    storeCampaignStorage,
} from './types.js';

export function buildChangeMasterMsg(newMaster: Address): Cell {
    return beginCell()
        .storeUint(Ops.ChangeOwner, 32)
        .storeAddress(newMaster)
        .endCell();
}

export function buildDonateMsg(tipBps: number = 100): Cell {
    return beginCell()
        .storeUint(Ops.Donate, 32)
        .storeUint(tipBps, 32)
        .endCell();
}

export function buildDonateForwardPayload(tipBps: number = 100): Cell {
    return buildDonateMsg(tipBps);
}

export function buildClaimMsg(): Cell {
    return beginCell()
        .storeUint(Ops.Claim, 32)
        .endCell();
}

export function buildRefundMsg(): Cell {
    return beginCell()
        .storeUint(Ops.Refund, 32)
        .endCell();
}

export function buildFreezeMsg(): Cell {
    return beginCell()
        .storeUint(Ops.Freeze, 32)
        .endCell();
}

export function buildUnfreezeMsg(): Cell {
    return beginCell()
        .storeUint(Ops.Unfreeze, 32)
        .endCell();
}

export function buildTransferNotificationMsg(
    queryId: bigint,
    amount:  bigint,
    sender:  Address,
    tipBps?: number,
): Cell {
    const builder = beginCell()
        .storeUint(Ops.TransferNotification, 32)
        .storeUint(queryId, 64)
        .storeCoins(amount)
        .storeAddress(sender);

    if (tipBps === undefined) {
        builder.storeBit(false);
    } else {
        builder.storeBit(true).storeRef(buildDonateForwardPayload(tipBps));
    }

    return builder.endCell();
}

export function buildSetUsdtJettonWalletMsg(newWallet: Address): Cell {
    return beginCell()
        .storeUint(Ops.SetUsdtJettonWallet, 32)
        .storeAddress(newWallet)
        .endCell();
}

export function buildCloseEmptyMsg(): Cell {
    return beginCell()
        .storeUint(Ops.CloseEmpty, 32)
        .endCell();
}

export function buildRefundBatchMsg(): Cell {
    return beginCell()
        .storeUint(Ops.RefundBatch, 32)
        .endCell();
}

export function buildJettonTransferMsg(opts: {
    queryId:     bigint;
    amount:      bigint;
    destination: Address;
    responseDestination: Address;
    forwardTonAmount?: bigint;
}): Cell {
    return beginCell()
        .storeUint(Ops.JettonTransfer, 32)
        .storeUint(opts.queryId, 64)
        .storeCoins(opts.amount)
        .storeAddress(opts.destination)
        .storeAddress(opts.responseDestination)
        .storeUint(0, 1)
        .storeCoins(opts.forwardTonAmount ?? 1n)
        .storeUint(0, 1)
        .endCell();
}

export class HarmonyCampaign implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: StateInit | null,
    ) {}

    static createFromInit(
        storageInit: CampaignStorageInit,
        campaignCode: Cell,
        workchain = 0,
    ): HarmonyCampaign {
        const data = storeCampaignStorage(storageInit);
        const init: StateInit = { code: campaignCode, data };
        const address = contractAddress(workchain, init);
        return new HarmonyCampaign(address, init);
    }

    static createFromAddress(address: Address): HarmonyCampaign {
        return new HarmonyCampaign(address);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendChangeMaster(
        provider: ContractProvider,
        via: Sender,
        newMaster: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildChangeMasterMsg(newMaster),
        });
    }

    async sendDonate(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        tipBps: number = 100,
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildDonateMsg(tipBps),
        });
    }

    async sendClaim(
        provider: ContractProvider,
        via: Sender,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildClaimMsg(),
        });
    }

    async sendRefund(
        provider: ContractProvider,
        via: Sender,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildRefundMsg(),
        });
    }

    async sendFreeze(
        provider: ContractProvider,
        via: Sender,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildFreezeMsg(),
        });
    }

    async sendUnfreeze(
        provider: ContractProvider,
        via: Sender,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildUnfreezeMsg(),
        });
    }

    async sendTransferNotification(
        provider: ContractProvider,
        via: Sender,
        queryId: bigint,
        amount:  bigint,
        sender:  Address,
        tipBps?: number,
        value = toNano('0.1'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildTransferNotificationMsg(queryId, amount, sender, tipBps),
        });
    }

    async sendSetUsdtJettonWallet(
        provider: ContractProvider,
        via: Sender,
        newWallet: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildSetUsdtJettonWalletMsg(newWallet),
        });
    }

    async getMaster(provider: ContractProvider): Promise<Address> {
        const { stack } = await provider.get('master', []);
        return stack.readAddress();
    }

    async getCampaignId(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('campaignId', []);
        return stack.readBigNumber();
    }

    async getRecipient(provider: ContractProvider): Promise<Address> {
        const { stack } = await provider.get('recipient', []);
        return stack.readAddress();
    }

    async getRaisedTon(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('raisedTon', []);
        return stack.readBigNumber();
    }

    async getRaisedUsdt(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('raisedUsdt', []);
        return stack.readBigNumber();
    }

    async getStatus(provider: ContractProvider): Promise<number> {
        const { stack } = await provider.get('status', []);
        return Number(stack.readBigNumber());
    }

    async getFullStatus(provider: ContractProvider): Promise<GetStatusResult> {
        const { stack } = await provider.get('get_status', []);
        return {
            goalUsdt:   stack.readBigNumber(),
            goalTon:    stack.readBigNumber(),
            raisedTon:  stack.readBigNumber(),
            raisedUsdt: stack.readBigNumber(),
            deadline:   Number(stack.readBigNumber()),
            status:     Number(stack.readBigNumber()),
            donorCount: Number(stack.readBigNumber()),
            deployFee:  stack.readBigNumber(),
        };
    }
}
