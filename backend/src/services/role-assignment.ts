import { isOwnerUser } from "../constants/owner.js";

export const ASSIGNABLE_ROLES = ["donor", "moderator", "support", "admin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const ADMIN_MANAGEABLE_ROLES: readonly string[] = ["donor", "moderator", "support"];

export type RoleChangeDenial = { status: 400 | 403; error: string };

export type RoleChangeRequest = {
  actor: { id: string; role: string };
  target: { id: string; role: string; tgUserId: bigint };
  nextRole: string;
};

export function denyRoleChange({ actor, target, nextRole }: RoleChangeRequest): RoleChangeDenial | null {
  if (isOwnerUser(target.tgUserId) || target.role === "owner") {
    return { status: 403, error: "Cannot modify owner account" };
  }

  if (actor.id === target.id) {
    return { status: 403, error: "Cannot change your own role" };
  }

  if (!["owner", "admin"].includes(actor.role)) {
    return { status: 403, error: "Only admin can change roles" };
  }

  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(nextRole)) {
    return { status: 400, error: "Invalid role" };
  }

  if (actor.role === "admin") {
    if (!ADMIN_MANAGEABLE_ROLES.includes(target.role) || !ADMIN_MANAGEABLE_ROLES.includes(nextRole)) {
      return { status: 403, error: "Only the owner can grant or revoke the admin role" };
    }
  }

  return null;
}
