import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refreshEmojiStatusForUser } from "../services/emoji-status.js";

type MockUser = {
  id: string;
  tgUserId: bigint;
  tgIsPremium: boolean;
  totalDonatedUsd: number;
  emojiStatusEnabled: boolean;
  emojiStatusEmojiId: string | null;
};

function makeApp(user: MockUser | null) {
  const setUserEmojiStatus = vi.fn().mockResolvedValue(true);
  const update = vi.fn().mockResolvedValue(user);
  const findUnique = vi.fn().mockResolvedValue(user);
  return {
    app: {
      prisma: {
        user: { findUnique, update },
      },
      bot: {
        api: { setUserEmojiStatus },
      },
      log: { info: vi.fn(), error: vi.fn() },
    } as never,
    setUserEmojiStatus,
    update,
    findUnique,
  };
}

const LEVELS = {
  HARMONY_EMOJI_STATUS_LEVEL_1_ID: "5001",
  HARMONY_EMOJI_STATUS_LEVEL_2_ID: "5002",
  HARMONY_EMOJI_STATUS_LEVEL_3_ID: "5003",
  HARMONY_EMOJI_STATUS_LEVEL_4_ID: "5004",
  HARMONY_EMOJI_STATUS_LEVEL_5_ID: "5005",
};

function withLevels() {
  for (const [k, v] of Object.entries(LEVELS)) process.env[k] = v;
}
function clearLevels() {
  for (const k of Object.keys(LEVELS)) delete process.env[k];
}

const USER_ID = "user-1";
const TG_USER_ID = BigInt(12345);

describe("refreshEmojiStatusForUser", () => {
  beforeEach(() => withLevels());
  afterEach(() => clearLevels());

  it("re-applies status when donor level advances", async () => {
    const { app, setUserEmojiStatus, update } = makeApp({
      id: USER_ID,
      tgUserId: TG_USER_ID,
      tgIsPremium: true,
      totalDonatedUsd: 220,
      emojiStatusEnabled: true,
      emojiStatusEmojiId: "5002",
    });
    await refreshEmojiStatusForUser(app, USER_ID);
    expect(setUserEmojiStatus).toHaveBeenCalledWith(Number(TG_USER_ID), {
      emoji_status_custom_emoji_id: "5003",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emojiStatusEmojiId: "5003" }),
      }),
    );
  });

  it("no-op when emojiId already matches current level", async () => {
    const { app, setUserEmojiStatus, update } = makeApp({
      id: USER_ID,
      tgUserId: TG_USER_ID,
      tgIsPremium: true,
      totalDonatedUsd: 220,
      emojiStatusEnabled: true,
      emojiStatusEmojiId: "5003",
    });
    await refreshEmojiStatusForUser(app, USER_ID);
    expect(setUserEmojiStatus).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("no-op when user has not opted in (emojiStatusEnabled=false)", async () => {
    const { app, setUserEmojiStatus } = makeApp({
      id: USER_ID,
      tgUserId: TG_USER_ID,
      tgIsPremium: true,
      totalDonatedUsd: 220,
      emojiStatusEnabled: false,
      emojiStatusEmojiId: null,
    });
    await refreshEmojiStatusForUser(app, USER_ID);
    expect(setUserEmojiStatus).not.toHaveBeenCalled();
  });

  it("no-op when user is no longer premium", async () => {
    const { app, setUserEmojiStatus } = makeApp({
      id: USER_ID,
      tgUserId: TG_USER_ID,
      tgIsPremium: false,
      totalDonatedUsd: 220,
      emojiStatusEnabled: true,
      emojiStatusEmojiId: "5002",
    });
    await refreshEmojiStatusForUser(app, USER_ID);
    expect(setUserEmojiStatus).not.toHaveBeenCalled();
  });

  it("no-op when emoji ids env is incomplete", async () => {
    clearLevels();
    process.env.HARMONY_EMOJI_STATUS_LEVEL_1_ID = "5001";
    const { app, setUserEmojiStatus } = makeApp({
      id: USER_ID,
      tgUserId: TG_USER_ID,
      tgIsPremium: true,
      totalDonatedUsd: 220,
      emojiStatusEnabled: true,
      emojiStatusEmojiId: "5002",
    });
    await refreshEmojiStatusForUser(app, USER_ID);
    expect(setUserEmojiStatus).not.toHaveBeenCalled();
  });

  it("swallows Telegram errors without throwing", async () => {
    const failing = makeApp({
      id: USER_ID,
      tgUserId: TG_USER_ID,
      tgIsPremium: true,
      totalDonatedUsd: 500,
      emojiStatusEnabled: true,
      emojiStatusEmojiId: "5002",
    });
    failing.setUserEmojiStatus.mockRejectedValueOnce(new Error("USER_NOT_PARTICIPANT"));
    await expect(refreshEmojiStatusForUser(failing.app, USER_ID)).resolves.toBeUndefined();
    expect(failing.update).not.toHaveBeenCalled();
  });
});
