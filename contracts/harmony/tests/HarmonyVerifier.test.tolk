import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/HarmonyVerifier.gen"

get fun `test deploy sets initial owner`() {
    val (contract, owner, _) = setupVerifier();
    expect(contract.owner()).toEqual(owner.address);
}

get fun `test deploy sets threshold`() {
    val (contract, _, _) = setupVerifier();
    expect(contract.threshold()).toEqual(2);
}

get fun `test owner can transfer ownership`() {
    val (contract, owner, other) = setupVerifier();

    val res = contract.sendChangeOwner(owner.address, other.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulTx<ChangeOwner>({
        from: owner.address,
        to: contract.address,
    });
    expect(contract.owner()).toEqual(other.address);
}

get fun `test non-owner cannot transfer ownership`() {
    val (contract, owner, other) = setupVerifier();

    val res = contract.sendChangeOwner(other.address, other.address, { value: ton("0.05") });
    expect(res).toHaveFailedTx({
        from: other.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
    expect(contract.owner()).toEqual(owner.address);
}

fun setupVerifier(): (HarmonyVerifier, Treasury, Treasury) {
    val owner = testing.treasury("owner");
    val other = testing.treasury("other");

    val contract = HarmonyVerifier.fromStorage({
        owner: owner.address,
        threshold: 2,
        signerCount: 3,
    });
    val res = contract.deploy(owner.address, { value: ton("0.05") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, owner, other);
}
