import "types"

// Multisig KYC oracle for recipient verification. Phase 2+.
// Stores M-of-N threshold; the signer dict and the verify() flow come later.
contract HarmonyVerifier {
    author: "luciymetist"
    version: "0.1.0"
    description: "Harmony multisig recipient verifier (Phase 2+)"
    storage: VerifierStorage
    incomingMessages: VerifierMessage
}

type VerifierMessage = ChangeOwner

fun onInternalMessage(in: InMessage) {
    val msg = lazy VerifierMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy VerifierStorage.load();
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
    return VerifierStorage.load().owner;
}

get fun threshold(): uint8 {
    return VerifierStorage.load().threshold;
}
