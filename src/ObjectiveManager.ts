// ObjectiveManager.ts - Manages optional objective conditions and tracking
import type {
  OptionalObjective,
  OptionalObjectiveCondition,
  ObjectiveState,
  PieceType,
  Piece,
  Equip,
  Difficulty,
  Board,
  KilledPiece,
  TerrainCell,
} from "./types";
import type { VictoryCondition } from "./levelConfig";

/**
 * Tracks objective-related game state during a level
 */
export interface ObjectiveTracking {
  turnNumber: number;
  whiteTurnCount: number;
  playerPiecesLost: Piece[]; // Pieces lost by the player
  enemyPiecesKilled: KilledPiece[]; // Enemy pieces killed by the player
  pieceConversions: number; // Number of staff conversions
  courtiersDestroyed: number; // Courtiers destroyed
  itemsUsed: Set<Exclude<Equip, undefined>>; // Items that have been used
  kingPosition: { x: number; y: number } | null; // Current king position
  kingDisguiseActive: boolean; // Whether the king currently retains a disguise
  victoryDelivererType?: PieceType;
  victoryDelivererOriginalType?: PieceType;
  victoryCondition?: VictoryCondition;
  difficulty?: Difficulty; // Current game difficulty
}

/**
 * Creates initial objective tracking state
 */
export function createObjectiveTracking(): ObjectiveTracking {
  return {
    turnNumber: 0,
    whiteTurnCount: 0,
    playerPiecesLost: [],
    enemyPiecesKilled: [],
    pieceConversions: 0,
    courtiersDestroyed: 0,
    itemsUsed: new Set(),
    kingPosition: null,
    kingDisguiseActive: false,
    victoryDelivererType: undefined,
    victoryDelivererOriginalType: undefined,
    victoryCondition: undefined,
    difficulty: undefined,
  };
}

function getEffectiveConditionParams(
  condition: OptionalObjectiveCondition,
  difficulty?: Difficulty
): Record<string, any> {
  const baseParams = condition.params ?? {};
  const difficultyParams = condition.difficultyParams ?? {};

  if (difficulty) {
    const overrides = difficultyParams[difficulty];
    if (overrides) {
      return {
        ...baseParams,
        ...overrides,
      };
    }
    return baseParams;
  }

  const fallbackDifficulty: Difficulty | undefined =
    (difficultyParams.easy ? "easy" : undefined) ??
    (difficultyParams.hard ? "hard" : undefined);

  if (fallbackDifficulty && difficultyParams[fallbackDifficulty]) {
    return {
      ...baseParams,
      ...difficultyParams[fallbackDifficulty]!,
    };
  }

  return baseParams;
}

function applyDescriptionTemplate(
  template: string,
  params: Record<string, any>
): string {
  let result = template;

  for (let iteration = 0; iteration < 5; iteration++) {
    if (!result.includes("{{")) break;

    const next = result.replace(/{{\s*([^}]+)\s*}}/g, (match, rawContent) => {
      const segments = rawContent
        .split("|")
        .map((segment: string) => segment.trim())
        .filter(Boolean);

      if (segments.length === 0) return match;

      const [command, ...args] = segments;

      switch (command) {
        case "plural": {
          const [paramName, singular = "", plural = "", zero] = args;
          const value = params[paramName];
          if (typeof value !== "number") return match;
          if (zero !== undefined && value === 0) return zero;
          return value === 1 ? singular : plural;
        }
        case "pluralSuffix": {
          const [paramName, suffix = "s", singularSuffix = ""] = args;
          const value = params[paramName];
          if (typeof value !== "number") return match;
          return value === 1 ? singularSuffix : suffix;
        }
        case "ifZero": {
          const [paramName, zeroValue = "", elseValue = ""] = args;
          const value = params[paramName];
          if (typeof value !== "number") return match;
          return value === 0 ? zeroValue : elseValue;
        }
        case "ifOne": {
          const [paramName, oneValue = "", elseValue = ""] = args;
          const value = params[paramName];
          if (typeof value !== "number") return match;
          return value === 1 ? oneValue : elseValue;
        }
        default: {
          const value = params[command];
          if (value === undefined || value === null) return match;
          return String(value);
        }
      }
    });

    if (next === result) {
      break;
    }

    result = next;
  }

  return result;
}

