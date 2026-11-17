import { describe, it, expect } from "vitest";

const OWNER_TG = 100200300n;
process.env.OWNER_TG_ID = OWNER_TG.toString();
const { denyRoleChange, ASSIGNABLE_ROLES } = await import("../services/role-assignment.js");
delete process.env.OWNER_TG_ID;

const OTHER_TG = -770001n;

const owner = { id: "owner-1", role: "owner" };
const admin = { id: "admin-1", role: "admin" };
const moderator = { id: "mod-1", role: "moderator" };

function target(role: string, id = "target-1", tgUserId = OTHER_TG) {
  return { id, role, tgUserId };
}

describe("who may change whose role", () => {
  it("lets the owner hand out and take back every assignable role", () => {
    for (const current of ASSIGNABLE_ROLES) {
      for (const next of ASSIGNABLE_ROLES) {
        if (current === next) continue;
        expect(
          denyRoleChange({ actor: owner, target: target(current), nextRole: next }),
          `owner: ${current} -> ${next}`,
        ).toBeNull();
      }
    }
  });

  it("lets an admin manage moderators and support", () => {
    for (const current of ["donor", "moderator", "support"]) {
      for (const next of ["donor", "moderator", "support"]) {
        if (current === next) continue;
        expect(
          denyRoleChange({ actor: admin, target: target(current), nextRole: next }),
          `admin: ${current} -> ${next}`,
        ).toBeNull();
      }
    }
  });

  it("does not let an admin appoint another admin", () => {
    for (const current of ["donor", "moderator", "support"]) {
      const denial = denyRoleChange({ actor: admin, target: target(current), nextRole: "admin" });
      expect(denial?.status, `admin: ${current} -> admin`).toBe(403);
      expect(denial?.error).toMatch(/owner/i);
    }
  });

  it("does not let an admin demote another admin", () => {
    for (const next of ["donor", "moderator", "support"]) {
      const denial = denyRoleChange({ actor: admin, target: target("admin"), nextRole: next });
      expect(denial?.status, `admin: admin -> ${next}`).toBe(403);
    }
  });

  it("does not let anyone change their own role", () => {
    for (const actor of [admin, moderator, { id: "sup-1", role: "support" }]) {
      const denial = denyRoleChange({
        actor,
        target: target(actor.role, actor.id),
        nextRole: "donor",
      });
      expect(denial?.status, `${actor.role} demoting themselves`).toBe(403);
      expect(denial?.error).toMatch(/own role/i);
    }
  });

  it("refuses the owner account as a target, by role and by telegram id", () => {
    expect(denyRoleChange({ actor: owner, target: target("owner"), nextRole: "donor" })?.status).toBe(403);
    expect(
      denyRoleChange({ actor: owner, target: target("donor", "target-1", OWNER_TG), nextRole: "donor" })?.status,
    ).toBe(403);
  });

  it("refuses actors below admin", () => {
    for (const actor of [moderator, { id: "sup-1", role: "support" }, { id: "d-1", role: "donor" }]) {
      expect(
        denyRoleChange({ actor, target: target("donor"), nextRole: "moderator" })?.status,
        `${actor.role} as actor`,
      ).toBe(403);
    }
  });

  it("refuses a role nobody may assign", () => {
    for (const next of ["owner", "superadmin", "", "Admin"]) {
      const denial = denyRoleChange({ actor: owner, target: target("donor"), nextRole: next });
      expect(denial?.status, `owner: donor -> ${next}`).toBe(400);
    }
  });

  it("keeps the assignable set free of owner", () => {
    expect([...ASSIGNABLE_ROLES]).toEqual(["donor", "moderator", "support", "admin"]);
  });
});
