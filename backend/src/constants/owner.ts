const OWNER_TG_ID = process.env.OWNER_TG_ID ? BigInt(process.env.OWNER_TG_ID) : null;

export function isOwnerUser(tgUserId: bigint): boolean {
  return OWNER_TG_ID !== null && tgUserId === OWNER_TG_ID;
}

export function ownerUserWhere() {
  return OWNER_TG_ID !== null ? { OR: [{ role: "owner" }, { tgUserId: OWNER_TG_ID }] } : { role: "owner" };
}
