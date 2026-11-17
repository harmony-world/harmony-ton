import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";

const CARD_WIDTH = 540;
const CARD_HEIGHT = 560;

const DONOR_LEVELS = [
  { level: 5, name: "Keeper", color: "#7C3AED", threshold: 1000 },
  { level: 4, name: "Guardian", color: "#F97316", threshold: 500 },
  { level: 3, name: "Patron", color: "#F59E0B", threshold: 200 },
  { level: 2, name: "Helper", color: "#3B82F6", threshold: 50 },
  { level: 1, name: "Sprout", color: "#1F8A5B", threshold: 0 },
];

function getDonorLevel(totalUsd: number) {
  for (const dl of DONOR_LEVELS) {
    if (totalUsd >= dl.threshold) return dl;
  }
  return DONOR_LEVELS[DONOR_LEVELS.length - 1]!;
}

let fontsCache: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | null = null;

function loadFonts() {
  if (fontsCache) return fontsCache;
  const fontsDir = path.resolve(import.meta.dirname, "../assets/fonts");
  const regular = fs.readFileSync(path.join(fontsDir, "Inter-Regular.ttf"));
  const bold = fs.readFileSync(path.join(fontsDir, "Inter-Bold.ttf"));
  fontsCache = [
    { name: "Inter", data: regular.buffer as ArrayBuffer, weight: 400, style: "normal" as const },
    { name: "Inter", data: bold.buffer as ArrayBuffer, weight: 700, style: "normal" as const },
  ];
  return fontsCache;
}

export interface ProfileCardData {
  name: string;
  initials: string;
  avatarUrl: string | null;
  totalDonatedUsd: number;
  donationCount: number;
  campaignCount: number;
  trustScore: number;
}

async function fetchAvatarBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function initialsColor(initials: string): string {
  const colors = ["#1F8A5B", "#3B82F6", "#F59E0B", "#F97316", "#7C3AED", "#EC4899", "#06B6D4"];
  let hash = 0;
  for (let i = 0; i < initials.length; i++) hash = (hash * 31 + initials.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length]!;
}

function formatUsd(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${amount}`;
}

export async function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
  const fonts = loadFonts();
  const donor = getDonorLevel(data.totalDonatedUsd);

  let avatarSrc: string | null = null;
  if (data.avatarUrl) {
    avatarSrc = await fetchAvatarBase64(data.avatarUrl);
  }

  const avatar = avatarSrc
    ? {
        type: "img" as const,
        props: {
          src: avatarSrc,
          width: 96,
          height: 96,
          style: { borderRadius: 48, objectFit: "cover" as const },
        },
      }
    : {
        type: "div" as const,
        props: {
          style: {
            width: 96,
            height: 96,
            borderRadius: 48,
            background: `linear-gradient(135deg, ${initialsColor(data.initials)}, #1E7FC0)`,
            display: "flex",
            alignItems: "center" as const,
            justifyContent: "center" as const,
            fontSize: 38,
            fontWeight: 700,
            color: "#FFFFFF",
          },
          children: data.initials,
        },
      };

  const element = {
    type: "div" as const,
    props: {
      style: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center" as const,
        background: "linear-gradient(180deg, #111318 0%, #1a1d24 100%)",
        padding: "40px 40px 32px",
        fontFamily: "Inter",
        color: "#FFFFFF",
      },
      children: [
        avatar,
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center" as const,
              marginTop: 20,
              gap: 12,
            },
            children: [
              {
                type: "div" as const,
                props: {
                  style: { fontSize: 24, fontWeight: 700, lineHeight: 1.2, textAlign: "center" as const },
                  children: data.name,
                },
              },
              {
                type: "div" as const,
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center" as const,
                    gap: 10,
                  },
                  children: [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 13,
                          fontWeight: 700,
                          color: donor.color,
                          background: `${donor.color}20`,
                          padding: "5px 14px",
                          borderRadius: 14,
                        },
                        children: donor.name,
                      },
                    },
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#8E8E93",
                          background: "#8E8E9320",
                          padding: "5px 14px",
                          borderRadius: 14,
                        },
                        children: `Trust ${data.trustScore}`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              gap: 12,
              width: "100%",
              marginTop: 36,
            },
            children: [
              statBlock(formatUsd(data.totalDonatedUsd), "Donated", "#1E9E52"),
              {
                type: "div" as const,
                props: {
                  style: { display: "flex", gap: 12, width: "100%" },
                  children: [
                    statBlockHalf(String(data.campaignCount), "Campaigns"),
                    statBlockHalf(String(data.donationCount), "Donations"),
                  ],
                },
              },
            ],
          },
        },
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              justifyContent: "center" as const,
              alignItems: "center" as const,
              marginTop: 28,
            },
            children: [
              {
                type: "div" as const,
                props: {
                  style: { fontSize: 15, fontWeight: 700, color: "#8E8E93", letterSpacing: 3 },
                  children: "HARMONY",
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(element, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: CARD_WIDTH },
  });

  return Buffer.from(resvg.render().asPng());
}

function statBlock(value: string, label: string, accentColor?: string) {
  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        width: "100%",
        padding: "22px 20px",
        borderRadius: 20,
        background: "#1E2028",
        gap: 6,
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: {
              fontSize: 32,
              fontWeight: 700,
              color: accentColor ?? "#FFFFFF",
            },
            children: value,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 13, color: "#8E8E93", fontWeight: 400 },
            children: label,
          },
        },
      ],
    },
  };
}

function statBlockHalf(value: string, label: string) {
  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        flex: 1,
        padding: "22px 20px",
        borderRadius: 20,
        background: "#1E2028",
        gap: 6,
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: { fontSize: 28, fontWeight: 700 },
            children: value,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 13, color: "#8E8E93", fontWeight: 400 },
            children: label,
          },
        },
      ],
    },
  };
}
