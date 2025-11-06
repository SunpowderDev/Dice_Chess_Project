import React from "react";
import type { Equip, Color, KilledPiece } from "./types";
import type { LevelConfig } from "./levelConfig";
import { VAL, ITEM_COSTS, GL, ITEM_DESCRIPTIONS } from "./constants";

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

interface VictoryPopupProps {
  win: Color | null;
  showVictoryDetails: boolean;
  phrase: string | null;
  thisLevelUnlockedItems: Exclude<Equip, undefined>[];
  killedEnemyPieces: KilledPiece[];
  destroyedCourtiers: number;
  handleNextLevel: () => void;
  handleTryAgain: () => void;
  winModalPosition: { top: number; left: number } | null;
  currentLevelConfig: LevelConfig | null;
}

export function VictoryPopup({
  win,
  showVictoryDetails,
  phrase,
  thisLevelUnlockedItems,
  killedEnemyPieces,
  destroyedCourtiers,
  handleNextLevel,
  handleTryAgain,
  winModalPosition,
  currentLevelConfig,
}: VictoryPopupProps) {
  const W = "w" as const;

  if (!win || !winModalPosition) return null;

  // Format victory condition names (same as quest component)
  const formatVictoryCondition = (condition: string) => {
    switch (condition) {
      case "king_beheaded":
        return "Regicide";
      case "king_captured":
        return "King Captured (Checkmate)";
      case "king_dishonored":
        return "King Dishonored";
      case "king_escaped":
        return "King Crossing";
      default:
        return condition;
    }
  };

  // Get victory condition description (same as quest component)
  const getVictoryConditionDescription = (condition: string) => {
    // Check for level-specific description first
    if (currentLevelConfig?.victoryConditionDescriptions?.[condition as keyof typeof currentLevelConfig.victoryConditionDescriptions]) {
      return currentLevelConfig.victoryConditionDescriptions[condition as keyof typeof currentLevelConfig.victoryConditionDescriptions];
    }
    // Default descriptions
    switch (condition) {
      case "king_beheaded":
        return "Capture the enemy King in combat";
      case "king_captured":
        return "Checkmate the enemy King";
      case "king_dishonored":
        return "Capture the enemy King with a Staff";
      case "king_escaped":
        return "Bring your King to the golden squares";
      default:
        return "";
    }
  };

  // Get victory conditions to display (same logic as quest component)
  const victoryConditions = currentLevelConfig?.displayedVictoryConditions || currentLevelConfig?.victoryConditions || [];

  // Determine which victory condition was fulfilled
  const getFulfilledVictoryCondition = (): string | null => {
    if (win !== W) return null;
    
    // Check for king_escaped first (phrase-based)
    if (phrase === "King Crossing!") {
      return "king_escaped";
    }
    
    // Check killedEnemyPieces for defeated king
    const defeatedKing = killedEnemyPieces.find(kp => kp.piece.type === "K");
    if (defeatedKing?.defeatType) {
      switch (defeatedKing.defeatType) {
        case "beheaded":
          return "king_beheaded";
        case "checkmate":
          return "king_captured";
        case "dishonored":
          return "king_dishonored";
      }
    }
    
    // Fallback: check phrase for other victory types
    if (phrase === "Regicide!" || phrase?.includes("Regicide")) {
      return "king_beheaded";
    }
    if (phrase === "King captured! Checkmate!" || phrase?.includes("Checkmate")) {
      return "king_captured";
    }
    
    // If we can't determine, return the first victory condition as fallback
    return victoryConditions.length > 0 ? victoryConditions[0] : null;
  };

  const fulfilledCondition = getFulfilledVictoryCondition();

  return (
    <div className="fixed inset-0 z-50 bg-black/70">
      <div
        className={`bg-stone-950/90 backdrop-blur rounded-2xl p-4 text-center space-y-3 border absolute ${
          win === W ? "border-green-700/50" : "border-amber-900"
        }`}
        style={{
          top: winModalPosition.top,
          left: winModalPosition.left,
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* Show initial victory phrase first, then main content (only for wins) */}
        {!showVictoryDetails && win === W && phrase && fulfilledCondition && (
          <>
            {/* Show fulfilled victory condition with green styling (same style as losing popup but in green) */}
            <div className="mb-4">
              <div className="flex flex-col gap-1 bg-black/20 rounded p-2 border border-green-700/50">
                <div className="flex items-center gap-2">
                  <span 
                    className="text-green-400 text-lg"
                    style={{
                      animation: "checkmarkDraw 0.6s ease-out forwards",
                      opacity: 0,
                      display: "inline-block",
                    }}
                  >
                    ✓
                  </span>
                  <span className="font-semibold text-green-400">
                    {formatVictoryCondition(fulfilledCondition)}
                  </span>
                </div>
                {getVictoryConditionDescription(fulfilledCondition) && (
                  <span className="text-green-100 italic text-xs ml-6">
                    {getVictoryConditionDescription(fulfilledCondition)}
                  </span>
                )}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 bg-green-700/80 px-4 py-2 rounded">
              {formatVictoryCondition(fulfilledCondition).toUpperCase()}
            </h2>
          </>
        )}

        {(showVictoryDetails || win !== W) && (
          <>
            {win !== W && (
              <>
                {/* Show victory condition above RUN ENDED */}
                {victoryConditions.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-col gap-2 text-sm">
                      {victoryConditions.map((condition: string, idx: number) => {
                        const description = getVictoryConditionDescription(condition);
                        return (
                          <div key={idx} className="flex flex-col gap-1 bg-black/20 rounded p-2 border border-red-700/30">
                            <div className="flex items-center gap-2">
                              <span className="text-red-500 text-lg">✗</span>
                              <span className="font-semibold text-red-400">
                                {formatVictoryCondition(condition)}
                              </span>
                            </div>
                            {description && (
                              <span className="text-gray-300 italic text-xs ml-6">
                                {description}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <h2 className="text-2xl font-bold text-red-500 mb-2">
                  RUN ENDED
                </h2>
              </>
            )}
            {win === W && (
              <h2 className="text-2xl font-bold text-green-400 mb-2" style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                Level Cleared!
              </h2>
            )}

            {/* Show unlocked items if player won and has unlocked items */}
            {win === W && thisLevelUnlockedItems.length > 0 && (
              <div className="mb-4 bg-gradient-to-r from-amber-600 to-amber-800 p-3 rounded-xl">
                <div className="font-bold text-white mb-1" style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
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
                // Count purses separately (25g each, not subject to ransom %)
                const purseCount = killedEnemyPieces.filter(
                  (kp) => kp.piece.equip === "purse"
                ).length;
                const purseGold = purseCount * 25;

                // Calculate ransom gold (35% of regular pieces and items, excluding Kings and purses)
                const regularValue = killedEnemyPieces.reduce(
                  (sum, killedPiece) => {
                    const piece = killedPiece.piece;

                    // Skip Kings - they get full value, not ransom percentage
                    if (piece.type === "K") return sum;

                    // Regular piece values
                    const pieceValue = VAL[piece.type as keyof typeof VAL] || 0;

                    let itemValue = 0;
                    if (piece.equip) {
                      if (piece.equip !== "purse") {
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

                const casualtiesPenalty = destroyedCourtiers * 5;
                const totalGold = ransomGold + purseGold + kingGold - casualtiesPenalty;

                return (
                  <div className="mb-4 bg-gradient-to-r from-yellow-600 to-yellow-800 p-3 rounded-xl">
                    <div className="font-bold text-white mb-2" style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>Gold Earned</div>
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
                      {Array.from({ length: destroyedCourtiers }).map((_, index) => (
                        <span
                          key={`courtier-${index}`}
                          style={{ animationDelay: `${(killedEnemyPieces.length + index) * 100}ms` }}
                          className="animate-fade-in relative"
                        >
                          <span 
                            className="obstacle-chip"
                            style={{ width: '48px', height: '48px', fontSize: '40px' }}
                          >
                            {GL.COURTIER.n}
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="text-sm text-yellow-200 mt-2 space-y-1">
                      {/* Show units ransom if any regular pieces were killed */}
                      {ransomGold > 0 && (
                        <div>
                          Units Ransom: {ransomGold}g
                        </div>
                      )}
                      
                      {/* Show purses collected separately */}
                      {purseCount > 0 ? (
                        <div>
                          Purses Collected: {purseCount} ({purseGold}g)
                        </div>
                      ) : null}
                      
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
                                defeatedKing.defeatType === "beheaded" ? "Regicide" :
                                "King Dishonored";
                              return `${statusText}: ${kingGold}g`;
                            }
                            return `King: ${kingGold}g`;
                          })()}
                        </div>
                      )}
                      
                      {/* Show peasants casualties if any Courtiers were destroyed */}
                      {destroyedCourtiers > 0 && (
                        <div className="text-red-950">
                          Peasants Casualties: -{casualtiesPenalty}g
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
              style={{ fontFamily: 'serif' }}
            >
              {win === W ? "Next Level" : "Try Again"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
