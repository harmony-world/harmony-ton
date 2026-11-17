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
    DeployCampaignParams,
    GetStatsResult,
    MasterStorageInit,
    Ops,
    storeCampaignUsdtConfig,
    storeMasterStorage,
} from './types.js';

export function buildChangeOwnerMsg(newOwner: Address): Cell {
    return beginCell()
        .storeUint(Ops.ChangeOwner, 32)
        .storeAddress(newOwner)
        .endCell();
}

export function buildDeployCampaignMsg(p: DeployCampaignParams): Cell {
    return beginCell()
        .storeUint(Ops.DeployCampaign, 32)
        .storeAddress(p.recipient)
        .storeUint(p.goalUsdt, 64)
        .storeUint(p.goalTon, 64)
        .storeUint(p.deadline, 32)
        .storeCoins(p.deployValue)
        .storeRef(storeCampaignUsdtConfig(p.usdtConfig))
        .endCell();
}

export function buildWithdrawStrayFundsMsg(to: Address): Cell {
    return beginCell()
        .storeUint(Ops.WithdrawStrayFunds, 32)
        .storeAddress(to)
        .endCell();
}

export function buildAddModeratorMsg(addr: Address): Cell {
    return beginCell()
        .storeUint(Ops.AddModerator, 32)
        .storeAddress(addr)
        .endCell();
}

export function buildRemoveModeratorMsg(addr: Address): Cell {
    return beginCell()
        .storeUint(Ops.RemoveModerator, 32)
        .storeAddress(addr)
        .endCell();
}

export function buildSetCampaignUsdtWalletMsg(campaignId: bigint, newWallet: Address): Cell {
    return beginCell()
        .storeUint(Ops.SetCampaignUsdtWallet, 32)
        .storeUint(campaignId, 64)
        .storeAddress(newWallet)
        .endCell();
}

export function buildRefillDeployerMsg(): Cell {
    return beginCell()
        .storeUint(Ops.RefillDeployer, 32)
        .endCell();
}

export function buildSetCampaignCodeMsg(newCode: Cell): Cell {
    return beginCell()
        .storeUint(Ops.SetCampaignCode, 32)
        .storeRef(newCode)
        .endCell();
}

export function buildSetDeployerWalletMsg(newWallet: Address): Cell {
    return beginCell()
        .storeUint(Ops.SetDeployerWallet, 32)
        .storeAddress(newWallet)
        .endCell();
}

export function buildCloseEmptyCampaignMsg(campaignId: bigint): Cell {
    return beginCell()
        .storeUint(Ops.CloseEmptyCampaign, 32)
        .storeUint(campaignId, 64)
        .endCell();
}

export function buildFreezeCampaignMsg(campaignId: bigint): Cell {
    return beginCell()
        .storeUint(Ops.FreezeCampaign, 32)
        .storeUint(campaignId, 64)
        .endCell();
}

export function buildUnfreezeCampaignMsg(campaignId: bigint): Cell {
    return beginCell()
        .storeUint(Ops.UnfreezeCampaign, 32)
        .storeUint(campaignId, 64)
        .endCell();
}

export function buildRefundCampaignMsg(campaignId: bigint): Cell {
    return beginCell()
        .storeUint(Ops.RefundCampaign, 32)
        .storeUint(campaignId, 64)
        .endCell();
}

export function buildExtendCampaignDeadlineMsg(campaignId: bigint, newDeadline: number): Cell {
    if (!Number.isInteger(newDeadline) || newDeadline <= 0 || newDeadline > 0xffffffff) {
        throw new Error(
            `buildExtendCampaignDeadlineMsg: newDeadline must be a uint32 unix time, got ${newDeadline}`,
        );
    }
    return beginCell()
        .storeUint(Ops.ExtendCampaignDeadline, 32)
        .storeUint(campaignId, 64)
        .storeUint(newDeadline, 32)
        .endCell();
}

