import React from "react";
import type { Equip, Color, KilledPiece, ObjectiveState, Difficulty } from "./types";
import type { LevelConfig } from "./levelConfig";
import { VAL, ITEM_COSTS, GL, ITEM_DESCRIPTIONS } from "./constants";
import { getObjectiveDescription } from "./ObjectiveManager";

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
  handleRetryLevel: () => void;
  winModalPosition: { top: number; left: number } | null;
  currentLevelConfig: LevelConfig | null;
  objectiveStates?: ObjectiveState[];
  activeObjectiveIds?: string[];
  difficulty?: Difficulty;
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
  handleRetryLevel,
  winModalPosition,
  currentLevelConfig,
  objectiveStates = [],
  activeObjectiveIds = [],
  difficulty,
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

  const showDetails = showVictoryDetails || win !== W;
  const frameBorderClass =
    win === W ? "border-amber-700/50" : "border-red-700/60";
  const topBottomBarClass =
    win === W
      ? "bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600"
      : "bg-gradient-to-r from-red-700 via-amber-600 to-red-700";
  const headerGradientClass =
    win === W
      ? "bg-gradient-to-r from-amber-800/30 to-amber-900/30 border-b-2 border-amber-700/40"
      : "bg-gradient-to-r from-red-900/30 to-amber-900/30 border-b-2 border-red-700/40";
  const headerTitle =
    win === W ? "⚔️ QUEST COMPLETED! ⚔️" : "☠️ QUEST FAILED ☠️";

  const questNarration = currentLevelConfig?.questNarration;
  const isQuestVictory =
    win === W && fulfilledCondition === "king_escaped" && !!questNarration;

  const summaryContent = (() => {
    const questDescription =
      questNarration ??
      (fulfilledCondition
        ? getVictoryConditionDescription(fulfilledCondition)
        : undefined) ??
      (fulfilledCondition ? formatVictoryCondition(fulfilledCondition) : undefined);
    const fallbackVictoryText =
      phrase ||
      (fulfilledCondition ? formatVictoryCondition(fulfilledCondition) : undefined) ||
      "Victory is yours, my liege.";
    const victoryDisplayText = questDescription ?? fallbackVictoryText;

    if (win === W) {
      if (!showDetails && fulfilledCondition) {
        return (
          <div className="flex flex-col gap-2 items-center text-green-200">
            <div
              className="flex items-center gap-2 font-semibold text-lg"
              style={{ fontFamily: 'serif' }}
            >
              <span
                className="text-green-300 text-xl"
                style={{
                  animation: "checkmarkDraw 0.6s ease-out forwards",
                  opacity: 0,
                  display: "inline-block",
                }}
              >
                ✓
              </span>
              <span>Quest Completed</span>
            </div>
            {victoryDisplayText && (
              <span
                className="text-sm italic text-green-100 text-center"
                style={{ fontFamily: 'serif' }}
              >
                {victoryDisplayText}
              </span>
            )}
          </div>
        );
      }

      return (
        <div
          className="text-amber-100 text-sm leading-relaxed text-center italic"
          style={{ fontFamily: "serif" }}
        >
          {victoryDisplayText}
        </div>
      );
    }

    return (
      <div
        className="text-red-200 text-sm leading-relaxed text-center italic"
        style={{ fontFamily: "serif" }}
      >
        {phrase || "Edran's tale is written in grief this day."}
      </div>
    );
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/70">
      <div
        className="stand absolute"
        style={{
          top: winModalPosition.top,
          left: winModalPosition.left,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className={`bg-gradient-to-b from-amber-900/40 via-stone-950/90 to-stone-950/95 rounded-lg shadow-2xl border-4 ${frameBorderClass} backdrop-blur-sm overflow-hidden`}
          style={{
            minWidth: "360px",
            width: "min(420px, calc(100vw - 32px))",
            maxWidth: "420px",
          }}
        >
          <div className={`h-2 ${topBottomBarClass}`}></div>
          <div className={`px-6 py-4 ${headerGradientClass}`}>
            <h2
              className="text-2xl font-bold text-center text-amber-200 tracking-wide"
              style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}
            >
              {headerTitle}
            </h2>
          </div>
          <div className="px-6 py-4 bg-gradient-to-b from-stone-950/50 to-stone-950/70">
            {summaryContent}
          </div>
          {showDetails && (
            <div className="h-px bg-gradient-to-r from-transparent via-amber-600 to-transparent mx-6"></div>
          )}
          {showDetails && (
            <div className="px-6 py-4 bg-gradient-to-b from-stone-950/70 to-stone-950/85 space-y-4">
              {win !== W && (
                <>
                  {victoryConditions.length > 0 && (
                    <div className="flex flex-col gap-2 text-sm">
                      {victoryConditions.map((condition: string, idx: number) => {
                        const description = getVictoryConditionDescription(condition);
                        return (
                          <div
                            key={idx}
                            className="flex flex-col gap-1 bg-black/20 rounded p-2 border border-red-700/30"
                          >
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
                  )}
                  <h2
                    className="text-2xl font-bold text-red-500"
                    style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}
                  >
                    Edran's Tale Ended
                  </h2>
                </>
              )}

              {win === W && thisLevelUnlockedItems.length > 0 && (
                <div className="bg-gradient-to-r from-amber-600 to-amber-800 p-3 rounded-xl">
                  <div className="font-bold text-white mb-1 text-center">
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

              {win === W &&
                killedEnemyPieces.length > 0 &&
                (() => {
                  const purseCount = killedEnemyPieces.filter(
                    (kp) => kp.piece.equip === "purse"
                  ).length;
                  const purseGold = purseCount * 25;

                  const regularValue = killedEnemyPieces.reduce(
                    (sum, killedPiece) => {
                      const piece = killedPiece.piece;
                      if (piece.type === "K") return sum;
                      const pieceValue = VAL[piece.type as keyof typeof VAL] || 0;
                      let itemValue = 0;
                      if (piece.equip && piece.equip !== "purse") {
                        itemValue =
                          ITEM_COSTS[piece.equip as keyof typeof ITEM_COSTS] || 0;
                      }
                      return sum + pieceValue + itemValue;
                    },
                    0
                  );
                  const ransomGold = Math.floor(regularValue * 0.35);

                  const kingGold = killedEnemyPieces.reduce((sum, killedPiece) => {
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
                  }, 0);

                  const casualtiesPenalty = destroyedCourtiers * 5;

                  const activeObjectives =
                    currentLevelConfig?.optionalObjectives?.filter((obj) =>
                      activeObjectiveIds.includes(obj.id)
                    ) || [];
                  const completedObjectives = objectiveStates.filter(
                    (state) =>
                      state.isCompleted &&
                      activeObjectiveIds.includes(state.objectiveId)
                  );
                  const objectiveBonus = completedObjectives.reduce((total, state) => {
                    const objective = activeObjectives.find(
                      (obj) => obj.id === state.objectiveId
                    );
                    if (!objective) return total;

                    const reward =
                      difficulty &&
                      objective.rewardByDifficulty?.[difficulty] !== undefined
                        ? objective.rewardByDifficulty[difficulty]!
                        : objective.reward;

                    return total + reward;
                  }, 0);

                  const totalGold =
                    ransomGold +
                    purseGold +
                    kingGold -
                    casualtiesPenalty +
                    objectiveBonus;

                  return (
                    <div className="bg-gradient-to-r from-yellow-600 to-yellow-800 p-3 rounded-xl">
                      <div className="flex flex-wrap justify-center gap-2 mb-2">
                        {killedEnemyPieces.map((killedPiece, index) => (
                          <span
                            key={index}
                            style={{ animationDelay: `${index * 100}ms` }}
                            className="animate-fade-in relative"
                          >
                            <span
                              className="chip pb"
                              style={{ width: "48px", height: "48px", fontSize: "40px" }}
                            >
                              {(() => {
                                const glyphSet =
                                  GL[killedPiece.piece.type as keyof typeof GL];
                                return glyphSet && "b" in glyphSet
                                  ? (glyphSet["b" as keyof typeof glyphSet] as string)
                                  : "?";
                              })()}
                            </span>
                            {killedPiece.piece.equip && (
                              <span className="text-xl absolute top-0 right-0 translate-x-1 -translate-y-1">
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
                              style={{ width: "48px", height: "48px", fontSize: "40px" }}
                            >
                              {GL.COURTIER.n}
                            </span>
                          </span>
                        ))}
                      </div>
                      <div className="text-sm mt-2 space-y-1 text-amber-200">
                        {ransomGold > 0 && (
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-amber-200">Units Ransom</span>
                            <span className="text-amber-400">+{ransomGold}g</span>
                          </div>
                        )}
                        {purseCount > 0 && (
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-amber-200">
                              Purses Collected (x{purseCount})
                            </span>
                            <span className="text-amber-400">+{purseGold}g</span>
                          </div>
                        )}
                        {kingGold > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-200">
                              {(() => {
                                const defeatedKing = killedEnemyPieces.find(
                                  (kp) => kp.piece.type === "K"
                                );
                                if (defeatedKing?.defeatType) {
                                  return defeatedKing.defeatType === "checkmate"
                                    ? "King Captured"
                                    : defeatedKing.defeatType === "beheaded"
                                    ? "Regicide"
                                    : "King Dishonored";
                                }
                                return "King";
                              })()}
                            </span>
                            <span className="font-semibold text-amber-400">
                              +{kingGold}g
                            </span>
                          </div>
                        )}
                        {destroyedCourtiers > 0 && (
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-red-700">Peasants Casualties</span>
                            <span className="text-red-700">-{casualtiesPenalty}g</span>
                          </div>
                        )}
                      </div>
                      {objectiveBonus > 0 && (
                        <>
                          <div className="h-px bg-gradient-to-r from-transparent via-yellow-400 to-transparent my-3"></div>
                          <div className="space-y-1 text-sm text-amber-200">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="text-amber-200">Objectives Bonus</span>
                              <span className="text-amber-400">
                                +{objectiveBonus}g
                              </span>
                            </div>
                            {completedObjectives.map((state) => {
                              const objective = activeObjectives.find(
                                (obj) => obj.id === state.objectiveId
                              );
                              if (!objective) return null;

                              const description = getObjectiveDescription(
                                objective,
                                difficulty
                              );

                              return (
                                <div
                                  key={state.objectiveId}
                                  className="flex items-center gap-2 text-xs text-amber-200"
                                >
                                  <span className="text-amber-400">✓</span>
                                  <span className="text-amber-200">{description}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                      <div className="h-px bg-gradient-to-r from-transparent via-yellow-400 to-transparent my-3"></div>
                      <div className="font-bold text-2xl text-amber-200 flex justify-between">
                        <span className="text-amber-200">Total Gold Earned:</span>
                        <span className="text-amber-400">+{totalGold}g</span>
                      </div>
                    </div>
                  );
                })()}

              {win === W && (
                <div className="bg-gradient-to-b from-stone-950/70 to-stone-950/90 px-0 pt-2">
                  <button
                    onClick={handleNextLevel}
                    className="px-4 py-2 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    style={{ fontFamily: 'serif' }}
                  >
                    Next Level
                  </button>
                </div>
              )}

              {win !== W && (
                <div className="bg-gradient-to-b from-stone-950/70 to-stone-950/90 px-0 pt-2 flex flex-col gap-3">
                  <button
                    onClick={handleRetryLevel}
                    className="victory-popup-btn victory-popup-btn-retry"
                    style={{ fontFamily: 'serif' }}
                  >
                    Retry Level
                  </button>
                  <button
                    onClick={handleTryAgain}
                    className="victory-popup-btn victory-popup-btn-restart"
                    style={{ fontFamily: 'serif' }}
                  >
                    Restart Campaign
                  </button>
                </div>
              )}
            </div>
          )}
          <div className={`h-2 ${topBottomBarClass}`}></div>
        </div>
      </div>
    </div>
  );
}
