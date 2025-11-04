import React from "react";
import type { Piece, Equip, CampaignState, MarketAction } from "./types";
import {
  ITEM_COSTS,
  PIECE_COSTS,
  GL,
  PIECE_DESCRIPTIONS,
  ITEM_DESCRIPTIONS,
} from "./constants";
import type { LevelConfig } from "./levelConfig";

const equipIcon = (e: Equip) =>
  e === "sword"
    ? "🗡️"
    : e === "shield"
    ? "🛡️"
    : e === "lance"
    ? "🐎"
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
  levelConfig: LevelConfig | null;
  campaign: CampaignState;
  marketPoints: number;
  setMarketPoints: (points: number | ((prev: number) => number)) => void;
  setMarketAction: (action: MarketAction) => void;
  setPrayerDice: (dice: number) => void;
  setCampaign: (updater: (prev: CampaignState) => CampaignState) => void;
  sfx: any;
  setMarketViewVisible: (visible: boolean) => void;
}

export function Market({
  showTooltip,
  hideTooltip,
  levelConfig,
  campaign,
  marketPoints,
  setMarketPoints,
  setMarketAction,
  setPrayerDice,
  setCampaign,
  sfx,
  setMarketViewVisible,
}: MarketProps) {
  // Get available pieces from level config, default to all except King
  const defaultPieces: Piece["type"][] = ["Q", "R", "B", "N", "P"];
  const availablePieces = levelConfig?.availablePieces || defaultPieces;
  const pieces = availablePieces.filter(p => p !== "K"); // Always exclude King from market

  // Get available items for purchase from level config AND unlocked items
  const levelItems = levelConfig?.availableItems.whitePurchase || [];
  const unlockedItems = (campaign && campaign.unlockedItems) || [];
  const freeItemsList = campaign?.freeItems ? Array.from(campaign.freeItems.keys()) : [];

  // Combine level items, unlocked items, and free items, removing duplicates
  const allAvailableItems = [...new Set([...levelItems, ...unlockedItems, ...freeItemsList])];
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
      className="bg-consistent-dark-brown rounded-2xl p-4 shadow-lg text-white relative"
    >
      <div className="grid grid-cols-2 gap-4">
        {/* Left Column: Buy Units and Buy Blessings */}
        <div className="flex flex-col">
          <div className="mb-4">
            <h3 className="font-semibold mb-2 border-b border-amber-800 pb-1">
              Buy Men-at-Arms
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {pieces.map((name) => {
                const cost = PIECE_COSTS[name];
                const freeCount = campaign.freeUnits.get(name) || 0;
                const hasFree = freeCount > 0;
                const canAfford = marketPoints >= cost || hasFree;
                
                return (
                  <button
                    key={name}
                    data-tip
                    data-buy-pawn={name === "P" ? "true" : undefined}
                    onMouseEnter={() => showTooltip(PIECE_DESCRIPTIONS[name])}
                    onMouseLeave={hideTooltip}
                    disabled={!canAfford}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent button from taking focus and causing a scroll jump
                      sfx.purchase();
                      
                      // Set the market action (gold and free units will be deducted when placed on board)
                      setMarketAction({ type: "piece", name, isFree: hasFree });
                    }}
                    className="disabled:opacity-50 disabled:cursor-not-allowed bg-stone-800 hover:bg-stone-700 p-2 rounded-lg flex flex-col items-center text-white"
                  >
                    <span
                      className="text-4xl"
                      style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
                    >
                      {/* Safe access to GL */}
                      {(() => {
                        const glyphSet = GL[name as keyof typeof GL];
                        return glyphSet && "w" in glyphSet ? glyphSet["w" as keyof typeof glyphSet] : "?";
                      })()}
                    </span>
                    <span>
                      {name}{" "}
                      {hasFree ? (
                        <span className="text-green-400 font-bold">{freeCount}x</span>
                      ) : (
                        <span className="text-amber-400">{cost}g</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-2">
            <h3 className="font-semibold mb-2 border-b border-amber-800 pb-1">
              Buy Blessings
            </h3>
            <button
              data-tip
              onMouseEnter={() => showTooltip(ITEM_DESCRIPTIONS["prayer_die"])}
              onMouseLeave={hideTooltip}
              disabled={marketPoints < (campaign.prayerDiceCost ?? ITEM_COSTS["prayer_die"])}
              onMouseDown={(e) => {
                e.preventDefault();
                sfx.purchase();
                // Prayer die is purchased immediately, so deduct gold here
                const prayerCost = campaign.prayerDiceCost ?? ITEM_COSTS["prayer_die"];
                setMarketPoints(prev => prev - prayerCost);
                setPrayerDice(campaign.prayerDice + 1);
                // Update campaign state
                setCampaign((prev) => ({
                  ...prev,
                  prayerDice: prev.prayerDice + 1,
                }));
              }}
              className="w-full disabled:opacity-50 disabled:cursor-not-allowed bg-stone-800 hover:bg-stone-700 p-2 rounded-lg flex items-center justify-center text-white"
            >
              <span className="text-2xl mr-2">🙏</span>
              <span>
                Prayer Die{" "}
                <span className="text-amber-400">
                  {campaign.prayerDiceCost ?? ITEM_COSTS["prayer_die"]}g
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Right Column: Buy Items */}
        <div>
          <div className="mb-4">
            <h3 className="font-semibold mb-2 border-b border-amber-800 pb-1">
              Buy Equipment
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {items.map(({ name }) => {
                const cost = ITEM_COSTS[name as keyof typeof ITEM_COSTS];
                const freeCount = campaign.freeItems.get(name) || 0;
                const hasFree = freeCount > 0;
                const canAfford = marketPoints >= cost || hasFree;
                
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
                    disabled={!canAfford}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent button from taking focus and causing a scroll jump
                      sfx.purchase();
                      
                      // Set the market action (gold and free items will be deducted when placed on board)
                      setMarketAction({ type: "item", name, isFree: hasFree });
                    }}
                    className="disabled:opacity-50 disabled:cursor-not-allowed bg-stone-800 hover:bg-stone-700 p-2 rounded-lg flex flex-col items-center"
                  >
                    <span className="text-2xl">{equipIcon(name)}</span>
                    <span className="mt-1">
                      {hasFree ? (
                        <span className="text-green-400 font-bold">{freeCount}x</span>
                      ) : (
                        <span className="text-amber-400">{cost}g</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

