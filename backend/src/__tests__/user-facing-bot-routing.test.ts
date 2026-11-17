import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { creatorMessenger } from "../services/expense-report-cron.js";
import { notifyCreator } from "../bot/expense-report-moderation.js";

function makeBots() {
  const product = vi.fn().mockResolvedValue(undefined);
  const moderation = vi.fn().mockResolvedValue(undefined);
  return {
    product,
    moderation,
    app: {
      bot: { api: { sendMessage: product } },
      moderationBot: { api: { sendMessage: moderation } },
    },
  };
}

describe("user-facing bot routing", () => {
  it("expense report cron writes to the author through the product bot", async () => {
    const { product, moderation, app } = makeBots();

    await creatorMessenger(app)(123456789, "Напоминание");

    expect(product).toHaveBeenCalledWith(123456789, "Напоминание");
    expect(moderation).not.toHaveBeenCalled();
  });

  it("expense report verdict reaches the author through the product bot", async () => {
    const { product, moderation, app } = makeBots();
    const fullApp = {
      ...app,
      prisma: {
        campaign: {
          findUnique: vi.fn().mockResolvedValue({
            title: "Помогите птицам определиться",
            creator: { tgUserId: BigInt(100200300), languageCode: "ru" },
          }),
        },
      },
      log: { error: vi.fn() },
    } as unknown as FastifyInstance;

    await notifyCreator(fullApp, "b9e3ce5a-22df-4b26-a579-4836d5897255", "approve", null);

    expect(product).toHaveBeenCalledTimes(1);
    expect(String(product.mock.calls[0]![1])).toContain("Помогите птицам определиться");
    expect(moderation).not.toHaveBeenCalled();
  });
});