export function getObjectiveDescription(
  objective: OptionalObjective,
  difficulty?: Difficulty
): string {
  const params = getEffectiveConditionParams(objective.condition, difficulty);
  const originalDescription = objective.description ?? "";
  const hasTemplate = originalDescription.includes("{{");
  let description = originalDescription;

  if (hasTemplate) {
    const templated = applyDescriptionTemplate(originalDescription, params);
    if (!templated.includes("{{")) {
      return templated.trim();
    }
    description = templated.trim();
  }

  if (description && !description.includes("{{")) {
    return description.trim();
  }

  switch (objective.condition.type) {
    case "max_casualties": {
      const maxLosses = params.maxLosses as number | undefined;
      if (typeof maxLosses === "number") {
        if (maxLosses === 0) return "Win without losing any units";
        return `Win with no more than ${maxLosses} ${
          maxLosses === 1 ? "casualty" : "casualties"
        }`;
      }
      break;
    }

    case "dont_kill_courtiers": {
      const maxCourtiers = params.maxCourtiers as number | undefined;
      if (typeof maxCourtiers === "number") {
        if (maxCourtiers === 0) return "Don't destroy any Courtiers";
        return `Don't destroy more than ${maxCourtiers} ${
          maxCourtiers === 1 ? "Courtier" : "Courtiers"
        }`;
      }
      break;
    }

    case "win_under_turns": {
      const maxTurns = params.maxTurns as number | undefined;
      if (typeof maxTurns === "number") {
        const term = maxTurns === 1 ? "turn" : "turns";
        return objective.description.replace(/\d+/, String(maxTurns)).replace(
          /\bturns?\b/i,
          term
        );
      }
      break;
    }
  }

  return description;
}

/**
 * Initializes objective states from level config
 */
export function initializeObjectiveStates(
  objectives: OptionalObjective[]
): ObjectiveState[] {
  return objectives.map((obj) => ({
    objectiveId: obj.id,
    isCompleted: false,
    isFailed: false,
    progress: obj.progress ? { ...obj.progress } : undefined,
    completedOnTurn: undefined,
    failedOnTurn: undefined,
  }));
}

/**
 * Gets the reward amount for an objective based on difficulty
 */
export function getObjectiveReward(
  objective: OptionalObjective,
  difficulty?: Difficulty
): number {
  if (difficulty && objective.rewardByDifficulty?.[difficulty] !== undefined) {
    return objective.rewardByDifficulty[difficulty]!;
  }
  const fallbackDifficulty: Difficulty | undefined =
    (objective.rewardByDifficulty?.easy !== undefined ? "easy" : undefined) ??
    (objective.rewardByDifficulty?.hard !== undefined ? "hard" : undefined);
  if (
    fallbackDifficulty &&
    objective.rewardByDifficulty?.[fallbackDifficulty] !== undefined
  ) {
    return objective.rewardByDifficulty[fallbackDifficulty]!;
  }
  return objective.reward;
}

/**
 * Checks if a specific objective condition is met or failed
 */
export interface ObjectiveCheckResult {
  isMet: boolean;
  isFailed: boolean;
  isPermanentlyMet: boolean;
  progress?: { current: number; target: number };
}

