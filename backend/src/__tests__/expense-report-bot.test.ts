import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildExpenseReportText,
  expenseReportKeyboard,
  getExpensePendingAction,
  clearExpensePendingAction,
  handleExpensePendingText,
} from "../bot/expense-report-moderation.js";

describe("buildExpenseReportText", () => {
  const baseCard = {
    reportId: "report-1",
    campaignId: "campaign-1",
    campaignTitle: "Помощь детям",
    goalAmountUsd: 5000,
    collectedAmountUsd: 3200,
    photos: ["/uploads/photo1.jpg"],
    comment: "Чеки за лекарства",
    revision: 1,
    isChannel: false,
    creator: {
      tgUserId: BigInt(123456),
      firstName: "Иван",
      username: "ivan",
      kycLevel: 2,
    },
  };

  it("formats regular campaign report", () => {
    const text = buildExpenseReportText(baseCard);
    expect(text).toContain("Отчёт о расходовании средств");
    expect(text).toContain("Помощь детям");
    expect(text).toContain("$5,000");
    expect(text).toContain("$3,200");
    expect(text).toContain("Тип: обычная");
    expect(text).toContain("Иван @ivan");
    expect(text).toContain("KYC: 2");
    expect(text).toContain("Чеки за лекарства");
    expect(text).not.toContain("Ревизия");
  });

  it("shows channel type for channel campaign", () => {
    const text = buildExpenseReportText({ ...baseCard, isChannel: true });
    expect(text).toContain("Тип: канальная (бонус-only)");
  });

  it("shows revision number when > 1", () => {
    const text = buildExpenseReportText({ ...baseCard, revision: 3 });
    expect(text).toContain("Ревизия: 3");
  });

  it("truncates long comment to 1000 chars", () => {
    const longComment = "x".repeat(1500);
    const text = buildExpenseReportText({ ...baseCard, comment: longComment });
    expect(text).toContain("x".repeat(1000) + "...");
  });

  it("shows dash for null comment", () => {
    const text = buildExpenseReportText({ ...baseCard, comment: null });
    expect(text).toContain("Комментарий: —");
  });

  it("uses tgUserId when username is null", () => {
    const text = buildExpenseReportText({
      ...baseCard,
      creator: { ...baseCard.creator, username: null },
    });
    expect(text).toContain("tg:123456");
  });
});

describe("expenseReportKeyboard", () => {
  it("creates keyboard with 3 buttons", () => {
    const kb = expenseReportKeyboard("report-1", "campaign-1");
    const data = (kb as unknown as { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }).inline_keyboard;
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveLength(2);
    expect(data[0][0].callback_data).toBe("exp:approve:campaign-1");
    expect(data[0][1].callback_data).toBe("exp:reject:campaign-1");
    expect(data[1][0].callback_data).toBe("exp:revision:campaign-1");
  });
});

describe("pending expense actions", () => {
  beforeEach(() => {
    clearExpensePendingAction(111);
  });

  it("returns null when no pending action", () => {
    expect(getExpensePendingAction(111)).toBeNull();
  });

  it("clears pending action", () => {
    clearExpensePendingAction(111);
    expect(getExpensePendingAction(111)).toBeNull();
  });
});

describe("handleExpensePendingText", () => {
  it("returns false when no pending action", async () => {
    clearExpensePendingAction(999);
    const app = {
      prisma: {},
      log: { error: vi.fn() },
    } as never;
    const reply = vi.fn();
    const result = await handleExpensePendingText(app, 999, "reason text", reply);
    expect(result).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});
