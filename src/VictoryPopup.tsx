import React from "react";
import type { Piece, Equip, Color, KilledPiece } from "./types";
import { VAL, ITEM_COSTS, GL, ITEM_DESCRIPTIONS } from "./constants";

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

interface VictoryPopupProps {
  win: Color | null;
  showVictoryDetails: boolean;
  phrase: string | null;
  thisLevelUnlockedItems: Exclude<Equip, undefined>[];
  killedEnemyPieces: KilledPiece[];
  handleNextLevel: () => void;
  handleTryAgain: () => void;
  winModalPosition: { top: number; left: number } | null;
}

export function VictoryPopup({
  win,
  showVictoryDetails,
  phrase,
  thisLevelUnlockedItems,
  killedEnemyPieces,
  handleNextLevel,
  handleTryAgain,
  winModalPosition,
}: VictoryPopupProps) {
  const W = "w" as const;

  if (!win || !winModalPosition) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70">
      <div
        className="bg-zinc-900/90 backdrop-blur rounded-2xl p-4 text-center space-y-3 border border-zinc-700 absolute"
        style={{
          top: winModalPosition.top,
          left: winModalPosition.left,
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* Show initial victory phrase first, then main content (only for wins) */}
        {!showVictoryDetails && win === W && phrase && (
          <>
            <div
              className={`px-4 py-2 rounded-full font-bold text-xl ${"bg-gradient-to-r from-gray-200 to-white text-black"}`}
            >
              {phrase}
            </div>
          </>
        )}

        {(showVictoryDetails || win !== W) && (
          <>
            {win !== W && (
              <h2 className="text-2xl font-bold text-red-500 mb-2">
                RUN ENDED
              </h2>
            )}
            {win === W && (
              <h2 className="text-2xl font-bold text-green-400 mb-2">
                Level Cleared!
              </h2>
            )}

            {/* Show unlocked items if player won and has unlocked items */}
            {win === W && thisLevelUnlockedItems.length > 0 && (
              <div className="mb-4 bg-gradient-to-r from-amber-600 to-amber-800 p-3 rounded-xl">
                <div className="font-bold text-white mb-1">
                  Unlocked New Item
                  {thisLevelUnlockedItems.length > 1 ? "s" : ""}!
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-2xl">
                  {thisLevelUnlockedItems.map((item) => (
                    <span
                      key={item}
                      title={
                        ITEM_DESCRIPTIONS[
                          item as keyof typeof ITEM_DESCRIPTIONS
                        ]
                      }
                    >
                      {equipIcon(item)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Show Ransom section if player won and has killed enemies */}
            {win === W &&
              killedEnemyPieces.length > 0 &&
              (() => {
                // Calculate ransom gold (35% of regular pieces and items, excluding Kings)
                const regularValue = killedEnemyPieces.reduce(
                  (sum, killedPiece) => {
                    const piece = killedPiece.piece;

                    // Skip Kings - they get full value, not ransom percentage
                    if (piece.type === "K") return sum;

                    // Regular piece values
                    const pieceValue = VAL[piece.type as keyof typeof VAL] || 0;

                    let itemValue = 0;
                    if (piece.equip) {
                      if (piece.equip === "purse") {
                        // Purse gives 25g directly, not based on its cost (which is 0)
                        itemValue = 25;
                      } else {
                        itemValue =
                          ITEM_COSTS[piece.equip as keyof typeof ITEM_COSTS] ||
                          0;
                      }
                    }
                    return sum + pieceValue + itemValue;
                  },
                  0
                );
                const ransomGold = Math.floor(regularValue * 0.35);

                // Calculate King gold (full value, not ransom percentage)
                const kingGold = killedEnemyPieces.reduce(
                  (sum, killedPiece) => {
                    const piece = killedPiece.piece;
                    if (piece.type === "K" && killedPiece.defeatType) {
                      switch (killedPiece.defeatType) {
                        case "beheaded":
                          return sum + 20;
                        case "dishonored":
                          return sum + 10;
                        case "checkmate":
                          return sum + 40;
                      }
                    }
                    return sum;
                  },
                  0
                );

                const totalGold = ransomGold + kingGold;

                return (
                  <div className="mb-4 bg-gradient-to-r from-yellow-600 to-yellow-800 p-3 rounded-xl">
                    <div className="font-bold text-white mb-2">Ransom</div>
                    <div className="flex flex-wrap justify-center gap-2 mb-2">
                      {killedEnemyPieces.map((killedPiece, index) => (
                        <span
                          key={index}
                          style={{ animationDelay: `${index * 100}ms` }}
                          className="animate-fade-in relative"
                        >
                          <span 
                            className="chip pb"
                            style={{ width: '48px', height: '48px', fontSize: '40px' }}
                          >
                            {(() => {
                              const glyphSet = GL[killedPiece.piece.type as keyof typeof GL];
                              return glyphSet && "b" in glyphSet ? glyphSet["b" as keyof typeof glyphSet] : "?";
                            })()}
                          </span>
                          {killedPiece.piece.equip && (
                            <span className="text-xl absolute bottom-0 right-0">
                              {equipIcon(killedPiece.piece.equip)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="text-sm text-yellow-200 mt-2 space-y-1">
                      {/* Show pieces ransom if any regular pieces were killed */}
                      {ransomGold > 0 && (
                        <div>
                          Pieces Ransom: {ransomGold}g
                        </div>
                      )}
                      
                      {/* Show purses collected separately */}
                      {(() => {
                        const purseCount = killedEnemyPieces.filter(
                          (kp) => kp.piece.equip === "purse"
                        ).length;
                        if (purseCount > 0) {
                          return (
                            <div>
                              Purses Collected: {purseCount} ({purseCount * 25}g)
                            </div>
                          );
                        }
                        return null;
                      })()}
                      
                      {/* Show king status if a king was defeated */}
                      {kingGold > 0 && (
                        <div>
                          {(() => {
                            const defeatedKing = killedEnemyPieces.find(
                              (kp) => kp.piece.type === "K"
                            );
                            if (defeatedKing?.defeatType) {
                              const statusText = 
                                defeatedKing.defeatType === "checkmate" ? "King Captured" :
                                defeatedKing.defeatType === "beheaded" ? "King Beheaded" :
                                "King Dishonored";
                              return `${statusText}: ${kingGold}g`;
                            }
                            return `King: ${kingGold}g`;
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-2xl text-yellow-300 mt-2 pt-2 border-t border-yellow-400">
                      +{totalGold}g
                    </div>
                  </div>
                );
              })()}

            <button
              onClick={win === W ? handleNextLevel : handleTryAgain}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {win === W ? "Next Level" : "Try Again"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
