import type { FastifyInstance } from "fastify";
import {
  sendDeployFailedAlert,
  sendDeployerLowBalanceAlert,
  sendManualReconcileAlert,
  shouldSendOpsAlert,
} from "../bot/notifications.js";
import { DeployerLowBalanceError, DeployNotSentError, deployCampaignOnchain } from "./deployer.js";
import { recalcUserTrustScore } from "./trust-score.js";

const STUCK_DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DEPLOY_RETRIES = 3;
const AUTO_RETRY_DELAYS_MS = [30_000, 120_000];

export type DeployableCampaign = {
  id: string;
  title: string;
  payoutAddress: string;
  goalAmountUsd: unknown;
  deadline: Date | string;
};

export function startCampaignDeploy(app: FastifyInstance, campaign: DeployableCampaign) {
  const deadline = campaign.deadline instanceof Date ? campaign.deadline : new Date(campaign.deadline);
  const deadlineUnix = Math.floor(deadline.getTime() / 1000);

  deployCampaignOnchain({
    payoutAddress: campaign.payoutAddress,
    goalAmountUsd: Number(campaign.goalAmountUsd),
    deadlineUnix,
  })
    .then(async ({ onchainAddress }) => {
      await app.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          onchainAddress,
          status: "active",
          deployStatus: "deployed",
          deployError: null,
          deployedAt: new Date(),
          onchainDeadline: new Date(deadlineUnix * 1000),
        },
      });
      app.log.info({ campaignId: campaign.id, onchainAddress }, "campaign deployed on-chain");

      const deployed = await app.prisma.campaign.findUnique({
        where: { id: campaign.id },
        select: { creatorId: true },
      });
      if (deployed) {
        await recalcUserTrustScore(app.prisma, deployed.creatorId);
      }
    })
    .catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const current = await app.prisma.campaign.findUnique({
        where: { id: campaign.id },
        select: { deployAttempts: true },
      });
      const attempts = current?.deployAttempts ?? MAX_DEPLOY_RETRIES;
      const retryable = err instanceof DeployNotSentError || err instanceof DeployerLowBalanceError;
      const willRetry = retryable && attempts < MAX_DEPLOY_RETRIES;
      await app.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          deployStatus: willRetry ? "retrying" : "failed",
          deployError: errorMessage,
          lastDeployAttemptAt: new Date(),
        },
      });

      if (err instanceof DeployerLowBalanceError) {
        const opsUserId = process.env.OPS_ALERT_TG_USER_ID;
        if (opsUserId && shouldSendOpsAlert(`deployer-low-balance:${err.address}`)) {
          try {
            await sendDeployerLowBalanceAlert(app.bot.api, BigInt(opsUserId), {
              address: err.address,
              balanceGram: err.balanceGram,
              minBalanceGram: err.minBalanceGram,
              campaignId: campaign.id,
              campaignTitle: campaign.title,
            });
          } catch (alertErr) {
            app.log.error(
              { campaignId: campaign.id, err: alertErr },
              "failed to send deployer low balance alert",
            );
          }
        }
      }

      app.log.error(
        { campaignId: campaign.id, err: errorMessage, attempts, willRetry },
        "on-chain deploy failed",
      );

      if (willRetry) {
        const delayMs = AUTO_RETRY_DELAYS_MS[Math.min(attempts, AUTO_RETRY_DELAYS_MS.length) - 1];
        setTimeout(() => void runScheduledDeployRetry(app, campaign), delayMs).unref();
      } else {
        await notifyOwnerDeployFailed(app, campaign, attempts, errorMessage, !retryable);
      }
    });
}

export async function runScheduledDeployRetry(app: FastifyInstance, campaign: DeployableCampaign) {
  try {
    const claimed = await app.prisma.campaign.updateMany({
      where: { id: campaign.id, deployStatus: "retrying", onchainAddress: null },
      data: {
        deployStatus: "deploying",
        deployError: null,
        deployAttempts: { increment: 1 },
        lastDeployAttemptAt: new Date(),
      },
    });
    if (claimed.count === 0) return;
    app.log.info({ campaignId: campaign.id }, "automatic deploy retry");
    startCampaignDeploy(app, campaign);
  } catch (err) {
    app.log.error({ campaignId: campaign.id, err }, "automatic deploy retry failed to start");
  }
}

async function notifyOwnerDeployFailed(
  app: FastifyInstance,
  campaign: DeployableCampaign,
  attempts: number,
  error: string,
  afterSend: boolean,
) {
  const opsUserId = process.env.OPS_ALERT_TG_USER_ID;
  if (!opsUserId) {
    app.log.warn({ campaignId: campaign.id }, "deploy failed but OPS_ALERT_TG_USER_ID is not set");
    return;
  }
  try {
    await sendDeployFailedAlert(app.bot.api, BigInt(opsUserId), {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      attempts,
      error,
      afterSend,
    });
  } catch (err) {
    app.log.error({ campaignId: campaign.id, err }, "failed to send deploy failed alert");
  }
}

export async function retryStuckDeploys(app: FastifyInstance): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_DEPLOY_TIMEOUT_MS);
  const ambiguousDeploying = await app.prisma.campaign.findMany({
    where: {
      deployStatus: "deploying",
      onchainAddress: null,
      OR: [
        { lastDeployAttemptAt: { lt: cutoff } },
        { lastDeployAttemptAt: null },
      ],
    },
    select: { id: true, title: true, deployAttempts: true },
  });

  for (const campaign of ambiguousDeploying) {
    await app.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        deployStatus: "needs_manual_reconcile",
        deployError: "DEPLOY_RECONCILIATION_REQUIRED: process may have crashed after on-chain send; verify HarmonyMaster registry before retry",
        lastDeployAttemptAt: new Date(),
      },
    });
    app.log.warn(
      { campaignId: campaign.id, title: campaign.title, attempts: campaign.deployAttempts },
      "stuck deploying campaign moved to manual reconciliation",
    );

    const opsUserId = process.env.OPS_ALERT_TG_USER_ID;
    if (opsUserId && shouldSendOpsAlert(`manual-reconcile:${campaign.id}`)) {
      try {
        await sendManualReconcileAlert(app.bot.api, BigInt(opsUserId), {
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          attempts: campaign.deployAttempts,
        });
      } catch (alertErr) {
        app.log.error(
          { campaignId: campaign.id, err: alertErr },
          "failed to send manual reconcile alert",
        );
      }
    }
  }

  const stuck = await app.prisma.campaign.findMany({
    where: {
      onchainAddress: null,
      OR: [
        {
          deployStatus: "failed",
          deployAttempts: { lt: MAX_DEPLOY_RETRIES },
          OR: [
            { lastDeployAttemptAt: { lt: cutoff } },
            { lastDeployAttemptAt: null },
          ],
        },
        { deployStatus: "retrying" },
      ],
    },
    select: {
      id: true,
      title: true,
      payoutAddress: true,
      goalAmountUsd: true,
      deadline: true,
      deployAttempts: true,
    },
  });

  for (const campaign of stuck) {
    await app.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        deployStatus: "deploying",
        deployError: null,
        deployAttempts: { increment: 1 },
        lastDeployAttemptAt: new Date(),
      },
    });
    app.log.info(
      { campaignId: campaign.id, attempt: campaign.deployAttempts + 1 },
      "retrying stuck deploy",
    );
    startCampaignDeploy(app, campaign);
  }

  return stuck.length + ambiguousDeploying.length;
}
