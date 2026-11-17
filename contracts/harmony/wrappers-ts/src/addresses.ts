import { Address } from '@ton/core';

export const TESTNET = {
    harmonyMaster: Address.parse('kQB-cLw76fnWo9RjXKe7rw7xiXNGC81wagsUcqLpIdCk7RuE'),
    previousHarmonyMasters: [
        Address.parse('kQDUq58wX9QPHm56W0YadLT2RopToJhPCVSFMuWtnxvb4J1L'),
        Address.parse('kQC3-vvDY6WZPzMdbAzTugIFto6MICmVolo_sRCmQ94hc3Dh'),
    ],

    campaigns: [
        Address.parse('kQAI3AWKRAf2s_HHNeVIvAMefEpDvahelBBlsnspysEgFSKF'),
        Address.parse('kQC6MSMipTQT4l5oeE1XV84BT9llhd59eA_UQoU2iqD03M0D'),
        Address.parse('kQCbRp83295xCr2OXu3YoSKLfFLnUiJqR6l_CUA2TkvM5MDm'),
    ],

    usdtMaster: null as Address | null,
} as const;

export const RPC = {
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
} as const;
