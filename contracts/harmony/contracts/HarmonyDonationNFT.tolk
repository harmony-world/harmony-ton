import "types"

// Soulbound NFT collection. Non-transferable donation receipts (TEP-62 SBT).
// Minted by HarmonyMaster on successful donation.
contract HarmonyDonationNFT {
    author: "luciymetist"
    version: "0.1.0"
    description: "Harmony soulbound donation receipt collection (TEP-62)"
    storage: NftCollectionStorage
    incomingMessages: NftMessage
}

type NftMessage = ChangeOwner

fun onInternalMessage(in: InMessage) {
    val msg = lazy NftMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy NftCollectionStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.owner = msg.newOwner;
            storage.save();
        }
        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun owner(): address {
    return NftCollectionStorage.load().owner;
}

get fun nextItemIndex(): uint64 {
    return NftCollectionStorage.load().nextItemIndex;
}
