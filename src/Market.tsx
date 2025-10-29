import React from "react";
import type { Piece, Equip, CampaignState } from "./types";
import {
  ITEM_COSTS,
  PIECE_COSTS,
  GL,
  PIECE_DESCRIPTIONS,
  ITEM_DESCRIPTIONS,
} from "./constants";
import { getLevelConfig } from "./levelConfig";

const equipIcon = (e: Equip) =>
  e === "sword"
    ? "🗡️"
    : e === "shield"
    ? "🛡️"
    : e === "lance"
    ? "⚔️"
    : e === "torch"
    ? "🔥"
    : e === "bow"
    ? "🏹"
    : e === "staff"
    ? "🪄"
    : e === "crystal_ball"
    ? "🔮"
    : e === "disguise"
    ? "🎭"
    : e === "scythe"
    ? "🪓"
    : e === "banner"
    ? "⚜️"
    : e === "curse"
    ? "🎃"
    : e === "skull"
    ? "💀"
    : e === "purse"
    ? "💰"
    : "";

interface MarketProps {
  showTooltip: (text: string) => void;
  hideTooltip: () => void;
  currentLevel: number;
  campaign: CampaignState;
  marketPoints: number;
  setMarketPoints: (points: number) => void;
  setMarketAction: (action: { type: "piece"; name: Piece["type"] } | { type: "item"; name: Exclude<Equip, undefined> } | { type: "prayer" } | null) => void;
  setPrayerDice: (dice: number) => void;
  setCampaign: (updater: (prev: CampaignState) => CampaignState) => void;
  sfx: any;
}

export function Market({
  showTooltip,
  hideTooltip,
  currentLevel,
  campaign,
  marketPoints,
  setMarketPoints,
  setMarketAction,
  setPrayerDice,
  setCampaign,
  sfx,
}: MarketProps) {
  const pieces: Piece["type"][] = ["Q", "R", "B", "N", "P"];

  // Get available items for purchase from level config AND unlocked items
  const levelConfig = getLevelConfig(currentLevel);
  const levelItems = levelConfig.availableItems.whitePurchase;
  const unlockedItems = (campaign && campaign.unlockedItems) || [];

  // Combine level items and unlocked items, removing duplicates
  const allAvailableItems = [...new Set([...levelItems, ...unlockedItems])];
  const filteredItems = allAvailableItems.filter((item) => item !== "purse");
  const items: { name: Exclude<Equip, undefined> }[] = filteredItems.map(
    (itemName) => ({ name: itemName })
  );

  return (
    <div
      data-market-root
      onMouseLeave={hideTooltip}
      onMouseMove={(e) => {
        const el = e.target as HTMLElement;
        const overTipBtn = el.closest("[data-tip]");
        if (!overTipBtn) hideTooltip();
      }}
      className="bg-zinc-800 rounded-2xl p-4 shadow-lg text-white relative"
    >
      <h2 className="text-2xl font-bold mb-4 text-center">
        Men-at-Arms Market
      </h2>
      <div className="flex justify-between items-center mb-4 bg-zinc-700 p-3 rounded-lg">
        <span className="font-bold text-lg">Gold to Spend:</span>
        <span className="font-bold text-2xl text-amber-400">
          {marketPoints}g
        </span>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold mb-2 border-b border-zinc-600 pb-1">
          Buy Pieces
        </h3>
          <div className="grid grid-cols-3 gap-2">
            {pieces.map((name) => {
              const cost = PIECE_COSTS[name];
              return (
                <button
                  key={name}
                  data-tip
                  onMouseEnter={() => showTooltip(PIECE_DESCRIPTIONS[name])}
                  onMouseLeave={hideTooltip}
                  disabled={marketPoints < cost}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent button from taking focus and causing a scroll jump
                    sfx.purchase();
                    setMarketAction({ type: "piece", name });
                  }}
                  className="disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-700 hover:bg-zinc-600 p-2 rounded-lg flex flex-col items-center text-white"
                >
                  <span
                    className="text-4xl"
                    style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
                  >
                    {/* Safe access to GL */}
                    {GL[name as keyof typeof GL]?.["w"] ?? "?"}
                  </span>
                  <span>
                    {name} <span className="text-amber-400">{cost}g</span>
                  </span>
                </button>
              );
            })}
          </div>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold mb-2 border-b border-zinc-600 pb-1">
          Buy Items
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {items.map(({ name }) => {
            const cost = ITEM_COSTS[name as keyof typeof ITEM_COSTS];
            return (
              <button
                key={name}
                data-tip
                onMouseEnter={() =>
                  showTooltip(
                    ITEM_DESCRIPTIONS[name as keyof typeof ITEM_DESCRIPTIONS]
                  )
                }
                onMouseLeave={hideTooltip}
                disabled={marketPoints < cost}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent button from taking focus and causing a scroll jump
                  sfx.purchase();
                  setMarketAction({ type: "item", name });
                }}
                className="disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-700 hover:bg-zinc-600 p-2 rounded-lg flex flex-col items-center"
              >
                <span className="text-2xl">{equipIcon(name)}</span>
                <span className="text-xs mt-1">
                  <span className="text-amber-400">{cost}g</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-2">
        <h3 className="font-semibold mb-2 border-b border-zinc-600 pb-1">
          Buy Blessings
        </h3>
        <button
          data-tip
          onMouseEnter={() => showTooltip(ITEM_DESCRIPTIONS["prayer_die"])}
          onMouseLeave={hideTooltip}
          disabled={marketPoints < ITEM_COSTS["prayer_die"]}
          onMouseDown={(e) => {
            e.preventDefault();
            sfx.purchase();
            setMarketPoints(marketPoints - ITEM_COSTS["prayer_die"]);
            setPrayerDice(campaign.prayerDice + 1);
            // Update campaign state
            setCampaign((prev) => ({
              ...prev,
              prayerDice: prev.prayerDice + 1,
            }));
          }}
          className="w-full disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-700 hover:bg-zinc-600 p-2 rounded-lg flex items-center justify-center text-white"
        >
          <span className="text-2xl mr-2">🙏</span>
          <span>
            Prayer Die{" "}
            <span className="text-amber-400">
              {ITEM_COSTS["prayer_die"]}g
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