export function checkObjectiveCondition(
  condition: OptionalObjectiveCondition,
  tracking: ObjectiveTracking,
  board?: Board
): ObjectiveCheckResult {
  const params = getEffectiveConditionParams(
    condition,
    tracking.difficulty
  );
  const { type } = condition;

  switch (type) {
    case "no_piece_type_lost": {
      const pieceType = params.pieceType as PieceType;
      const pieceName = params.pieceName as string | undefined;

      const lostPieces = tracking.playerPiecesLost.filter(
        (p) => p.type === pieceType
      );

      let isFailed = lostPieces.length > 0; // Failed if any pieces of this type were lost

      if (pieceName && board) {
        let found = false;
        for (let y = 0; y < board.length && !found; y++) {
          for (let x = 0; x < board[y].length; x++) {
            const piece = board[y][x];
            if (piece?.name === pieceName && piece.color === "w") {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          isFailed = true;
        }
      }

      const isMet = !isFailed;

      return {
        isMet,
        isFailed,
        isPermanentlyMet: false, // Only fully satisfied once the level ends
        progress:
          !pieceName && lostPieces.length > 0
            ? { current: lostPieces.length, target: 0 }
            : undefined,
      };
    }

    case "win_under_turns": {
      const maxTurns = params.maxTurns as number;
      const turnCount = tracking.whiteTurnCount ?? tracking.turnNumber;
      const isMet = turnCount <= maxTurns;
      const isFailed = turnCount > maxTurns; // Failed if exceeded turn limit
      return {
        isMet,
        isFailed,
        isPermanentlyMet: false, // Confirmed only when the level is cleared
        progress: { current: turnCount, target: maxTurns },
      };
    }

    case "king_at_position": {
      if (!tracking.kingPosition || !board) {
        return { isMet: false, isFailed: false, isPermanentlyMet: false };
      }
      
      const targetRank = params.rank as number | undefined;
      const targetFile = params.file as number | undefined;
      const targetArea = params.area as "top" | "bottom" | "left" | "right" | undefined;
      
      let isMet = true;
      
      if (targetRank !== undefined) {
        isMet = isMet && tracking.kingPosition.y === targetRank;
      }
      
      if (targetFile !== undefined) {
        isMet = isMet && tracking.kingPosition.x === targetFile;
      }
      
      if (targetArea && board) {
        const boardSize = board.length;
        switch (targetArea) {
          case "top":
            isMet = isMet && tracking.kingPosition.y === boardSize - 1;
            break;
          case "bottom":
            isMet = isMet && tracking.kingPosition.y === 0;
            break;
          case "left":
            isMet = isMet && tracking.kingPosition.x === 0;
            break;
          case "right":
            isMet = isMet && tracking.kingPosition.x === boardSize - 1;
            break;
        }
      }
      
      // Only check at end of level, so never failed mid-game
      return { isMet, isFailed: false, isPermanentlyMet: false };
    }

    case "convert_pieces": {
      const targetCount = params.count as number;
      const isMet = tracking.pieceConversions >= targetCount;
      // Can only be evaluated at end of level
      return {
        isMet,
        isFailed: false,
        isPermanentlyMet: isMet, // Once achieved, cannot be undone
        progress: { current: tracking.pieceConversions, target: targetCount },
      };
    }

    case "kill_count": {
      const targetCount = params.count as number;
      const comparison =
        (params.comparison as "exact" | "atleast" | "atmost") || "atleast";
      const pieceType = params.pieceType as PieceType | undefined;
      const killerPieceType = params.killerPieceType as PieceType | undefined;
      const killerName = params.killerName as string | undefined;
      const killerTerrain = params.killerTerrain as TerrainCell | string | undefined;
      const victimStunned = params.victimStunned as boolean | undefined;

      let kills = tracking.enemyPiecesKilled;
      if (pieceType) {
        kills = kills.filter((p) => p.piece.type === pieceType);
      }
      if (killerPieceType) {
        kills = kills.filter((p) => p.killerType === killerPieceType);
      }
      if (killerName) {
        kills = kills.filter((p) => {
          if (!p.killerName) return false;
          return p.killerName === killerName;
        });
      }
      if (killerTerrain) {
        kills = kills.filter((p) => p.killerTerrain === killerTerrain);
      }
      if (victimStunned !== undefined) {
        kills = kills.filter((p) => (!!p.targetStunned) === victimStunned);
      }

      const killCount = kills.length;

      let isMet = false;
      let isFailed = false;
      let isPermanentlyMet = false;
      switch (comparison) {
        case "exact":
          isMet = killCount === targetCount;
          // Can only check exact at end
          isFailed = false;
          isPermanentlyMet = false;
          break;
        case "atleast":
          isMet = killCount >= targetCount;
          // Can't fail this type
          isFailed = false;
          isPermanentlyMet = isMet; // Once minimum reached it stays met
          break;
        case "atmost":
          isMet = killCount <= targetCount;
          isFailed = killCount > targetCount; // Failed if exceeded
          isPermanentlyMet = false; // Only finalised at end
          break;
      }
      
      return {
        isMet,
        isFailed,
        isPermanentlyMet,
        progress: { current: killCount, target: targetCount },
      };
    }

    case "no_item_used": {
      const itemType = params.itemType as Exclude<Equip, undefined>;
      const isMet = !tracking.itemsUsed.has(itemType);
      const isFailed = tracking.itemsUsed.has(itemType); // Failed if item was used
      return { isMet, isFailed, isPermanentlyMet: false };
    }

    case "max_casualties": {
      const maxLosses = params.maxLosses as number;
      const isMet = tracking.playerPiecesLost.length <= maxLosses;
      const isFailed = tracking.playerPiecesLost.length > maxLosses; // Failed if exceeded
      return {
        isMet,
        isFailed,
        isPermanentlyMet: false,
        progress: { current: tracking.playerPiecesLost.length, target: maxLosses },
      };
    }

    case "keep_king_disguised": {
      const hasDisguise = tracking.kingDisguiseActive;
      return {
        isMet: hasDisguise,
        isFailed: !hasDisguise,
        isPermanentlyMet: false,
      };
    }

    case "checkmate_with_piece": {
      const requiredType = params.pieceType as PieceType;
      const delivererType =
        tracking.victoryDelivererOriginalType ?? tracking.victoryDelivererType;

      if (!delivererType) {
        return { isMet: false, isFailed: false, isPermanentlyMet: false };
      }

      const isMet = delivererType === requiredType;
      return {
        isMet,
        isFailed: !isMet,
        isPermanentlyMet: isMet,
      };
    }

    case "dont_kill_courtiers": {
      const maxCourtiers = params.maxCourtiers as number;
      const isMet = tracking.courtiersDestroyed <= maxCourtiers;
      const isFailed = tracking.courtiersDestroyed > maxCourtiers; // Failed if exceeded
      return {
        isMet,
        isFailed,
        isPermanentlyMet: false,
        progress: { current: tracking.courtiersDestroyed, target: maxCourtiers },
      };
    }

    case "custom": {
      // Custom conditions would need to be handled separately
      // For now, return not met
      console.warn("Custom objective conditions not yet implemented");
      return { isMet: false, isFailed: false, isPermanentlyMet: false };
    }

    default:
      console.warn(`Unknown objective condition type: ${type}`);
      return { isMet: false, isFailed: false, isPermanentlyMet: false };
  }
}

/**
 * Checks all objectives and updates their states
 * Returns object with newly completed and failed objective IDs
 */
export function checkAllObjectives(
  objectives: OptionalObjective[],
  objectiveStates: ObjectiveState[],
  tracking: ObjectiveTracking,
  board?: Board,
  options?: { allowCompletion?: boolean }
): { newlyCompleted: string[]; newlyFailed: string[] } {
  const newlyCompleted: string[] = [];
  const newlyFailed: string[] = [];
  const allowCompletion = options?.allowCompletion ?? false;

  objectiveStates.forEach((state) => {
    // Skip if already completed or failed
    if (state.isCompleted || state.isFailed) return;

    const objective = objectives.find((obj) => obj.id === state.objectiveId);
    if (!objective) return;

    const result = checkObjectiveCondition(objective.condition, tracking, board);
    
    // Update progress
    if (result.progress) {
      state.progress = result.progress;
    }

    // Check if newly completed
    const canCompleteNow = result.isPermanentlyMet || allowCompletion;
    if (result.isMet && !state.isCompleted && canCompleteNow) {
      state.isCompleted = true;
      state.completedOnTurn = tracking.turnNumber;
      newlyCompleted.push(state.objectiveId);
    }
    
    // Check if newly failed
    if (result.isFailed && !state.isFailed) {
      state.isFailed = true;
      state.failedOnTurn = tracking.turnNumber;
      newlyFailed.push(state.objectiveId);
    }
  });

  return { newlyCompleted, newlyFailed };
}

/**
 * Calculate total bonus gold from completed objectives
 */
export function calculateObjectiveBonus(
  objectives: OptionalObjective[],
  objectiveStates: ObjectiveState[],
  difficulty?: Difficulty
): number {
  return objectiveStates.reduce((total, state) => {
    if (!state.isCompleted) return total;
    
    const objective = objectives.find((obj) => obj.id === state.objectiveId);
    if (!objective) return total;
    
    return total + getObjectiveReward(objective, difficulty);
  }, 0);
}

/**
 * Formats an objective description with current progress (if applicable)
 */
export function formatObjectiveDescription(
  objective: OptionalObjective,
  state?: ObjectiveState,
  options?: { difficulty?: Difficulty; includeProgress?: boolean }
): string {
  const { difficulty, includeProgress = true } = options || {};

  const description = getObjectiveDescription(objective, difficulty);

  if (
    !includeProgress ||
    !state ||
    state.isCompleted ||
    state.isFailed ||
    !state.progress ||
    state.progress.target === 0
  ) {
    return description;
  }

  const { current, target } = state.progress;
  return `${description} (${current}/${target})`;
}