export class HarmonyMaster implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: StateInit | null,
    ) {}

    static createFromInit(storageInit: MasterStorageInit, masterCode: Cell, workchain = 0): HarmonyMaster {
        if (!storageInit.campaignCode) {
            throw new Error('campaignCode is required for deploy');
        }
        const data = storeMasterStorage(storageInit);
        const init: StateInit = { code: masterCode, data };
        const address = contractAddress(workchain, init);
        return new HarmonyMaster(address, init);
    }

    static createFromAddress(address: Address): HarmonyMaster {
        return new HarmonyMaster(address);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendChangeOwner(
        provider: ContractProvider,
        via: Sender,
        newOwner: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildChangeOwnerMsg(newOwner),
        });
    }

    async sendDeployCampaign(
        provider: ContractProvider,
        via: Sender,
        params: DeployCampaignParams,
        value = toNano('0.15'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildDeployCampaignMsg(params),
        });
    }

    async sendWithdrawStrayFunds(
        provider: ContractProvider,
        via: Sender,
        to: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildWithdrawStrayFundsMsg(to),
        });
    }

    async sendAddModerator(
        provider: ContractProvider,
        via: Sender,
        addr: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildAddModeratorMsg(addr),
        });
    }

    async sendRemoveModerator(
        provider: ContractProvider,
        via: Sender,
        addr: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildRemoveModeratorMsg(addr),
        });
    }

    async sendSetCampaignUsdtWallet(
        provider: ContractProvider,
        via: Sender,
        campaignId: bigint,
        newWallet: Address,
        value = toNano('0.1'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildSetCampaignUsdtWalletMsg(campaignId, newWallet),
        });
    }

    async sendRefillDeployer(
        provider: ContractProvider,
        via: Sender,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildRefillDeployerMsg(),
        });
    }

    async sendSetCampaignCode(
        provider: ContractProvider,
        via: Sender,
        newCode: Cell,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildSetCampaignCodeMsg(newCode),
        });
    }

    async sendSetDeployerWallet(
        provider: ContractProvider,
        via: Sender,
        newWallet: Address,
        value = toNano('0.05'),
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildSetDeployerWalletMsg(newWallet),
        });
    }

    async getOwner(provider: ContractProvider): Promise<Address> {
        const { stack } = await provider.get('owner', []);
        return stack.readAddress();
    }

    async getTipBps(provider: ContractProvider): Promise<number> {
        const { stack } = await provider.get('tipBps', []);
        return Number(stack.readBigNumber());
    }

    async getCampaignCount(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('campaignCount', []);
        return stack.readBigNumber();
    }

    async getCampaign(provider: ContractProvider, id: bigint): Promise<Address> {
        const { stack } = await provider.get('get_campaign', [
            { type: 'int', value: id },
        ]);
        return stack.readAddress();
    }

    async getStats(provider: ContractProvider): Promise<GetStatsResult> {
        const { stack } = await provider.get('get_stats', []);
        return {
            campaignCount:  stack.readBigNumber(),
            platformWallet: stack.readAddress(),
            tipBps:         Number(stack.readBigNumber()),
        };
    }

    async isModerator(provider: ContractProvider, addr: Address): Promise<boolean> {
        const { stack } = await provider.get('is_moderator', [
            { type: 'slice', cell: beginCell().storeAddress(addr).endCell() },
        ]);
        return stack.readBoolean();
    }

    async getUsdtMasterAddress(provider: ContractProvider): Promise<Address> {
        const { stack } = await provider.get('usdtMasterAddress', []);
        return stack.readAddress();
    }

    async getStrayFunds(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('strayFunds', []);
        return stack.readBigNumber();
    }

    async getGasPool(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('gasPool', []);
        return stack.readBigNumber();
    }

    async getDeployerWallet(provider: ContractProvider): Promise<Address | null> {
        const { stack } = await provider.get('deployerWallet', []);
        return stack.readAddressOpt();
    }

    async getCampaignCodeHash(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('campaignCodeHash', []);
        return stack.readBigNumber();
    }
}
