import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  loadLevelConfig,
  getLevelConfig,
  type TerrainConfigCell,
  type NamedPiece,
  type BotBehavior,
  type LevelConfig,
} from "./levelConfig";
import StoryCard from "./StoryCard";
import type {
  PieceType,
  Color,
  PieceColor,
  Equip,
  Piece,
  Board,
  StoryCard as StoryCardType,
  StoryEvent,
  Phase,
  TerrainCell,
  Terrain,
  ObstacleType,
  Obstacle,
  MarketAction,
  CampaignState,
  MoveRecord,
  KilledPiece,
  KingDefeatType,
  OutcomeData,
} from "./types";
import {
  S,
  W,
  B,
  N,
  RAD,
  VAL,
  ITEM_COSTS,
  TIMING,
  GL,
  PHRASES,
  NAMED_PHRASES,
  SWING_PHRASES,
  ITEM_DESCRIPTIONS,
  PIECE_DESCRIPTIONS,
  PIECE_NAMES,
} from "./constants";
import { Market } from "./Market";
import { VictoryPopup } from "./VictoryPopup";
import "./styles.css";

// --- Error Boundary & Tooltip Components ---

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = useState<Error | null>(null);
  if (err) {
    return (
      <div style={{ color: "white", padding: 16 }}>
        <h2>Something went wrong.</h2>
        <pre>{String(err.stack || err.message || err)}</pre>
      </div>
    );
  }
  return (
    <React.Suspense
      fallback={<div style={{ color: "white", padding: 16 }}>Loading…</div>}
    >
      <BoundaryInner onError={setErr}>{children}</BoundaryInner>
    </React.Suspense>
  );
}

function BoundaryInner({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: (e: Error) => void;
}) {
  // Capture render errors
  try {
    return <>{children}</>;
  } catch (e: any) {
    onError(e);
    return null;
  }
}

function TooltipLayer({
  tip,
}: {
  tip: { text: string; x: number; y: number } | null;
}) {
  if (!tip) return null;
  return createPortal(
    <div
      className="tooltip"
      role="tooltip"
      aria-hidden="true"
      style={{
        position: "fixed",
        left: tip.x,
        top: tip.y,
        zIndex: 9999,
        pointerEvents: "none", // <- crucial
      }}
    >
      {tip.text}
    </div>,
    document.body
  );
}

function useGlobalMousePos(enabled: boolean) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX + 16, y: e.clientY + 16 }); // slight offset so cursor doesn't cover it
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [enabled]);
  return pos;
}

// --- Game Constants & Types ---
/* Dice Chess 7×7 — Slim
 * Keeps: brown board, black/white chips (high-contrast black pawns), fog on top rank, hover % odds,
 * support rings, King check aura, dice badges with base+mods then total bump, "King Captured", New Game.
 * Items: 🗡️ Sword, 🛡️ Shield, ⚔️ Lance, 🔥 Torch, 🏹 Bow, 🪄 Staff, 🔮 Crystal Ball, 🎭 Disguise
 */

// --- Sound Engine ---
const sfx = {
  muted: false,
  audioContext: new (window.AudioContext ||
    (window as any).webkitAudioContext)(),

  _play(
    freq: number,
    vol: number,
    duration: number,
    type: OscillatorType = "sine"
  ) {
    if (this.muted) return;
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
    gain.gain.setValueAtTime(vol, this.audioContext.currentTime);

    gain.gain.exponentialRampToValueAtTime(
      0.00001,
      this.audioContext.currentTime + duration
    );
    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  },

  purchase() {
    this._play(880, 0.1, 0.1);
    setTimeout(() => this._play(1046, 0.1, 0.15), 100);
  },
  deploy() {
    this._play(220, 0.3, 0.15, "square");
  },
  equip() {
    this._play(1200, 0.2, 0.1, "triangle");
    setTimeout(() => this._play(1800, 0.2, 0.1, "triangle"), 50);
  },
  move() {
    this._play(660, 0.25, 0.1, "triangle");
  },
  capture() {
    this._play(150, 0.4, 0.2, "sawtooth");
  },
  combatLose() {
    this._play(220, 0.4, 0.25, "sawtooth");
    setTimeout(() => this._play(110, 0.5, 0.35, "sawtooth"), 120);
  },
  convert() {
    this._play(523, 0.1, 0.1);
    setTimeout(() => this._play(659, 0.1, 0.1), 100);
    setTimeout(() => this._play(784, 0.1, 0.15), 200);
  },
  reveal() {
    this._play(300, 0.2, 0.05, "sawtooth");
    setTimeout(() => this._play(600, 0.3, 0.2, "sawtooth"), 50);
  },
  crystalBall() {
    this._play(400, 0.2, 0.3);
    setTimeout(() => this._play(800, 0.2, 0.3), 50);
  },
  spear() {
    this._play(300, 0.3, 0.2, "sawtooth");
  },
  bowBreak() {
    this._play(100, 0.5, 0.15, "square");
  },
  rockDestroy() {
    this._play(80, 0.6, 0.3, "sawtooth");
  },
  prayer() {
    this._play(600, 0.3, 0.2, "triangle");
    setTimeout(() => this._play(900, 0.3, 0.3, "triangle"), 100);
  },
  winCheckmate() {
    this._play(523, 0.2, 0.1);
    setTimeout(() => this._play(659, 0.2, 0.1), 120);
    setTimeout(() => this._play(784, 0.25, 0.15), 240);
    setTimeout(() => this._play(1046, 0.3, 0.5), 360);
  },
  loseCheckmate() {
    this._play(440, 0.4, 0.25, "sawtooth");
    setTimeout(() => this._play(220, 0.5, 0.35, "sawtooth"), 200);
    setTimeout(() => this._play(110, 0.6, 0.8, "sawtooth"), 400);
  },
  cashOut() {
    this._play(800, 0.2, 0.1, "triangle");
    setTimeout(() => this._play(1000, 0.2, 0.1, "triangle"), 80);
    setTimeout(() => this._play(1200, 0.25, 0.15, "triangle"), 160);
  },
  unlock() {
    this._play(523, 0.3, 0.15, "triangle");
    setTimeout(() => this._play(659, 0.3, 0.15, "triangle"), 120);
    setTimeout(() => this._play(784, 0.4, 0.2, "triangle"), 240);
    setTimeout(() => this._play(1046, 0.5, 0.3, "triangle"), 360);
  },
};

// --- RNG Helpers ---
function xmur3(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rngFrom = (seed: string) => {
  const f = xmur3(seed);
  return sfc32(f(), f(), f(), f());
};
const rand = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

// --- Utils ---
const inb = (x: number, y: number) => x >= 0 && x < S && y >= 0 && y < S;
const inBounds = (x: number, y: number, size: number) =>
  x >= 0 && x < size && y >= 0 && y < size;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const cloneB = (b: Board) => b.map((r) => r.map((p) => (p ? { ...p } : null)));

// Campaign utility functions
function serializePiece(p: Piece): {
  id: string;
  type: PieceType;
  color: PieceColor;
  equip?: Equip;
  originalType?: PieceType;
  name?: string;
  kills?: number;
  isPreconfigured?: boolean;
  isExhausted?: boolean;
  speechLines?: string[];
} {
  return {
    id: p.id,
    type: p.type,
    color: p.color,
    equip: p.equip,
    originalType: p.originalType,
    name: p.name,
    kills: p.kills,
    isPreconfigured: p.isPreconfigured,
    isExhausted: p.isExhausted,
    speechLines: p.speechLines,
  };
}

function deserializePiece(s: {
  id: string;
  type: PieceType;
  color: PieceColor;
  equip?: Equip;
  originalType?: PieceType;
  name?: string;
  kills?: number;
  isPreconfigured?: boolean;
  isExhausted?: boolean;
  speechLines?: string[];
}): Piece {
  return {
    id: s.id,
    type: s.type,
    color: s.color,
    equip: s.equip,
    originalType: s.originalType,
    name: s.name,
    kills: s.kills,
    isPreconfigured: s.isPreconfigured,
    isExhausted: s.isExhausted,
    speechLines: s.speechLines,
    stunnedForTurns: undefined, // Reset transient combat state
  };
}

function placeRoster(B: Board, O: Obstacle, roster: Piece[], boardSize: number) {
  const slots: Array<{ x: number; y: number }> = [];
  // rows 0..1 first, then row 2
  for (let y of [0, 1, 2]) {
    for (let x = 0; x < boardSize; x++) slots.push({ x, y });
  }

  // Sort roster to prioritize King placement
  const sortedRoster = roster.slice().sort((a, b) => {
    if (a.type === "K") return -1; // King gets highest priority
    if (b.type === "K") return 1;
    return 0; // Keep other pieces in original order
  });

  // Place pieces in available slots, avoiding obstacles
  let pieceIndex = 0;
  for (let i = 0; i < slots.length && pieceIndex < sortedRoster.length; i++) {
    const { x, y } = slots[i];
    // Check if position is empty (not occupied by obstacle or other piece)
    if (!B[y]?.[x] && O[y]?.[x] === "none") {
      B[y][x] = { ...sortedRoster[pieceIndex] }; // clone to avoid accidental mutation
      pieceIndex++;
    }
  }
}
const FILES = "abcdefghijkl"; // Support boards up to 12x12
const getChessNotation = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  piece: Piece,
  isCapture: boolean
) => {
  let notation = "";
  // The glyph is now handled in MoveCell, so we only need the coordinates part of the notation.
  if (piece.type === "P" && isCapture) {
    notation += FILES[from.x];
  }
  if (isCapture) {
    notation += "x";
  }
  notation += FILES[to.x];
  notation += to.y + 1; // y=0 is rank 1
  return notation;
};

// ---- Stun / Curse helpers ----
function applyStunAround(
  b: Board,
  pos: { x: number; y: number },
  currentTurn: Color
) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = pos.x + dx,
        ny = pos.y + dy;
      if (!inb(nx, ny)) continue;
      const adj = b[ny]?.[nx]; // Safe navigation
      if (adj) {
        const cur = adj.stunnedForTurns ?? 0;
        // Unified stun rule: A stunned piece is stunned from the moment it triggers
        // until the START of their next-next turn. This is always 2 turns.
        const turns = 2;
        adj.stunnedForTurns = Math.max(cur, turns);
      }
    }
  }
}
/** Call this EXACTLY when a piece is removed from the board. */
function onPieceDeath(
  b: Board,
  piece: Piece | null,
  pos: { x: number; y: number },
  turn: Color
) {
  if (!piece) return;
  if (piece.equip === "curse") {
    applyStunAround(b, pos, turn);
  }
}

// Helper function to track King defeats for ransom
function trackKingDefeat(
  defeatedKing: Piece,
  defeatType: KingDefeatType,
  setKilledEnemies: React.Dispatch<React.SetStateAction<KilledPiece[]>>
) {
  // Only track if it's the enemy (black) king
  if (defeatedKing.color === B) {
    setKilledEnemies((prev) => [...prev, { piece: defeatedKing, defeatType }]);
  }
}

// Helper function to check and unlock items, and track killed enemies for ransom
function checkUnlockItem(
  killedPiece: Piece | null,
  killerColor: Color,
  setUnlocked: React.Dispatch<
    React.SetStateAction<Exclude<Equip, undefined>[]>
  >,
  setCampaign: React.Dispatch<React.SetStateAction<CampaignState>>,
  campaign: CampaignState,
  setKilledEnemies: React.Dispatch<React.SetStateAction<KilledPiece[]>>,
  setMarketPoints?: React.Dispatch<React.SetStateAction<number>>,
  setUnspentGold?: React.Dispatch<React.SetStateAction<number>>,
  defeatType?: KingDefeatType
) {
  // Track killed enemies for ransom
  if (killedPiece && killerColor === W && (killedPiece.color as string) === B) {
    setKilledEnemies((prev) => [...prev, { piece: killedPiece, defeatType }]);
  }

  // Only process if white (player) killed black (enemy)
  if (!killedPiece || killerColor !== W || (killedPiece.color as string) !== B)
    return;

  // Check if the killed piece has an item
  if (killedPiece.equip && killedPiece.equip !== undefined) {
    const item = killedPiece.equip;

    // Handle purse special case - gives gold but is not unlockable
    if (item === "purse") {
      sfx.cashOut();
      // Note: Purse gold is added during ransom calculation, not immediately
      return; // Don't unlock purse
    }

    // Ensure unlockedItems exists, default to empty array
    const unlockedItems = campaign.unlockedItems || [];

    // Check if this item is already unlocked
    if (unlockedItems.indexOf(item) === -1) {
      // Unlock this item
      setCampaign((prev) => ({
        ...prev,
        unlockedItems: [...(prev.unlockedItems || []), item],
      }));
      setUnlocked((prev) => [...prev, item]);
      sfx.unlock();
    }
  }
}
/** Decrement stun for the side that just finished its turn. */
function decrementStunFor(side: Color, b: Board, boardSize: number = S) {
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.color === side) {
        if (p.stunnedForTurns && p.stunnedForTurns > 0) {
          p.stunnedForTurns -= 1;
          // Clear exhausted flag when stun wears off
          if (p.stunnedForTurns === 0) {
            p.isExhausted = false;
          }
        }
        // Decrement shadow turns (for Bell of Names protection visual)
        if (p.shadowForTurns && p.shadowForTurns > 0) {
          p.shadowForTurns -= 1;
        }
      }
    }
  }
}

const isProtectedByBanner = (
  b: Board,
  pieceColor: PieceColor,
  pos: { x: number; y: number },
  boardSize: number = S
) => {
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.color === pieceColor && p.equip === "banner") {
        if (cheb(pos, { x, y }) <= 1 && !(pos.x === x && pos.y === y)) {
          return true;
        }
      }
    }
  }
  return false;
};

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

// --- Army Generation ---
function specPool(totalGold: number, allowedPieceTypes?: PieceType[]) {
  const o: Array<{ q: number; r: number; b: number; n: number; p: number }> =
    [];

  // Default to all piece types if none specified
  const allowed = allowedPieceTypes && allowedPieceTypes.length > 0 
    ? new Set(allowedPieceTypes)
    : new Set<PieceType>(["Q", "R", "B", "N", "P"]);

  // Piece gold values (matching VAL constant)
  const Q_COST = 80;
  const R_COST = 50;
  const B_COST = 30;
  const N_COST = 35;
  const P_COST = 10;

  // Determine max counts for each piece type (only if allowed)
  const maxQ = allowed.has("Q") ? 1 : 0;
  const maxR = allowed.has("R") ? 3 : 0;
  const maxB = allowed.has("B") ? 3 : 0;
  const maxN = allowed.has("N") ? 3 : 0;

  for (let q = 0; q <= maxQ; q++) {
    for (let r = 0; r <= maxR; r++) {
      for (let b = 0; b <= maxB; b++) {
        for (let n = 0; n <= maxN; n++) {
          const back = q + r + b + n;
          if (back > 6) continue; // Max 6 back rank pieces (excluding King)

          const goldSpent = q * Q_COST + r * R_COST + b * B_COST + n * N_COST;
          const remainingGold = totalGold - goldSpent;

          // Calculate how many pawns we can afford (only if pawns are allowed)
          const maxPawns = allowed.has("P") ? Math.floor(remainingGold / P_COST) : 0;
          const p = maxPawns;

          // No minimum pawn requirement - generate all valid combinations
          if (remainingGold >= 0) {
            // Generate specs even with 0 pawns if we have back rank pieces or if pawns aren't allowed
            if (back > 0 || (allowed.has("P") && p >= 0)) {
              o.push({ q, r, b, n, p });
            }
          }
        }
      }
    }
  }

  return o;
}

function build(
  color: Color,
  r: () => number,
  initialGold: number = 200,
  isPlayer: boolean = false,
  availableItems?: Exclude<Equip, undefined>[], // Optional override for available items
  boardSize: number = S,
  namedPieces?: NamedPiece[], // Optional named pieces with equipment
  kingName?: string, // Optional custom king name
  board?: Board, // Optional board to check available slots
  backRankRow?: number, // Which row is the back rank
  frontRankRow?: number, // Which row is the front rank
  skipKing?: boolean, // Optional flag to skip creating the King (for king_escaped only mode)
  guaranteedItems?: Exclude<Equip, undefined>[], // Items that MUST be equipped (from story events)
  allowedPieceTypes?: PieceType[], // Optional: which piece types can be randomly generated
  guaranteedPieces?: Array<{ type: PieceType; equip?: Equip }>, // Optional: guaranteed pieces that must spawn (don't consume gold)
  equipmentGold?: number, // Optional: gold specifically for equipment randomization (if not set, uses a default allocation)
  obstacles?: Obstacle, // Optional: obstacles grid to check which slots are blocked
  pawnBudget?: number // Optional: percentage (0.0-1.0) of gold to allocate for pawns before generating other pieces
) {
  const EQ: Exclude<Equip, undefined>[] = availableItems ?? [
    "sword",
    "shield",
    "lance",
    "torch",
    "bow",
    "staff",
    "crystal_ball",
    "disguise",
    "scythe",
    "banner",
    "curse",
    "skull",
  ];
  const EQ_FOR_PAWNS = EQ.filter((item) => item !== "disguise");
  const EQ_FOR_BACK_RANK = EQ.filter((item) => item !== "disguise"); // Kings cannot be disguised

  const id = (t: string) =>
    `${color}${t}-${Math.random().toString(36).slice(2, 8)}`;

  // Step 1: Count available slots if board is provided
  // We need to count slots that are empty on the board AND don't have obstacles
  let availableBackSlots = boardSize;
  let availableFrontSlots = boardSize;

  if (board && backRankRow !== undefined && frontRankRow !== undefined) {
    // Count actual empty slots (no pieces AND no obstacles)
    availableBackSlots = 0;
    availableFrontSlots = 0;
    for (let x = 0; x < boardSize; x++) {
      const backHasObstacle = obstacles && obstacles[backRankRow]?.[x] && obstacles[backRankRow][x] !== "none";
      const frontHasObstacle = obstacles && obstacles[frontRankRow]?.[x] && obstacles[frontRankRow][x] !== "none";
      
      if (board[backRankRow]?.[x] === null && !backHasObstacle) availableBackSlots++;
      if (board[frontRankRow]?.[x] === null && !frontHasObstacle) availableFrontSlots++;
    }
  }

  // Step 2: Create named pieces first (they don't consume gold budget and have priority placement)
  const namedBackRankPieces: Piece[] = [];
  const namedFrontRankPieces: Piece[] = [];
  let kingFromNamedPieces: Piece | null = null;

  if (namedPieces && namedPieces.length > 0) {
    for (const namedPiece of namedPieces) {
      // If this is a King and we're not skipping King creation, handle it specially
      if (namedPiece.type === "K" && !skipKing) {
        kingFromNamedPieces = {
          id: id(namedPiece.type),
          type: namedPiece.type,
          color,
          name: namedPiece.name,
          equip: namedPiece.equip,
          isPreconfigured: true, // Mark as preconfigured for gold background
          speechLines: namedPiece.speechLines, // Store custom speech lines
        };
      } else {
        const piece: Piece = {
          id: id(namedPiece.type),
          type: namedPiece.type,
          color,
          name: namedPiece.name,
          equip: namedPiece.equip,
          isPreconfigured: true, // Mark as preconfigured for gold background
          speechLines: namedPiece.speechLines, // Store custom speech lines
        };

        if (namedPiece.type === "P") {
          namedFrontRankPieces.push(piece);
        } else {
          namedBackRankPieces.push(piece);
        }
      }
    }
  }

  // Step 3: Create King FIRST (with optional name), unless skipKing is true
  const back: Piece[] = [];
  let kingCreated = false;
  
  if (!skipKing) {
    // If King was defined in namedPieces, use that; otherwise create a basic King
    if (kingFromNamedPieces) {
      back.push(kingFromNamedPieces);
    } else {
      const king: Piece = { id: `${color}-K`, type: "K", color };
      if (kingName) {
        king.name = kingName;
        king.isPreconfigured = true; // Mark king as preconfigured if named
      }
      back.push(king);
    }
    kingCreated = true;
  }

  // Add named back rank pieces IMMEDIATELY after King (guaranteed placement)
  back.push(...namedBackRankPieces);

  // Step 3.5: Add guaranteed pieces (don't consume gold budget)
  const guaranteedBackRankPieces: Piece[] = [];
  const guaranteedFrontRankPieces: Piece[] = [];
  let overflowPawnsCount = 0; // Track how many pawns will overflow to back rank
  
  if (guaranteedPieces && guaranteedPieces.length > 0) {
    for (const gp of guaranteedPieces) {
      const piece: Piece = {
        id: id(gp.type),
        type: gp.type,
        color,
        equip: gp.equip,
      };
      if (gp.type === "P") {
        guaranteedFrontRankPieces.push(piece);
      } else {
        guaranteedBackRankPieces.push(piece);
      }
    }
    
    // Calculate how many guaranteed pawns will overflow to back rank
    // This happens when guaranteed pawns + named pawns exceed available front slots
    const totalFrontRankPieces = namedFrontRankPieces.length + guaranteedFrontRankPieces.length;
    if (totalFrontRankPieces > availableFrontSlots) {
      overflowPawnsCount = totalFrontRankPieces - availableFrontSlots;
    }
  }
  
  // Add guaranteed back rank pieces
  back.push(...guaranteedBackRankPieces);

  // Step 4: Calculate how many slots remain for random pieces (accounting for actual board space)
  // Account for overflow pawns that will be placed in back rank
  const remainingBackSlots =
    availableBackSlots - (kingCreated ? 1 : 0) - namedBackRankPieces.length - guaranteedBackRankPieces.length - overflowPawnsCount;

  // Step 5: Generate army spec based on remaining slots and gold
  const allowed = allowedPieceTypes && allowedPieceTypes.length > 0 
    ? new Set(allowedPieceTypes)
    : new Set<PieceType>(["Q", "R", "B", "N", "P"]);
  
  let s: { q: number; r: number; b: number; n: number; p: number };
  
  // If pawnBudget is specified, allocate gold for pawns first, then generate back-rank pieces
  if (pawnBudget !== undefined && pawnBudget > 0 && allowed.has("P")) {
    const P_COST = 10;
    const pawnGold = Math.floor(initialGold * pawnBudget);
    const backRankGold = initialGold - pawnGold;
    
    // Calculate how many pawns we can afford with the pawn budget
    const pawnCount = Math.floor(pawnGold / P_COST);
    
    // Generate back-rank pieces with remaining gold (exclude pawns from allowed types)
    const backRankAllowed = Array.from(allowed).filter(t => t !== "P") as PieceType[];
    const BACK_SPECS = specPool(backRankGold, backRankAllowed);
    const backSpec = BACK_SPECS.length > 0 ? rand(r, BACK_SPECS) : { q: 0, r: 0, b: 0, n: 0, p: 0 };
    
    s = {
      q: backSpec.q,
      r: backSpec.r,
      b: backSpec.b,
      n: backSpec.n,
      p: pawnCount
    };
  } else {
    // Original behavior: generate all pieces together
    const SPECS = specPool(initialGold, allowedPieceTypes);
    // Fallback to minimal army spec if specPool returns empty (when gold is too low)
    const defaultSpec = { q: 0, r: 0, b: 0, n: 0, p: 0 };
    s = SPECS.length > 0 ? rand(r, SPECS) : defaultSpec;
  }

  // Add randomly generated pieces (only up to remaining back rank slots and only if allowed)
  let addedPieces = 0;
  if (s && s.q && allowed.has("Q") && addedPieces < remainingBackSlots) {
    back.push({ id: id("Q"), type: "Q", color });
    addedPieces++;
  }
  if (s) {
    for (let i = 0; i < s.r && allowed.has("R") && addedPieces < remainingBackSlots; i++) {
      back.push({ id: id("R"), type: "R", color });
      addedPieces++;
    }
    for (let i = 0; i < s.b && allowed.has("B") && addedPieces < remainingBackSlots; i++) {
      back.push({ id: id("B"), type: "B", color });
      addedPieces++;
    }
    for (let i = 0; i < s.n && allowed.has("N") && addedPieces < remainingBackSlots; i++) {
      back.push({ id: id("N"), type: "N", color });
      addedPieces++;
    }
  }

  // Place back rank pieces on the board (including overflow pawns from guaranteed pieces)
  const br = Array(boardSize).fill(null) as (Piece | null)[];
  
  // Add overflow pawns to back rank before placing
  if (overflowPawnsCount > 0) {
    const overflowPawns = guaranteedFrontRankPieces.splice(-overflowPawnsCount);
    back.push(...overflowPawns);
  }
  
  const idx = Array.from({ length: boardSize }, (_, i) => i).sort(
    () => r() - 0.5
  );
  back.forEach((p, i) => {
    br[idx[i]] = p;
  });

  // Step 6: Create front rank with named pawns FIRST (priority), then generated pawns
  const fr = Array(boardSize).fill(null) as (Piece | null)[];
  const slots = Array.from({ length: boardSize }, (_, i) => i).sort(
    () => r() - 0.5
  );

  // Calculate equipment budget - use equipmentGold if provided, otherwise use a default allocation
  const equipmentBudget = equipmentGold ?? (isPlayer ? 20 : 40); // Default: 20 for player, 40 for enemy
  let remainingEquipmentGold = equipmentBudget;
  
  // Guaranteed items (from story events) don't consume the randomization budget
  // They are always equipped regardless of the equipment gold setting
  
  // Get available items for randomization (use passed parameter or default)
  const EQ_AVAILABLE = availableItems && availableItems.length > 0 ? availableItems : EQ;
  const EQ_FOR_PAWNS_AVAILABLE = EQ_AVAILABLE.filter(item => EQ_FOR_PAWNS.includes(item as any));
  const EQ_FOR_BACK_RANK_AVAILABLE = EQ_AVAILABLE.filter(item => EQ_FOR_BACK_RANK.includes(item as any));
  
  // Get average item cost from available items for budget calculations
  const availableItemCosts = EQ_AVAILABLE.map(item => ITEM_COSTS[item as keyof typeof ITEM_COSTS] || 10);
  const averageItemCost = availableItemCosts.length > 0 
    ? availableItemCosts.reduce((a, b) => a + b, 0) / availableItemCosts.length
    : 10;
  
  // Calculate how many pieces can be equipped based on remaining budget
  const maxPawnItemsToEquip = Math.floor(remainingEquipmentGold / averageItemCost);
  const maxBackItemsToEquip = Math.floor(remainingEquipmentGold / averageItemCost);
  
  // Place named pawns FIRST (guaranteed placement)
  for (let i = 0; i < namedFrontRankPieces.length; i++) {
    if (i < boardSize) {
      fr[slots[i]] = namedFrontRankPieces[i];
    }
  }
  
  // Place guaranteed pawns AFTER named pawns
  // Note: overflow pawns have already been moved to back rank
  for (let i = 0; i < guaranteedFrontRankPieces.length; i++) {
    const slotIndex = namedFrontRankPieces.length + i;
    if (slotIndex < availableFrontSlots && slots[slotIndex] !== undefined) {
      fr[slots[slotIndex]] = guaranteedFrontRankPieces[i];
    }
  }

  // Calculate how many slots remain for random pawns (accounting for actual board space)
  // Only generate pawns if they are in the allowed piece types
  const remainingPawnSlots =
    Math.min(availableFrontSlots, boardSize) - namedFrontRankPieces.length - guaranteedFrontRankPieces.length;
  const actualPawnsToGenerate = allowed.has("P") 
    ? Math.min(s?.p || 0, remainingPawnSlots)
    : 0;

  // Generate random pawns (only up to remaining slots and only if allowed)
  if (actualPawnsToGenerate > 0) {
    for (let i = 0; i < actualPawnsToGenerate; i++) {
      const slotIndex = namedFrontRankPieces.length + guaranteedFrontRankPieces.length + i;
      const k = slots[slotIndex];
      fr[k] = { id: id("P"), type: "P", color };
    }
  }
  
  // Step 5a: Equip random items to ALL unequipped pawns (both guaranteed and random, in front AND back ranks)
  // This ensures guaranteed pawns can also get random equipment, even if they overflow to back rank
  const allUnequippedPawns: Piece[] = [];
  fr.forEach((p) => {
    if (p && p.type === "P" && !p.equip) {
      allUnequippedPawns.push(p);
    }
  });
  // Also check back rank for pawns (can happen when front rank is full)
  br.forEach((p) => {
    if (p && p.type === "P" && !p.equip) {
      allUnequippedPawns.push(p);
    }
  });
  
  if (allUnequippedPawns.length > 0 && remainingEquipmentGold > 0 && EQ_FOR_PAWNS_AVAILABLE.length > 0) {
    // Calculate how many pawns to equip based on budget
    const pawnsToEquipCount = Math.min(maxPawnItemsToEquip, allUnequippedPawns.length);
    
    // Randomly select which pawns to equip
    const pawnIndicesToEquip = Array.from({ length: allUnequippedPawns.length }, (_, i) => i)
      .sort(() => r() - 0.5)
      .slice(0, pawnsToEquipCount);
    
    for (const idx of pawnIndicesToEquip) {
      if (remainingEquipmentGold <= 0) break;
      
      const randomItem = EQ_FOR_PAWNS_AVAILABLE[Math.floor(r() * EQ_FOR_PAWNS_AVAILABLE.length)] as Equip;
      const itemCost = ITEM_COSTS[randomItem as keyof typeof ITEM_COSTS] || 10;
      
      if (remainingEquipmentGold >= itemCost) {
        allUnequippedPawns[idx].equip = randomItem;
        remainingEquipmentGold -= itemCost;
      }
    }
  }

  // Step 5b: Equip random back rank pieces (but don't override named piece equipment)
  const nonKingBackRank = br.filter((x) => x && x.type !== "K") as Piece[];
  const unequippedBackRank = nonKingBackRank.filter((p) => !p.equip);
  
  // Select which back rank pieces to equip based on remaining equipment budget
  const backItemsToEquipCount = Math.min(
    Math.floor(remainingEquipmentGold / averageItemCost),
    unequippedBackRank.length
  );
  const piecesToEquip = unequippedBackRank
    .sort(() => r() - 0.5)
    .slice(0, backItemsToEquipCount);

  piecesToEquip.forEach((p) => {
    // Select item from available items that fits the budget
    if (remainingEquipmentGold <= 0 || EQ_FOR_BACK_RANK_AVAILABLE.length === 0) return;
    
    // Ensure King doesn't get disguise
    let equip: Equip;
    let itemCost = 0;
    let attempts = 0;
    do {
      equip = EQ_FOR_BACK_RANK_AVAILABLE[
        Math.floor(r() * EQ_FOR_BACK_RANK_AVAILABLE.length)
      ] as Equip;
      itemCost = ITEM_COSTS[equip as keyof typeof ITEM_COSTS] || 10;
      attempts++;
    } while ((p.type === "K" && equip === "disguise") || (remainingEquipmentGold < itemCost && attempts < 10));
    
    // Only equip if we have budget for it
    if (remainingEquipmentGold >= itemCost && equip) {
      if (equip === "disguise" && p.type !== "P") {
        p.originalType = p.type;
        p.type = "P";
      }
      p.equip = equip;
      remainingEquipmentGold -= itemCost;
    }
  });

  // Step 6: Equip guaranteed items (from story events) to unequipped pieces
  // Note: These items have already been accounted for in the equipment budget
  if (guaranteedItems && guaranteedItems.length > 0) {
    // Collect all unequipped pieces (front and back rank)
    const allPieces: Piece[] = [];
    br.forEach(p => { if (p && !p.equip) allPieces.push(p); });
    fr.forEach(p => { if (p && !p.equip) allPieces.push(p); });
    
    // Shuffle and assign guaranteed items
    allPieces.sort(() => r() - 0.5);
    
    for (let i = 0; i < Math.min(guaranteedItems.length, allPieces.length); i++) {
      const item = guaranteedItems[i];
      allPieces[i].equip = item;
      
      // Handle disguise special case
      if (item === "disguise" && allPieces[i].type !== "P") {
        allPieces[i].originalType = allPieces[i].type;
        allPieces[i].type = "P";
      }
    }
  }

  return { back: br, front: fr };
}

// --- Terrain Generation ---
const emptyT = (): Terrain =>
  Array.from({ length: S }, () => Array(S).fill("none")) as Terrain;

const emptyTerrain = (size: number): Terrain =>
  Array.from({ length: size }, () => Array(size).fill("none")) as Terrain;

const emptyObstacles = (size: number): Obstacle =>
  Array.from({ length: size }, () => Array(size).fill("none")) as Obstacle;

// Parse terrain notation like "W(Rock)" into terrain and obstacle parts
function parseTerrainCell(cell: string): { terrain: string; obstacle: ObstacleType } {
  const match = cell.match(/^([FW_n]+)\((.*)\)$/);
  if (match) {
    return { terrain: match[1], obstacle: match[2].toLowerCase() as ObstacleType };
  }
  return { terrain: cell, obstacle: "none" };
}

// Updated placeFeatures function for clustered water and configurable terrain with obstacles
function placeFeatures(
  B: Board,
  T: Terrain,
  O: Obstacle, // Obstacles grid
  r: () => number,
  boardSize: number,
  terrainMatrix?: TerrainConfigCell[][],
  skipTerrainRow?: number, // Row index where water/forest should not be placed (for escape row)
  randomTerrainPool?: { rock?: number; forest?: number; water?: number } // Configuration for random terrain placement
) {
  const occupied = new Set<string>(); // Keep track of obstacles, forests, and water tiles
  const waterCoords: { x: number; y: number }[] = []; // Store coordinates of placed water tiles

  // Helper to place terrain, obstacles, and update occupied set
  const placeFeature = (
    terrainType: TerrainCell, 
    obstacleType: ObstacleType, 
    x: number, 
    y: number
  ) => {
    // Skip water and forest on the escape row (but allow obstacles)
    if ((terrainType === "water" || terrainType === "forest") && skipTerrainRow !== undefined && y === skipTerrainRow) {
      return; // Don't place water/forest on escape row
    }
    
    // Place terrain
    T[y][x] = terrainType;
    if (terrainType === "water") {
      waterCoords.push({ x, y });
    }
    
    // Place obstacle
    O[y][x] = obstacleType;
    
    // Mark as occupied if there's an obstacle
    if (obstacleType !== "none") {
      occupied.add(`${x},${y}`);
    }
  };

  // Helper to get valid empty neighbor coordinates
  const getValidNeighbors = (
    x: number,
    y: number
  ): { x: number; y: number }[] => {
    const neighbors: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue; // Skip self
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny, boardSize) && !occupied.has(`${nx},${ny}`)) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
    return neighbors;
  };

  // --- Placement Logic ---

  // If a terrain matrix is provided, use it for initial placement
  const randomCells: { x: number; y: number }[] = [];

  if (terrainMatrix && terrainMatrix.length === boardSize) {
    // Process matrix: terrainMatrix[0] = board row 0 (white's back rank, bottom visual)
    // Board rendering flips y-axis: board[0] displays at bottom, board[boardSize-1] at top
    // So: white starts at board[0,1] (bottom), black starts at board[boardSize-1, boardSize-2] (top)
    for (let y = 0; y < boardSize; y++) {
      const row = terrainMatrix[y];
      if (row && row.length === boardSize) {
        for (let x = 0; x < boardSize; x++) {
          const cell = row[x];
          const { terrain, obstacle } = parseTerrainCell(cell);
          
          // Handle terrain placement
          if (terrain === "F" && !(skipTerrainRow !== undefined && y === skipTerrainRow)) {
            placeFeature("forest", obstacle, x, y);
          } else if (terrain === "W" && !(skipTerrainRow !== undefined && y === skipTerrainRow)) {
            placeFeature("water", obstacle, x, y);
          } else if (terrain === "_") {
            // Explicitly empty terrain
            placeFeature("none", obstacle, x, y);
          } else if (terrain === "n") {
            // Random cell - save for random generation
            randomCells.push({ x, y });
            // If there's an obstacle specified with random terrain, place it now
            if (obstacle !== "none") {
              O[y][x] = obstacle;
              occupied.add(`${x},${y}`);
            }
          } else {
            // Default to none if unrecognized
            placeFeature("none", obstacle, x, y);
          }
        }
      }
    }

    // Now apply random generation to cells marked as "n"
    if (randomCells.length > 0) {
      // Use custom terrain pool if provided, otherwise use defaults
      const rockCount = randomTerrainPool?.rock ?? 1;
      const forestCount = randomTerrainPool?.forest ?? 2;
      const waterCount = randomTerrainPool?.water ?? 3;

      // Track available cells for placement (initially all random cells)
      const availableCells = new Set<string>();
      randomCells.forEach(cell => {
        if (!occupied.has(`${cell.x},${cell.y}`)) {
          availableCells.add(`${cell.x},${cell.y}`);
        }
      });

      // Helper to get a random available cell from the set
      const getRandomAvailableCell = (): { x: number; y: number } | null => {
        const cells = Array.from(availableCells).map(key => {
          const [x, y] = key.split(',').map(Number);
          return { x, y };
        });
        if (cells.length === 0) return null;
        return cells[Math.floor(r() * cells.length)];
      };

      // Helper to remove a cell from available cells
      const removeAvailableCell = (x: number, y: number) => {
        availableCells.delete(`${x},${y}`);
      };

      // Place rock obstacles
      for (let i = 0; i < rockCount && availableCells.size > 0; i++) {
        const cell = getRandomAvailableCell();
        if (cell && !occupied.has(`${cell.x},${cell.y}`)) {
          placeFeature("none", "rock", cell.x, cell.y);
          removeAvailableCell(cell.x, cell.y);
        }
      }

      // Place forests
      for (let i = 0; i < forestCount && availableCells.size > 0; i++) {
        const cell = getRandomAvailableCell();
        if (cell && !occupied.has(`${cell.x},${cell.y}`)) {
          placeFeature("forest", "none", cell.x, cell.y);
          removeAvailableCell(cell.x, cell.y);
        }
      }

      // Place water tiles with clustering behavior
      const CLUSTER_CHANCE = 0.75;
      for (let i = 0; i < waterCount && availableCells.size > 0; i++) {
        let waterPlaced = false;

        // Attempt clustered placement first (if not the first water tile and chance allows)
        if (waterCoords.length > 0 && r() < CLUSTER_CHANCE) {
          // Get all neighbors of existing water tiles that are still available in random cells
          const allNeighbors: { x: number; y: number }[] = [];
          waterCoords.forEach((coord) => {
            const neighbors = getValidNeighbors(coord.x, coord.y);
            neighbors.forEach(neighbor => {
              const key = `${neighbor.x},${neighbor.y}`;
              // Check if this neighbor is available (in random cells pool) and doesn't have terrain yet
              if (availableCells.has(key) && !occupied.has(key) && T[neighbor.y]?.[neighbor.x] === "none") {
                allNeighbors.push(neighbor);
              }
            });
          });

          // Remove duplicates
          const uniqueNeighbors = Array.from(
            new Map(allNeighbors.map(n => [`${n.x},${n.y}`, n])).values()
          );

          if (uniqueNeighbors.length > 0) {
            const neighbor = uniqueNeighbors[Math.floor(r() * uniqueNeighbors.length)];
            placeFeature("water", "none", neighbor.x, neighbor.y);
            removeAvailableCell(neighbor.x, neighbor.y);
            waterPlaced = true;
          }
        }

        // If clustered placement failed or wasn't attempted, place randomly
        if (!waterPlaced) {
          const cell = getRandomAvailableCell();
          if (cell && !occupied.has(`${cell.x},${cell.y}`)) {
            placeFeature("water", "none", cell.x, cell.y);
            removeAvailableCell(cell.x, cell.y);
            waterPlaced = true;
          }
        }

        if (!waterPlaced && availableCells.size > 0) {
          console.warn("Could not place water tile despite available cells.");
        }
      }
    }

    // Exit early if terrain matrix was used
    return;
  }

  // --- Default Random Generation (if no terrain matrix provided) ---

  // Place 1 rock obstacle randomly
  let rockPlaced = false;
  let rockTries = 0;
  while (!rockPlaced && rockTries < 50) {
    const rx = Math.floor(r() * boardSize);
    const ry = Math.floor(r() * boardSize);
    if (!occupied.has(`${rx},${ry}`)) {
      placeFeature("none", "rock", rx, ry);
      rockPlaced = true;
    }
    rockTries++;
  }

  // Place 4 forests randomly
  for (let i = 0; i < 4; i++) {
    let forestPlaced = false;
    let forestTries = 0;
    while (!forestPlaced && forestTries < 50) {
      const fx = Math.floor(r() * boardSize);
      const fy = Math.floor(r() * boardSize);
      if (!occupied.has(`${fx},${fy}`)) {
        placeFeature("forest", "none", fx, fy);
        forestPlaced = true;
      }
      forestTries++;
    }
  }

  // Place 6 water tiles with clustering
  const CLUSTER_CHANCE = 0.75;
  for (let i = 0; i < 6; i++) {
    let waterPlaced = false;
    let placementTries = 0;

    // Attempt clustered placement first (if not the first water tile and chance allows)
    if (waterCoords.length > 0 && r() < CLUSTER_CHANCE) {
      const allNeighbors: { x: number; y: number }[] = [];
      waterCoords.forEach((coord) => {
        allNeighbors.push(...getValidNeighbors(coord.x, coord.y));
      });

      if (allNeighbors.length > 0) {
        const neighbor = rand(r, allNeighbors);
        placeFeature("water", "none", neighbor.x, neighbor.y);
        waterPlaced = true;
      }
    }

    // If clustered placement failed or wasn't attempted, place randomly
    while (!waterPlaced && placementTries < 50) {
      const wx = Math.floor(r() * boardSize);
      const wy = Math.floor(r() * boardSize);
      if (inBounds(wx, wy, boardSize) && !occupied.has(`${wx},${wy}`)) {
        // Ensure in bounds before placing
        placeFeature("water", "none", wx, wy);
        waterPlaced = true;
      }
      placementTries++;
    }

    if (!waterPlaced) {
      console.warn("Could not place water tile after 50 attempts.");
    }
  }
}

// --- Move Logic ---
function moves(
  b: Board,
  T: Terrain,
  O: Obstacle,
  x: number,
  y: number,
  boardSize: number = S
) {
  const p = b[y]?.[x]; // Safe navigation
  if (!p || (p.stunnedForTurns && p.stunnedForTurns > 0)) return [];
  const col = p.color;
  const dir = col === W ? 1 : -1;
  const out: { x: number; y: number }[] = [];
  const slide = (dx: number, dy: number) => {
    let nx = x + dx,
      ny = y + dy;
  while (inBounds(nx, ny, boardSize)) {
      const t = b[ny]?.[nx]; // Safe navigation
      const obstacle = O[ny]?.[nx]; // Check for obstacles
      if (obstacle !== "none") {
        // Obstacle blocks movement and can be attacked
        out.push({ x: nx, y: ny });
        break;
      }
      if (t) {
        if (t.color !== col) out.push({ x: nx, y: ny });
        break;
      } else out.push({ x: nx, y: ny });
      nx += dx;
      ny += dy;
    }
  };
  switch (p.type) {
    case "K":
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (dx || dy) {
            const nx = x + dx,
              ny = y + dy;
            if (!inBounds(nx, ny, boardSize)) continue;
            const t = b[ny]?.[nx]; // Safe navigation
            const obstacle = O[ny]?.[nx]; // Check for obstacles
            // Can move to empty squares or attack enemies/obstacles
            if (obstacle !== "none" || !t || t.color !== col) out.push({ x: nx, y: ny });
          }
      break;
    case "Q":
      slide(1, 0);
      slide(-1, 0);
      slide(0, 1);
      slide(0, -1);
      slide(1, 1);
      slide(-1, -1);
      slide(1, -1);
      slide(-1, 1);
      break;
    case "R":
      slide(1, 0);
      slide(-1, 0);
      slide(0, 1);
      slide(0, -1);
      break;
    case "B":
      slide(1, 1);
      slide(-1, -1);
      slide(1, -1);
      slide(-1, 1);
      break;
    case "N":
      [
        [1, 2],
        [2, 1],
        [-1, 2],
        [-2, 1],
        [1, -2],
        [2, -1],
        [-1, -2],
        [-2, -1],
      ].forEach(([dx, dy]) => {
        const nx = x + dx,
          ny = y + dy;
        if (!inBounds(nx, ny, boardSize)) return;
        const t = b[ny]?.[nx]; // Safe navigation
        const obstacle = O[ny]?.[nx]; // Check for obstacles
        // Can move to empty squares or attack enemies/obstacles
        if (obstacle !== "none" || !t || t.color !== col) out.push({ x: nx, y: ny });
      });
      break;
    case "P":
      {
        const ny = y + dir;
        const obstacle = O[ny]?.[x]; // Check for obstacle in front
        // Pawns can only move forward if no piece AND no obstacle
        if (inBounds(x, ny, boardSize) && !b[ny]?.[x] && obstacle === "none") out.push({ x, y: ny });
        for (const dx of [-1, 1]) {
          const cx = x + dx,
            cy = y + dir;
          if (!inBounds(cx, cy, boardSize)) continue;
          const t = b[cy]?.[cx]; // Safe navigation
          const diagObstacle = O[cy]?.[cx]; // Check for diagonal obstacle
          // Pawns can attack diagonally to capture pieces OR obstacles
          if ((t && t.color !== col) || (diagObstacle !== "none")) out.push({ x: cx, y: cy });
        }
      }
      break;
  }
  // Lance: one-time 2-square forward attack, cannot jump.
  if (p.equip === "lance") {
    const midY = y + dir;
    const targetY = y + 2 * dir;
    const midObstacle = O[midY]?.[x]; // Check for obstacle in path
    // Check if path is clear (no pieces AND no obstacles)
    if (inBounds(x, midY, boardSize) && !b[midY]?.[x] && midObstacle === "none") {
      // Safe navigation
      // Check if target is in bounds
      if (inBounds(x, targetY, boardSize)) {
        const targetPiece = b[targetY]?.[x]; // Safe navigation
        const targetObstacle = O[targetY]?.[x]; // Check for obstacle at target
        // Can attack enemy pieces OR obstacles
        if ((targetPiece && targetPiece.color !== col) || (targetObstacle !== "none")) {
          out.push({ x, y: targetY });
        }
      }
    }
  }
  // Crystal Ball: swap with adjacent ally
  if (p.equip === "crystal_ball") {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny, boardSize)) {
          const targetPiece = b[ny]?.[nx]; // Safe navigation
          if (
            targetPiece &&
            targetPiece.color === p.color
          ) {
            out.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  return out;
}

// --- Threat helpers ---
const attacks = (
  b: Board,
  T: Terrain,
  O: Obstacle,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  boardSize: number = S
) => {
  const p = b[sy]?.[sx]; // Safe navigation
  if (!p || (p.stunnedForTurns && p.stunnedForTurns > 0)) return false;
  return moves(b, T, O, sx, sy, boardSize).some((s) => s.x === tx && s.y === ty);
};

function supportCount(
  b: Board,
  T: Terrain,
  O: Obstacle,
  a: Piece | null, // <- widen type
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S
) {
  if (!a) return 0; // <- guard
  let c = 0;
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      if (x === from.x && y === from.y) continue;
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== a.color) continue;
      if (attacks(b, T, O, x, y, to.x, to.y, boardSize)) c++;
    }
  return c;
}

const findK = (b: Board, c: Color, boardSize: number = S) => {
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.type === "K" && p.color === c) return { p, x, y };
    }
  return null;
};
const findPieceById = (b: Board, id: string, boardSize: number = S) => {
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.id === id) return { p, x, y };
    }
  return null;
};
const threatened = (
  b: Board,
  T: Terrain,
  O: Obstacle,
  sq: { x: number; y: number },
  by: Color,
  boardSize: number = S
) => {
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== by) continue;
      if (attacks(b, T, O, x, y, sq.x, sq.y, boardSize)) return true;
    }
  return false;
};

// --- Fog (Torch extends sight) ---
const visibility = (b: Board, phase: Phase, boardSize: number = S, fogRows: number = 2) => {
  const v: boolean[][] = Array.from({ length: boardSize }, () =>
    Array(boardSize).fill(true)
  );
  if (phase === "market") {
    for (let y = 2; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (v[y]) v[y][x] = false; // Safe check
      }
    }
    return v;
  }
  // Hide the last N rows (enemy back ranks) based on fogRows parameter
  for (let y = boardSize - fogRows; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (v[y]) v[y][x] = false; // Safe check - hide fogged rows
    }
  }

  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== W) continue;
      const R = p.equip === "torch" ? 3 : RAD;
      for (let yy = 0; yy < boardSize; yy++)
        for (let xx = 0; xx < boardSize; xx++)
          if (v[yy] && cheb({ x, y }, { x: xx, y: yy }) <= R) v[yy][xx] = true; // Safe check
      if (v[y]) v[y][x] = true; // Safe check
    }
  return v;
};

// --- Dice + mods ---
const d6 = (r: () => number) => 1 + Math.floor(r() * 6);
type Mod = { value: number; kind?: "sword" | "shield" | "support" | "terrain" };
const sumMods = (mods: Mod[]) =>
  mods.reduce(
    (acc, { value, kind }) => {
      // Ensure kind defaults to something if undefined, though terrain/water needs specific handling
      const k = (kind || "shield") as
        | "sword"
        | "shield"
        | "support"
        | "terrain";
      acc[k] = (acc[k] || 0) + value;
      return acc;
    },
    // Initialize all possible kinds including 'water' although we won't sum water directly here
    { sword: 0, shield: 0, support: 0, terrain: 0 } as Record<
      "sword" | "shield" | "support" | "terrain",
      number
    >
  );

// Updated resolve function for water terrain and Scythe defense
function resolve(
  r: () => number,
  a: Piece, // Attacker
  d: Piece, // Defender
  b: Board,
  T: Terrain,
  O: Obstacle,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S,
  adv: boolean // Advantage flag (usually for attacker King or special items)
) {
  const terrainAtTarget = T[to.y]?.[to.x]; // Safe navigation
  const isTorchAdvantage = a.equip === "torch" && terrainAtTarget === "forest";
  const isVeteranAttacker = (a.kills || 0) >= 5;
  const isVeteranDefender = (d.kills || 0) >= 5;
  const useAdv = a.type === "K" || adv || isTorchAdvantage || isVeteranAttacker;

  // --- Attacker Roll ---
  let rollsA = [d6(r)];
  if (useAdv) rollsA.push(d6(r));
  let A = useAdv ? Math.max(...rollsA) : rollsA[0];
  let aForced = false;

  // Scythe effect for ATTACKER
  if (a.equip === "scythe" && d.type === "P") {
    A = 6;
    rollsA = [6]; // Update rolls array for UI
    aForced = true;
  }

  // --- Defender Roll ---
  let rollsD = [d6(r)];
  // Veterans also roll with advantage when defending
  if (isVeteranDefender) {
    rollsD.push(d6(r));
  }
  let D = isVeteranDefender ? Math.max(...rollsD) : rollsD[0];
  let dForced = false;

  // Stun effect for DEFENDER (overrides veteran advantage)
  if (d.stunnedForTurns && d.stunnedForTurns > 0) {
    rollsD = [1];
    D = 1;
    dForced = true;
  }
  // Scythe effect for DEFENDER (overrides veteran advantage)
  else if (d.equip === "scythe" && a.type === "P") {
    D = 6;
    rollsD = [6]; // Update rolls array for UI
    dForced = true;
  }

  // --- Modifiers ---
  const am: Mod[] = [],
    dm: Mod[] = [];

  // Attacker mods
  if (a.equip === "sword") am.push({ value: 1, kind: "sword" });
  const sup = supportCount(b, T, O, a, from, to, boardSize);
  if (sup > 0) am.push({ value: sup, kind: "support" });

  // Defender mods
  const hasShield =
    d.equip === "shield" || isProtectedByBanner(b, d.color, to, boardSize);
  if (hasShield) dm.push({ value: 1, kind: "shield" });

  // Apply terrain modifiers for defense
  if (terrainAtTarget === "forest") {
    dm.push({ value: 1, kind: "terrain" });
  } else if (terrainAtTarget === "water") {
    dm.push({ value: -1, kind: "terrain" }); // Negative modifier for water
  }

  // --- Totals & Result ---
  const at = A + am.reduce((s, m) => s + m.value, 0);
  const dt = D + dm.reduce((s, m) => s + m.value, 0);
  return {
    a: { base: A, total: at, mods: am, rolls: rollsA, forced: aForced },
    d: { base: D, total: dt, mods: dm, rolls: rollsD, forced: dForced },
    win: at >= dt, // Attacker wins on tie or higher
    adv: useAdv || isVeteranAttacker, // Include veteran attacker advantage
    defAdv: isVeteranDefender, // Track defender advantage
  };
}

// Helper function to check if the Bell of Names exists on the board
function bellOfNamesExists(obstacles: Obstacle, boardSize: number): boolean {
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (obstacles[y]?.[x] === "bell") {
        return true;
      }
    }
  }
  return false;
}

function resolveObstacle(
  r: () => number,
  a: Piece,
  b: Board,
  T: Terrain,
  O: Obstacle,
  from: { x: number; y: number },
  to: { x: number; y: number },
  adv: boolean,
  boardSize: number = S
) {
  const obstacleType = O[to.y]?.[to.x];
  
  // Determine threshold based on obstacle type
  let threshold = 5; // Rock default
  if (obstacleType === "courtier") {
    threshold = 1; // Courtier is easier to destroy
  } else if (obstacleType === "gate") {
    threshold = 3; // Gate requires 3+ to break
  } else if (obstacleType === "bell") {
    threshold = 4; // Bell requires 4+ to break
  } else if (obstacleType === "column") {
    threshold = 6; // Column requires 6+ to break
  }
  
  const useAdv = a.type === "K" || adv;
  const rolls = [d6(r)];
  if (useAdv) rolls.push(d6(r));
  const A = useAdv ? Math.max(...rolls) : rolls[0];

  const am: Mod[] = [];
  if (a.equip === "sword") am.push({ value: 1, kind: "sword" });
  const sup = supportCount(b, T, O, a, from, to, boardSize);
  if (sup > 0) am.push({ value: sup, kind: "support" });
  const at = A + am.reduce((s, m) => s + m.value, 0);
  return {
    a: { base: A, total: at, mods: am, rolls },
    ok: at >= threshold,
    adv: useAdv,
  };
}

// --- Bot Logic ---
const val = (p: Piece) => (p.type === "K" ? 1000 : (VAL as any)[p.type] || 0);

// Calculate sell value (50% of piece + equipment value)
const getSellValue = (p: Piece): number => {
  const pieceValue = val(p);
  const equipmentValue = p.equip ? ITEM_COSTS[p.equip] || 0 : 0;
  return Math.floor((pieceValue + equipmentValue) * 0.5);
};
const tryMove = (
  b: Board,
  T: Terrain,
  from: { x: number; y: number },
  to: { x: number; y: number }
) => {
  // No longer need ROCK check since they're obstacles now, not pieces
  const nb = cloneB(b);
  const mv = nb[from.y]?.[from.x]; // Safe navigation
  if (!mv) return null;
  nb[to.y][to.x] = mv;
  nb[from.y][from.x] = null;
  return nb;
};
function bot(
  b: Board,
  T: Terrain,
  O: Obstacle,
  c: Color,
  r: () => number,
  boardSize: number = S,
  behavior: "aggressive" | "defensive" | "balanced" = "balanced"
) {
  const opp = c === W ? B : W;
  const ms: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    score: number;
  }[] = [];

  // Behavior modifiers
  const isAggressive = behavior === "aggressive";
  const isDefensive = behavior === "defensive";
  const isBalanced = behavior === "balanced";

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== c) continue;
      for (const t of moves(b, T, O, x, y, boardSize)) {
        const cap = b[t.y]?.[t.x]; // Safe navigation
        const targetObstacle = O[t.y]?.[t.x]; // Check for obstacle at target
        let sc = 0;
        if (cap) {
          // --- CAPTURE MOVE SCORING ---
          if (p.equip === "crystal_ball" && cap.color === p.color) {
            // Crystal Ball swap
            sc = 0.1; // Small positive score to encourage using item
          } else {
            const winProb =
              winPercent(b, T, O, p, cap, { x, y }, t, boardSize) / 100;
            const riskProb = 1 - winProb;

            let valueGain = val(cap);

            // AI LOGIC UPGRADE: Staff conversion is a huge gain
            if (p.equip === "staff") {
              // Winning converts the piece, so the value is gaining their piece without losing yours.
              valueGain = val(cap) + val(p);
            }

            // AI LOGIC UPGRADE: Attacking a skull piece is a trade at best
            if (cap.equip === "skull") {
              // If you win, you trade pieces. Net gain is their value minus your value.
              valueGain = val(cap) - val(p);
            }

            sc = winProb * valueGain - riskProb * val(p);

            // Behavior-specific adjustments for captures
            if (isAggressive) {
              // Aggressive: More willing to take risky trades (lower threshold)
              if (winProb >= 0.58) {
                sc += 5; // Bonus for 58%+ trades
              }
              // Extra bonus for attacking the enemy King - prioritize even with lower win%
              if (cap.type === "K") {
                // Give huge bonus even for risky king attacks
                if (winProb >= 0.4) {
                  sc += 80; // Massive bonus for 40%+ chance to kill king
                } else if (winProb >= 0.25) {
                  sc += 40; // Still pursue king even with 25%+ chance
                } else {
                  sc += 20; // Consider any king attack
                }
                // Extra bonus if the king is already threatened or isolated
                const kingAllies = supportCount(b, T, O, cap, t, t, boardSize);
                if (kingAllies === 0) {
                  sc += 30; // Isolated king is prime target
                }
              }
              // Slight bonus for any capture
              if (valueGain > 0) {
                sc += 2;
              }
            } else if (isDefensive) {
              // Defensive: Only take favorable trades
              if (winProb < 0.7) {
                sc -= 10; // Heavy penalty for risky trades
              }
              // Avoid trading valuable pieces
              if (val(p) >= 30 && riskProb > 0.2) {
                sc -= val(p) * 0.5;
              }
              // Extra caution: Check if this capture leaves the king vulnerable
              const afterCapture = tryMove(b, T, { x, y }, t);
              if (afterCapture) {
                const myKingAfter = findK(afterCapture, c, boardSize);
                if (myKingAfter) {
                  const kingThreatenedAfterCapture = threatened(
                    afterCapture,
                    T,
                    O,
                    { x: myKingAfter.x, y: myKingAfter.y },
                    opp,
                    boardSize
                  );
                  if (kingThreatenedAfterCapture) {
                    // Major penalty if this capture exposes our king
                    sc -= 30;
                  }
                  // Also check if we're removing a defender of the king
                  const myKingNow = findK(b, c, boardSize);
                  if (myKingNow) {
                    const distToKingBefore =
                      Math.abs(x - myKingNow.x) + Math.abs(y - myKingNow.y);
                    const distToKingAfter =
                      Math.abs(t.x - myKingNow.x) + Math.abs(t.y - myKingNow.y);
                    // Penalty for moving key defenders away from king
                    if (distToKingBefore <= 2 && distToKingAfter > 2) {
                      sc -= 15; // Don't leave king undefended
                    }
                  }
                }
              }
            } else if (isBalanced) {
              // Balanced: Favor good trades but consider position
              if (cap.type === "K" && winProb >= 0.65) {
                sc += 30; // Good bonus for likely king kills
              }
            }

            // AI LOGIC UPGRADE: Add incentive to use one-time Lance on good trades
            const dir = p.color === W ? 1 : -1;
            const isLanceMove =
              p.equip === "lance" && t.y === y + 2 * dir && t.x === x;
            if (isLanceMove && valueGain > 0) {
              sc += 5; // Bonus for using this powerful one-time item
            }
          }
        } else if (targetObstacle !== "none") {
          // --- OBSTACLE ATTACK SCORING ---
          // Black bot should NEVER attack the bell (it protects their king)
          if (targetObstacle === "bell" && c === B) {
            continue; // Skip bell attacks for black
          }
          const winProb =
            obstacleWinPercent(b, T, O, p, { x, y }, t, boardSize) / 100;
          sc = winProb * 1 - (1 - winProb) * 0.1; // Small penalty for failure
        } else {
          // --- QUIET MOVE SCORING (AI LOGIC UPGRADE) ---
          const nb = tryMove(b, T, { x, y }, t);
          if (!nb) continue;

          sc = r() * 0.01; // Start with random tie-breaker

          // 1. Pawn Advancement (for black, a lower y-value is an advance)
          if (p.type === "P") {
            const advancementScore = (boardSize - 1 - t.y) * 0.2;
            sc += advancementScore;
            // Aggressive: Push pawns forward more aggressively
            if (isAggressive) {
              sc += advancementScore * 0.5;
            }
          }

          // 2. Piece Safety
          const isSafeNow = !threatened(nb, T, O, t, opp, boardSize);
          const wasThreatenedBefore = threatened(
            b,
            T,
            O,
            { x, y },
            opp,
            boardSize
          );
          if (!isSafeNow) {
            const hangingPenalty = val(p);
            sc -= hangingPenalty; // Heavy penalty for moving to a square where this piece can be captured
            // Defensive: Extra penalty for hanging pieces
            if (isDefensive) {
              sc -= hangingPenalty * 0.5;
            }
          } else if (wasThreatenedBefore) {
            sc += val(p) * 0.5; // Reward moving a threatened piece to safety
            // Defensive: Extra reward for saving threatened pieces
            if (isDefensive) {
              sc += val(p) * 0.3;
            }
          }

          // Balanced: Center control bonus (middle squares of the board)
          if (isBalanced) {
            const center = Math.floor(boardSize / 2);
            const distToCenter =
              Math.abs(t.x - center) + Math.abs(t.y - center);
            sc += (4 - distToCenter) * 0.5; // Higher score for moves closer to center
          }

          // Aggressive: Forward movement bonus
          if (isAggressive) {
            const direction = c === W ? 1 : -1;
            const forwardProgress = (t.y - y) * direction;
            if (forwardProgress > 0) {
              sc += forwardProgress * 1.5; // Bonus for moving toward enemy
            }

            // Aggressive: Prioritize threatening the enemy king
            const enemyKing = findK(nb, opp, boardSize);
            if (enemyKing) {
              const enemyKingPos = { x: enemyKing.x, y: enemyKing.y };
              // Check if this move puts the king in check
              const threateningKing = attacks(
                nb,
                T,
                O,
                t.x,
                t.y,
                enemyKingPos.x,
                enemyKingPos.y,
                boardSize
              );
              if (threateningKing) {
                sc += 35; // Big bonus for threatening the king
              }

              // Bonus for moving closer to the enemy king
              const distToKing =
                Math.abs(t.x - enemyKingPos.x) + Math.abs(t.y - enemyKingPos.y);
              const oldDistToKing =
                Math.abs(x - enemyKingPos.x) + Math.abs(y - enemyKingPos.y);
              if (distToKing < oldDistToKing) {
                sc += 3; // Reward for advancing toward the king
              }
              if (distToKing <= 3) {
                sc += (4 - distToKing) * 2; // Extra bonus for being near the king
              }
            }
          }

          // Defensive: King safety - keep king in back rank or protected
          if (isDefensive && p.type === "K") {
            const backRank = c === W ? 0 : boardSize - 1;
            if (t.y !== backRank) {
              sc -= 5; // Penalty for moving king away from back rank
            }
            // Bonus for king being surrounded by allies
            let adjacentAllies = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const neighbor = nb[t.y + dy]?.[t.x + dx];
                if (neighbor && neighbor.color === c) adjacentAllies++;
              }
            }
            sc += adjacentAllies * 2;
          }

          // Defensive: Proactive king defense - foresee opponent attacks
          if (isDefensive) {
            const myKing = findK(nb, c, boardSize);
            const myKingBefore = findK(b, c, boardSize);
            if (myKing) {
              const kingPos = { x: myKing.x, y: myKing.y };
              // Check if king is threatened after this move
              const kingThreatenedAfter = threatened(
                nb,
                T,
                O,
                kingPos,
                opp,
                boardSize
              );
              const kingThreatenedBefore = myKingBefore
                ? threatened(b, T, O, { x: myKingBefore.x, y: myKingBefore.y }, opp, boardSize)
                : false;

              if (kingThreatenedAfter && !kingThreatenedBefore) {
                // Severe penalty for moves that expose the king to attack
                sc -= 50;
              } else if (kingThreatenedBefore && !kingThreatenedAfter) {
                // Big reward for moves that remove king from danger
                sc += 40;
              }

              // Count how many enemy pieces can attack the king position after this move
              let enemyAttackers = 0;
              for (let yy = 0; yy < boardSize; yy++) {
                for (let xx = 0; xx < boardSize; xx++) {
                  const enemy = nb[yy]?.[xx];
                  if (enemy && enemy.color === opp) {
                    if (attacks(nb, T, O, xx, yy, kingPos.x, kingPos.y, boardSize)) {
                      enemyAttackers++;
                    }
                  }
                }
              }

              // Penalty for each enemy piece that can attack the king
              sc -= enemyAttackers * 8;

              // Reward for blocking enemy attacks to the king
              if (p.type !== "K") {
                // Check if this piece is now between an enemy attacker and the king
                let blocksAttack = false;
                for (let yy = 0; yy < boardSize; yy++) {
                  for (let xx = 0; xx < boardSize; xx++) {
                    const enemy = b[yy]?.[xx];
                    if (enemy && enemy.color === opp) {
                      const couldAttackBefore = attacks(
                        b,
                        T,
                        O,
                        xx,
                        yy,
                        kingPos.x,
                        kingPos.y,
                        boardSize
                      );
                      const canAttackAfter = attacks(
                        nb,
                        T,
                        O,
                        xx,
                        yy,
                        kingPos.x,
                        kingPos.y,
                        boardSize
                      );
                      if (couldAttackBefore && !canAttackAfter) {
                        blocksAttack = true;
                        break;
                      }
                    }
                  }
                  if (blocksAttack) break;
                }
                if (blocksAttack) {
                  sc += 25; // Reward for blocking attacks to the king
                }
              }

              // Reward for keeping defenders near the king
              if (p.type !== "K") {
                const distToKing =
                  Math.abs(t.x - kingPos.x) + Math.abs(t.y - kingPos.y);
                const oldDistToKing = myKingBefore
                  ? Math.abs(x - myKingBefore.x) + Math.abs(y - myKingBefore.y)
                  : 999;
                if (distToKing <= 2) {
                  sc += (3 - distToKing) * 3; // Stay close to king
                }
                if (distToKing < oldDistToKing) {
                  sc += 5; // Moving closer to king
                }
              }
            }
          }

          // 3. Item & Positional Synergy
          // Encourage moving pieces to be protected by a banner
          if (
            isProtectedByBanner(nb, p.color, t, boardSize) &&
            !isProtectedByBanner(b, p.color, { x, y }, boardSize)
          ) {
            sc += 3;
          }
          // Encourage banner carriers to move towards allies to protect them
          if (p.equip === "banner") {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const ally = b[t.y + dy]?.[t.x + dx];
                if (ally && ally.color === p.color) sc += 1;
              }
            }
          }
        }
        ms.push({ from: { x, y }, to: t, score: sc });
      }
    }
  }
  if (!ms.length) return null;

  // Check logic
  const k = findK(b, c, boardSize);
  const inChk = k
    ? threatened(b, T, O, { x: k.x, y: k.y }, opp, boardSize)
    : false;
  if (inChk) {
    const ev = ms.filter((m) => {
      const nb = tryMove(b, T, m.from, m.to);
      if (!nb) return false;
      const k2 = findK(nb, c, boardSize);
      if (!k2) return false; // This move gets king captured, not an evasion
      return !threatened(nb, T, O, { x: k2.x, y: k2.y }, opp, boardSize);
    });
    if (ev.length) {
      const best = Math.max(...ev.map((m) => m.score));
      return rand(
        r,
        ev.filter((m) => m.score >= best - 0.5)
      );
    } else {
      return null; // This is checkmate
    }
  }

  // Behavior-specific move filtering
  let movePool = ms;

  if (isAggressive) {
    // Aggressive: Prioritize king attacks, even risky ones
    const enemyKing = findK(b, opp, boardSize);
    const kingAttackMoves = enemyKing
      ? ms.filter((m) => {
          const target = b[m.to.y]?.[m.to.x];
          return target && target.type === "K";
        })
      : [];
    
    if (kingAttackMoves.length > 0) {
      // If we have any king attack moves, strongly consider them
      // Include king attacks with score >= -20 (very permissive)
      movePool = kingAttackMoves.filter((m) => m.score >= -20);
      if (movePool.length === 0) movePool = kingAttackMoves; // Take any king attack
    } else {
      // No king attacks available, consider all moves (score >= -5)
      movePool = ms.filter((m) => m.score >= -5);
      if (movePool.length === 0) movePool = ms; // Fallback
    }
  } else if (isDefensive) {
    // Defensive: Only safe moves (score >= 5)
    const safeMoves = ms.filter((m) => m.score >= 5);
    movePool =
      safeMoves.length > 0 ? safeMoves : ms.filter((m) => m.score >= 0);
    if (movePool.length === 0) movePool = ms; // Fallback
  } else {
    // Balanced: Sensible moves (score >= 0)
    const sensibleMoves = ms.filter((m) => m.score >= 0);
    movePool = sensibleMoves.length > 0 ? sensibleMoves : ms;
  }

  const best = Math.max(...movePool.map((m) => m.score));

  // Behavior-specific best move selection tolerance
  let tolerance = 1;
  if (isAggressive) {
    tolerance = 3; // More random, less calculated
  } else if (isDefensive) {
    tolerance = 0.5; // Very precise, pick only best moves
  } else {
    tolerance = 1; // Balanced
  }

  const bestMoves = movePool.filter((m) => m.score >= best - tolerance);
  return rand(r, bestMoves);
}

// --- Odds helpers (used by Board) ---
const advPMF = (k: number) => (2 * k - 1) / 36;
function winPercent(
  BD: Board,
  TD: Terrain,
  OD: Obstacle,
  att: Piece,
  def: Piece,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S
) {
  const aSup = supportCount(BD, TD, OD, att, from, to, boardSize);
  const aMod = (att.equip === "sword" ? 1 : 0) + aSup;
  // Adjusted defense modifier calculation for water
  const terrainMod =
    TD[to.y]?.[to.x] === "forest" ? 1 : TD[to.y]?.[to.x] === "water" ? -1 : 0; // Safe navigation
  const dMod =
    (def.equip === "shield" || isProtectedByBanner(BD, def.color, to, boardSize)
      ? 1
      : 0) + terrainMod;
  const dir = att.color === W ? 1 : -1;
  const lanceLungeUsed =
    att.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
  const isTorchAdvantage =
    att.equip === "torch" && TD[to.y]?.[to.x] === "forest"; // Safe navigation
  const useAdv = att.type === "K" || lanceLungeUsed || isTorchAdvantage;

  // Calculate Attacker's roll probability (considering Scythe)
  let aPMF = new Array(7).fill(0);
  if (att.equip === "scythe" && def.type === "P") {
    aPMF[6] = 1; // Always rolls 6
  } else if (useAdv) {
    for (let k = 1; k <= 6; k++) aPMF[k] = advPMF(k);
  } else {
    for (let k = 1; k <= 6; k++) aPMF[k] = 1 / 6;
  }

  // Calculate Defender's roll probability (considering Scythe and Stun)
  let dPMF = new Array(7).fill(0);
  if (def.stunnedForTurns && def.stunnedForTurns > 0) {
    dPMF[1] = 1; // Always rolls 1 if stunned
  } else if (def.equip === "scythe" && att.type === "P") {
    dPMF[6] = 1; // Always rolls 6 if defending vs Pawn with Scythe
  } else {
    for (let k = 1; k <= 6; k++) dPMF[k] = 1 / 6; // Standard roll otherwise
  }

  let p = 0;
  for (let a = 1; a <= 6; a++)
    for (let d = 1; d <= 6; d++) {
      if (a + aMod >= d + dMod) p += aPMF[a] * dPMF[d];
    }
  return Math.round(p * 100);
}
function obstacleWinPercent(
  BD: Board,
  TD: Terrain,
  OD: Obstacle,
  att: Piece,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S
) {
  const obstacleType = OD[to.y]?.[to.x];
  
  // Determine threshold based on obstacle type
  let threshold = 5; // Rock default
  if (obstacleType === "courtier") {
    threshold = 1; // Courtier is easier to destroy
  } else if (obstacleType === "gate") {
    threshold = 3; // Gate requires 3+ to break
  } else if (obstacleType === "bell") {
    threshold = 4; // Bell requires 4+ to break
  } else if (obstacleType === "column") {
    threshold = 6; // Column requires 6+ to break
  }
  
  const aSup = supportCount(BD, TD, OD, att, from, to, boardSize);
  const aMod = (att.equip === "sword" ? 1 : 0) + aSup;
  const dir = att.color === W ? 1 : -1;
  const lanceLungeUsed =
    att.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
  const useAdv = att.type === "K" || lanceLungeUsed;
  const target = threshold - aMod;
  if (target <= 1) return 100;
  if (target > 6) return 0;
  let p = 0;
  if (useAdv) {
    const probSingleLessThan = (target - 1) / 6;
    p = 1 - probSingleLessThan * probSingleLessThan;
  } else {
    p = (6 - (target - 1)) / 6;
  }
  return Math.round(p * 100);
}

// --- UI Components ---

const AnimatedSpeechBubble = ({ text }: { text: string }) => {
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    setCharCount(0);
    if (text) {
      // Strip markers to get the actual character count (without **)
      const cleanText = text.replace(/\*\*/g, "");
      let i = 0;
      const intervalId = setInterval(() => {
        i++;
        setCharCount(i);
        if (i >= cleanText.length) {
          clearInterval(intervalId);
        }
      }, 50);
      return () => clearInterval(intervalId);
    }
  }, [text]);

  // Parse text for **emphasized** sections and handle partial display
  const parseEmphasis = (str: string, displayedChars: number) => {
    const parts: Array<{ text: string; emphasized: boolean }> = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;
    let charsProcessed = 0;

    while ((match = regex.exec(str)) !== null) {
      // Add text before the match
      const beforeText = str.slice(lastIndex, match.index);
      if (beforeText.length > 0) {
        const visibleChars = Math.max(
          0,
          Math.min(beforeText.length, displayedChars - charsProcessed)
        );
        if (visibleChars > 0) {
          parts.push({
            text: beforeText.slice(0, visibleChars),
            emphasized: false,
          });
        }
        charsProcessed += beforeText.length;
      }

      // Add the emphasized text
      const emphasizedText = match[1];
      const visibleChars = Math.max(
        0,
        Math.min(emphasizedText.length, displayedChars - charsProcessed)
      );
      if (visibleChars > 0) {
        parts.push({
          text: emphasizedText.slice(0, visibleChars),
          emphasized: true,
        });
      }
      charsProcessed += emphasizedText.length;
      lastIndex = regex.lastIndex;

      if (charsProcessed >= displayedChars) break;
    }

    // Add remaining text
    if (lastIndex < str.length && charsProcessed < displayedChars) {
      const remainingText = str.slice(lastIndex);
      const visibleChars = Math.max(
        0,
        Math.min(remainingText.length, displayedChars - charsProcessed)
      );
      if (visibleChars > 0) {
        parts.push({
          text: remainingText.slice(0, visibleChars),
          emphasized: false,
        });
      }
    }

    return parts;
  };

  const parts = parseEmphasis(text, charCount);

  return (
    <>
      {parts.map((part, idx) =>
        part.emphasized ? (
          <span key={idx} className="speech-emphasis">
            {part.text.split("").map((char, charIdx) => (
              <span
                key={charIdx}
                className="speech-letter"
                style={{ animationDelay: `${charIdx * 0.1}s` }}
              >
                {char}
              </span>
            ))}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        )
      )}
    </>
  );
};

/**
 * DiceD6 — a drop‑in, juicy 1d6 rolling animation.
 */
function DiceD6({
  rolling,
  result,
  size = 24,
  seed = 0,
}: {
  rolling: boolean;
  result: number | null; // 1..6 when known, otherwise null while computing
  size?: number;
  seed?: number; // optional: use fx id to vary animation subtly
}) {
  const [face, setFace] = useState<number>(result ?? 1);
  const [t, setT] = useState(rolling ? 0 : 1); // 0..1 animation progress
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const startRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  // Small deterministic RNG so both attacker/defender feel different but consistent
  const rng = useMemo(() => {
    let s = (seed || 0) + 1337;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5; // xorshift32
      return (s >>> 0) / 0xffffffff;
    };
  }, [seed]);

  // Pick a new face different from current
  const nextFace = (cur: number) => {
    let f = Math.floor(rng() * 6) + 1;
    if (f === cur) f = (f % 6) + 1;
    return f;
  };

  useEffect(() => {
    if (rolling) {
      // Start a new roll sequence
      runningRef.current = true;
      startRef.current = performance.now();
      lastTickRef.current = startRef.current;
      const spinMs = 950; // total roll duration

      const step = (now: number) => {
        if (!runningRef.current) return;
        const elapsed = now - startRef.current;
        const raw = Math.min(1, elapsed / spinMs);
        // Ease-out with a little overshoot to feel physical
        const eased = easeOutBack(raw);
        setT(eased);

        // Flip frequency decelerates: fast at start, slow at end
        // freq goes from ~40 flips/sec → ~5 flips/sec over time
        const flipsPerSec = lerp(40, 5, eased);
        const minDelta = 1000 / flipsPerSec;
        if (now - lastTickRef.current > minDelta) {
          setFace((cur) => nextFace(cur));
          lastTickRef.current = now;
        }

        if (elapsed < spinMs) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          // Snap to the final result if provided
          if (result && result >= 1 && result <= 6) setFace(result);
          runningRef.current = false;
          setT(1);
        }
      };

      rafRef.current = requestAnimationFrame(step);
      return () => {
        runningRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    } else {
      // Not rolling: ensure we show the final, if we have it
      if (result) setFace(result);
      setT(1);
    }
  }, [rolling, result]); // Added result to dependencies

  useEffect(() => {
    // When a new result arrives mid-roll, let the sequence finish; otherwise snap
    if (!rolling && result) setFace(result);
  }, [result, rolling]);

  // Pose transforms
  const spin = useMemo(() => {
    // A subtle tumbling motion in 3D-ish space
    const rotZ = lerp(540, 0, t) + rng() * 6; // degrees
    const rotX = lerp(35, 0, t);
    const rotY = lerp(25, 0, t);
    const bob = Math.sin(t * Math.PI) * (size / 6); // jump arc
    const squash =
      1 + (t < 1 ? Math.max(0, 0.14 - Math.abs(0.86 - t) * 0.4) : 0);
    return { rotZ, rotX, rotY, bob, squash };
  }, [t, size, rng]);

  // Slight jitter for hand-rolled feel
  const jitter = useMemo(
    () => (rolling ? (rng() - 0.5) * 0.6 : 0),
    [rolling, t, rng]
  );

  const s = size;
  const pip = s * 0.12;
  const r = s * 0.18; // corner radius

  return (
    <div
      style={{
        width: s,
        height: s,
        perspective: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        filter: `drop-shadow(0 ${Math.max(0, 5 - spin.bob * 0.2)}px ${Math.max(
          6,
          12 - spin.bob
        )}px rgba(0,0,0,${0.35 + (rolling ? 0.15 : 0)}))`,
      }}
      aria-label={rolling ? "Rolling d6" : `d6: ${face}`}
    >
      <div
        style={{
          width: s,
          height: s,
          transform: `translateY(${-spin.bob}px) rotateX(${
            spin.rotX
          }deg) rotateY(${spin.rotY}deg) rotate(${
            spin.rotZ + jitter
          }deg) scale(${spin.squash}, ${1 / spin.squash})`,
          transition: rolling ? "none" : "transform 120ms ease-out",
        }}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          {/* Die body */}
          <rect
            x={0}
            y={0}
            width={s}
            height={s}
            rx={r}
            ry={r}
            fill="white"
            stroke="#111"
            strokeWidth={s * 0.03}
          />
          {/* Bevel */}
          <rect
            x={s * 0.02}
            y={s * 0.02}
            width={s * 0.96}
            height={s * 0.96}
            rx={r * 0.75}
            ry={r * 0.75}
            fill="#f3f3f3"
          />
          {/* Pips */}
          {renderPips(face, s, pip)}
        </svg>
      </div>
    </div>
  );
}

function renderPips(n: number, s: number, pip: number) {
  const dot = (cx: number, cy: number) => (
    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={pip} fill="#111" />
  );
  const m = s / 2;
  const g = s / 4; // grid step
  const TL = [g, g],
    TR = [s - g, g],
    BL = [g, s - g],
    BR = [s - g, s - g],
    ML = [g, m],
    MR = [s - g, m];
  const mid = [m, m];
  switch (n) {
    case 1:
      return [dot(mid[0], mid[1])];
    case 2:
      return [dot(TL[0], TL[1]), dot(BR[0], BR[1])];
    case 3:
      return [dot(TL[0], TL[1]), dot(mid[0], mid[1]), dot(BR[0], BR[1])];
    case 4:
      return [
        dot(TL[0], TL[1]),
        dot(TR[0], TR[1]),
        dot(BL[0], BL[1]),
        dot(BR[0], BR[1]),
      ];
    case 5:
      return [
        dot(TL[0], TL[1]),
        dot(TR[0], TR[1]),
        dot(mid[0], mid[1]),
        dot(BL[0], BL[1]),
        dot(BR[0], BR[1]),
      ];
    case 6:
      return [
        dot(TL[0], TL[1]),
        dot(TR[0], TR[1]),
        dot(ML[0], ML[1]),
        dot(MR[0], MR[1]),
        dot(BL[0], BL[1]),
        dot(BR[0], BR[1]),
      ];
    default:
      return [dot(mid[0], mid[1])];
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// --- Board Component ---
// Updated to render water tiles and terrain glyphs/tooltips
function BoardComponent({
  board,
  T,
  obstacles,
  V,
  sel,
  legal,
  click,
  fx,
  phase,
  dispA,
  dispD,
  bumpA,
  bumpD,
  wChk,
  bChk,
  speechBubble,
  marketAction,
  onStartBattle,
  startBattleBtnRef,
  playBattleTrumpet,
  rerollState,
  rerollTarget,
  combatId,
  destroyedPieceIds,
  failedAttackId,
  showBoardTooltips,
  showTooltip,
  hideTooltip,
  drag,
  startDrag,
  lastMove,
  moveAnim,
  sellPiece,
  sellButtonPos,
  setSellButtonPos,
  boardSize,
  victoryConditions,
  setSpeechBubble,
  currentLevelConfig,
}: {
  board: Board;
  T: Terrain;
  obstacles: Obstacle;
  V: boolean[][];
  sel: { x: number; y: number } | null;
  legal: { x: number; y: number }[];
  click: (x: number, y: number) => void;
  fx: any;
  phase: Phase;
  dispA: number | null;
  dispD: number | null;
  bumpA: boolean;
  bumpD: boolean;
  wChk: boolean;
  bChk: boolean;
  speechBubble: { text: string; id: number; targetId: string } | null;
  marketAction: MarketAction;
  onStartBattle: () => void;
  startBattleBtnRef: React.RefObject<HTMLButtonElement>;
  playBattleTrumpet: () => void;
  rerollState: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    kind: "piece" | "obstacle";
    obstacleType?: ObstacleType;
  } | null;
  rerollTarget: "attacker" | "defender" | null;
  combatId: number;
  destroyedPieceIds: string[];
  failedAttackId: string | null;
  showBoardTooltips: boolean;
  showTooltip: (text: string) => void;
  hideTooltip: () => void;
  drag: any;
  startDrag: (e: React.MouseEvent, x: number, y: number) => void;
  lastMove: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null;
  moveAnim: any;
  sellPiece: (x: number, y: number) => void;
  sellButtonPos: { x: number; y: number } | null;
  setSellButtonPos: (pos: { x: number; y: number } | null) => void;
  boardSize: number;
  victoryConditions: string[];
  setSpeechBubble: (bubble: { text: string; id: number; targetId: string } | null) => void;
  currentLevelConfig: any;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const isL = (x: number, y: number) =>
    legal.some((s) => s.x === x && s.y === y);

  // Memoize sums calculations to avoid recomputing on every render
  const sumsA = useMemo(
    () =>
      fx ? sumMods(fx.a.mods) : { sword: 0, shield: 0, support: 0, terrain: 0 },
    [fx]
  );
  const sumsD = useMemo(
    () =>
      fx && fx.kind === "piece"
        ? sumMods(fx.d.mods)
        : { sword: 0, shield: 0, support: 0, terrain: 0 },
    [fx]
  );

  // Generate file labels (A-L for boards up to 12x12)
  const files = "ABCDEFGHIJKL";

  // Find speech bubble target - can be a piece or an obstacle (courtier)
  let speechBubbleTarget: { p: Piece; x: number; y: number } | null = null;
  let speechBubbleObstaclePos: { x: number; y: number } | null = null;
  
  if (speechBubble) {
    // Check if it's an obstacle target (format: "courtier-x-y")
    if (speechBubble.targetId.startsWith("courtier-")) {
      const match = speechBubble.targetId.match(/courtier-(\d+)-(\d+)/);
      if (match) {
        const x = parseInt(match[1], 10);
        const y = parseInt(match[2], 10);
        if (inBounds(x, y, boardSize) && obstacles[y]?.[x] === "courtier") {
          speechBubbleObstaclePos = { x, y };
          // Create a dummy piece for rendering purposes (speech bubble expects a piece)
          speechBubbleTarget = {
            p: { id: speechBubble.targetId, type: "P", color: "b" } as Piece,
            x,
            y
          };
        }
      }
    } else {
      // Regular piece target
      speechBubbleTarget = findPieceById(board, speechBubble.targetId, boardSize);
    }
  }

  const showRerollPopup = phase === "awaiting_reroll" && rerollState;
  const rerollTargetPos =
    showRerollPopup && rerollState // Add check for rerollState
      ? board[rerollState.from.y]?.[rerollState.from.x]?.color === W // Safe navigation
        ? rerollState.from
        : rerollState.to // Corrected: should be 'to' for defender
      : null;

  // Format victory condition names
  const formatVictoryCondition = (condition: string) => {
    switch (condition) {
      case "king_beheaded":
        return "King Beheaded";
      case "king_captured":
        return "King Captured (Checkmate)";
      case "king_dishonored":
        return "King Dishonored";
      case "king_escaped":
        return "King Escaped";
      default:
        return condition;
    }
  };

  // Get victory condition description
  const getVictoryConditionDescription = (condition: string) => {
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

  // All possible victory conditions
  const allVictoryConditions = ["king_captured", "king_beheaded", "king_dishonored", "king_escaped"];

  return (
    <div className="inline-block relative">
      {phase === "market" && (
        <div className="absolute inset-0 z-[210] flex items-start justify-center pt-8 pointer-events-none">
          <div className="flex flex-col items-center gap-4 pointer-events-auto">
            {/* Victory Conditions Display with Start Battle Button */}
            <div className="bg-zinc-900 bg-opacity-95 rounded-xl px-6 py-5 shadow-2xl border-2 border-gray-600">
              <h3 className="text-emerald-600 font-bold text-lg mb-3 text-center">Victory Conditions</h3>
              <div className="flex flex-col gap-2 text-sm text-white mb-4">
                {allVictoryConditions.map((condition, idx) => {
                  const isAvailable = victoryConditions.includes(condition);
                  const isKingEscaped = condition === "king_escaped";
                  const description = getVictoryConditionDescription(condition);
                  return (
                    <div key={idx} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        {isAvailable ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-500 text-lg leading-none">✗</span>
                        )}
                        <span className={isKingEscaped ? "font-bold" : ""} style={!isAvailable ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                          {formatVictoryCondition(condition)}
                        </span>
                      </div>
                      {description && (
                        <span className="text-gray-400 italic text-xs ml-6" style={!isAvailable ? { opacity: 0.5 } : {}}>
                          {description}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Start Battle Button inside popup */}
              <button
                ref={startBattleBtnRef}
                onClick={() => {
                  playBattleTrumpet();
                  onStartBattle();
                }}
                className="w-full px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xl shadow-lg"
              >
                START BATTLE
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `24px repeat(${boardSize},88px)`,
          gridTemplateRows: `repeat(${boardSize},88px) 24px`,
        }}
      >
        {/* File Labels */}
        {Array.from({ length: boardSize }, (_, x) => (
          <div
            key={"b" + x}
            className="text-sm font-bold text-white/90 flex items-center justify-center"
            style={{ gridColumn: x + 2, gridRow: boardSize + 1 }}
          >
            {files[x]}
          </div>
        ))}
        {/* Rank Labels */}
        {Array.from({ length: boardSize }, (_, r) => (
          <div
            key={"l" + r}
            className="text-sm font-bold text-white/90 flex items-center justify-center"
            style={{ gridColumn: 1, gridRow: r + 1 }}
          >
            {boardSize - r}
          </div>
        ))}

        {/* The Board Grid */}
        <div
          style={{
            gridColumn: `2 / span ${boardSize}`,
            gridRow: `1 / span ${boardSize}`,
            display: "block",
          }}
        >
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${boardSize},88px)` }}
          >
            {Array.from({ length: boardSize * boardSize }, (_, i) => {
              const x = i % boardSize,
                y = boardSize - 1 - Math.floor(i / boardSize);
              const p = board[y]?.[x]; // Safe navigation
              const currentObstacle = obstacles[y]?.[x]; // Get obstacle at this position
              const hasObstacle = currentObstacle !== "none";
              const light = (x + y) % 2 === 0;
              const isSel = !!sel && sel.x === x && sel.y === y;
              const isMove = isL(x, y);
              const inFog = !V[y]?.[x]; // Safe navigation
              const show =
                !!p && (p.color === W || !inFog);
              const targetPiece = board[y]?.[x]; // Safe navigation for target piece
              const targetObstacle = obstacles[y]?.[x]; // Safe navigation for target obstacle
              const willCap =
                isMove && !!targetPiece;
              const isObstacleAttack = isMove && targetObstacle !== "none" && !targetPiece; // Attacking an obstacle
              const currentTerrain = T[y]?.[x]; // Safe navigation
              const forest = currentTerrain === "forest";
              const water = currentTerrain === "water"; // Check for water

              const attacker = sel ? board[sel.y]?.[sel.x] : null; // Safe navigation

              let obstaclePct: number | undefined;
              if (isObstacleAttack && sel && attacker) {
                const a = attacker as Piece;
                obstaclePct = obstacleWinPercent(board, T, obstacles, a, sel, { x, y }, boardSize);
              }

              const atk = fx && fx.from.x === x && fx.from.y === y;
              const def = fx && fx.to.x === x && fx.to.y === y;

              // Check king aura safely
              const kingAura =
                p &&
                p.type === "K" &&
                ((p.color === W && wChk) || (p.color === B && bChk));

              // Get obstacle glyph
              const getObstacleGlyph = (obstacleType: ObstacleType): string | null => {
                if (obstacleType === "rock") return GL.ROCK.n;
                if (obstacleType === "courtier") return GL.COURTIER.n;
                if (obstacleType === "column") return GL.COLUMN.n;
                if (obstacleType === "gate") return GL.GATE.n;
                if (obstacleType === "bell") return GL.BELL.n;
                return null;
              };

              const isCrystalBallSwap =
                isMove &&
                attacker?.equip === "crystal_ball" &&
                p &&
                p.color === attacker.color;

              const showPct =
                !!sel &&
                !!attacker && // <- guard
                isMove &&
                !!targetPiece && // Check if there's a target piece
                !isCrystalBallSwap;

              let pct: number | undefined;
              if (showPct && attacker && targetPiece) {
                // Ensure attacker and targetPiece exist
                const a = attacker as Piece;
                const d = targetPiece as Piece;
                pct = winPercent(board, T, obstacles, a, d, sel!, { x, y }, boardSize);
              }

              let sup = 0;
              if (isMove && attacker) {
                if (targetPiece && targetPiece.color !== attacker.color) {
                  // Check targetPiece exists before checking color
                  sup = supportCount(
                    board,
                    T,
                    obstacles,
                    attacker,
                    sel!,
                    { x, y },
                    boardSize
                  );
                }
              }

              const isAttack = willCap || isObstacleAttack;
              const currentPct = isObstacleAttack ? obstaclePct : pct;
              const ringClass =
                currentPct != null && currentPct < 50
                  ? "warn"
                  : sup > 0
                  ? "sup"
                  : "cap";

              const hoveredAttackTarget =
                hover &&
                sel &&
                isL(hover.x, hover.y) &&
                (board[hover.y]?.[hover.x] || obstacles[hover.y]?.[hover.x] !== "none"); // Check piece or obstacle
              const isSupporting =
                p &&
                sel &&
                board[sel.y]?.[sel.x] && // Safe navigation
                p.id !== board[sel.y][sel.x]?.id &&
                p.color === board[sel.y][sel.x]?.color &&
                hoveredAttackTarget &&
                hover && // Ensure hover exists before accessing hover.x/y
                attacks(board, T, obstacles, x, y, hover.x, hover.y, boardSize);

              const showSpeechBubble =
                speechBubble &&
                ((speechBubbleTarget &&
                  speechBubbleTarget.x === x &&
                  speechBubbleTarget.y === y) ||
                 (speechBubbleObstaclePos &&
                  speechBubbleObstaclePos.x === x &&
                  speechBubbleObstaclePos.y === y &&
                  obstacles[y]?.[x] === "courtier"));
              const isMarketPlacement =
                marketAction?.type === "piece" && y <= 1 && !p && obstacles[y]?.[x] === "none";
              const isMarketEquipTarget =
                marketAction?.type === "item" &&
                p?.color === W &&
                !p?.equip;

              const isRerollTarget =
                rerollTargetPos &&
                rerollTargetPos.x === x &&
                rerollTargetPos.y === y;

              const isHovered = hover && hover.x === x && hover.y === y;
              const isPlayerDisguisedPiece =
                p?.equip === "disguise" && p.color === W && p.originalType;
              const showAsOriginalOnHover = isHovered && isPlayerDisguisedPiece;

              const isDestroyed = p && destroyedPieceIds.includes(p.id);
              const hasFailedAttack = p && p.id === failedAttackId;
              
              // Check if this is the escape row (top row) and king_escaped is enabled
              const isEscapeRow = victoryConditions.includes("king_escaped") && y === boardSize - 1;
              const isBannerProtected =
                p &&
                p.equip !== "shield" &&
                isProtectedByBanner(board, p.color, { x, y });

              const isLastMoveFrom =
                lastMove && lastMove.from.x === x && lastMove.from.y === y;
              const isLastMoveTo =
                lastMove && lastMove.to.x === x && lastMove.to.y === y;

              const isAnimating = moveAnim && moveAnim.id === p?.id;
              const isDragging = drag && drag.id === p?.id;
              const isOriginHidden = isAnimating || isDragging;

              const isTargetHidden =
                moveAnim && moveAnim.to.x === x && moveAnim.to.y === y;

              const getPieceSymbol = (piece: Piece | null) => {
                // Allow null
                if (!piece) return null;
                let typeToShow = piece.type;
                if (showAsOriginalOnHover && piece.originalType) {
                  typeToShow = piece.originalType;
                }

                const colorKey = piece.color as "w" | "b";
                // Check if GL has the type and color before accessing
                // Also ensure typeToShow is a valid key for GL
                const pieceGlyphSet = GL[typeToShow as keyof typeof GL];
                if (pieceGlyphSet && colorKey in pieceGlyphSet) {
                  return pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet];
                }
                return "?"; // Fallback symbol
              };

              // Determine terrain glyph and tooltip text
              let terrainGlyph = null;
              let terrainTooltip = "";
              if (p && currentTerrain === "water") {
                terrainGlyph = "💦";
                terrainTooltip = "💧 -1 Defense";
              } else if (p && currentTerrain === "forest") {
                terrainGlyph = "🌲";
                terrainTooltip = "🌲 +1 Defense";
              }

              return (
                <button
                  key={x + "-" + y}
                  onMouseDown={(e) => startDrag(e, x, y)}
                  onMouseEnter={() => {
                    setHover({ x, y });
                    if (
                      phase === "market" &&
                      currentLevelConfig?.marketEnabled !== false &&
                      board[y]?.[x]?.color === W &&
                      board[y]?.[x]?.type !== "K"
                    ) {
                      setSellButtonPos({ x, y });
                    }
                  }}
                  onMouseLeave={(e) => {
                    const rt = (e as React.MouseEvent)
                      .relatedTarget as HTMLElement | null;
                    // Only clear hover; keep sellButtonPos unless we truly left board/overlay
                    setHover(null);
                    hideTooltip();
                    if (
                      !rt ||
                      !(rt instanceof HTMLElement) ||
                      !rt.closest(".sell-button-overlay")
                    ) {
                      // pointer not going into the overlay → clear it
                      setSellButtonPos(null);
                    }
                  }}
                  onClick={() => click(x, y)}
                  className={`tile ${light ? "tL" : "tD"} ${
                    isSel ? "ring-4 ring-white/60" : ""
                  } ${isEscapeRow ? "escape-row" : ""}`}
                >
                  {(isLastMoveFrom || isLastMoveTo) &&
                    V[y]?.[x] && ( // Safe navigation
                      <div className="last-move" />
                    )}
                  {/* --- Visual Layers (Rendered Bottom-to-Top) --- */}
                  {isMarketPlacement && (
                    <div className="market-placement-overlay" />
                  )}

                  {/* 1. Terrain Layer */}
                  {forest && !isEscapeRow && (
                    <span
                      className="forest"
                      style={{ position: "absolute", inset: 0, zIndex: 1 }}
                    />
                  )}
                  {/* Render water tile */}
                  {water && !isEscapeRow && <span className="water" />}

                  {/* 1.5. Obstacle Layer */}
                  {hasObstacle && !inFog && (
                    <span
                      className="obstacle-container"
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none"
                      }}
                    >
                      <span className={`obstacle-chip ${currentObstacle}`} id={`courtier-${x}-${y}`}>
                        {getObstacleGlyph(currentObstacle)}
                      </span>
                    </span>
                  )}

                  {/* 2. Move Indicator Layer */}
                  {isMove && !isAttack && (
                    <span className="ind">
                      <span className="dot" />
                    </span>
                  )}
                  {isAttack && (
                    <span className="ind">
                      <span className={`ring ${ringClass}`}></span>
                    </span>
                  )}

                  {/* 3. Odds Preview Layer */}
                  <div className="odds-container">
                    {isAttack && sup > 0 && (
                      <span className="supB-odds">+{sup}</span>
                    )}
                    {(showPct || isObstacleAttack) && ( // Combined condition for odds display
                      <span
                        className={`pct ${
                          isObstacleAttack
                            ? "pct-rock" // Specific style for obstacle attack
                            : currentPct != null && currentPct < 50
                            ? "text-orange-400" // Warning for low odds
                            : sup > 0
                            ? "pctS" // Support style
                            : "pctG" // Good odds style
                        }`}
                      >
                        {currentPct}% {/* Display either obstacle or piece odds */}
                      </span>
                    )}
                  </div>

                  {/* 4. Piece Layer */}
                  {show &&
                    !isOriginHidden &&
                    !isTargetHidden &&
                    p && ( // Ensure p exists
                      <span
                        className={`piece-container ${
                          atk && !hasFailedAttack ? "pbmp" : ""
                        } ${def || hasFailedAttack ? "hit" : ""} ${
                          isSupporting ? "supporting-piece" : ""
                        } ${isMarketEquipTarget ? "market-equip-target" : ""} ${
                          isDestroyed ? "destroyed" : ""
                        } ${
                          phase === "market" &&
                          p.color === W &&
                          (isHovered ||
                            (sellButtonPos &&
                              sellButtonPos.x === x &&
                              sellButtonPos.y === y))
                            ? "hover-scale"
                            : ""
                        }`}
                      >
                        <span
                          className={`chip ${
                            p.color === W ? "pw" : p.color === "b" ? "pb" : "pn"
                          } ${
                            p.stunnedForTurns && p.stunnedForTurns > 0
                              ? "stunned-piece"
                              : ""
                          } ${p.shadowForTurns && p.shadowForTurns > 0 ? "shadow-piece" : ""}`}
                        >
                          {getPieceSymbol(p)}
                        </span>
                        {p.name && (
                          <span
                            className={`piece-name${
                              p.isPreconfigured ? " preconfigured" : ""
                            }`}
                            onMouseEnter={(e) => {
                              if (
                                e.currentTarget.scrollWidth >
                                e.currentTarget.clientWidth
                              ) {
                                showTooltip(p.name!);
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            {p.name}
                          </span>
                        )}
                        {!showAsOriginalOnHover &&
                          p.equip &&
                          (p.equip !== "disguise" || p.color === W) && (
                            <span
                              className="equip-icon"
                              onMouseEnter={(e) => {
                                if (showBoardTooltips && p && p.equip) {
                                  showTooltip(ITEM_DESCRIPTIONS[p.equip]);
                                  e.stopPropagation();
                                }
                              }}
                              onMouseLeave={hideTooltip}
                            >
                              {equipIcon(p.equip)}
                            </span>
                          )}
                        {isBannerProtected && (
                          <span
                            className="banner-shield-icon"
                            onMouseEnter={(e) => {
                              if (showBoardTooltips) {
                                showTooltip(
                                  "🛡️ Shield: +1 to defense rolls (from Banner)."
                                );
                                e.stopPropagation();
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            🛡️
                          </span>
                        )}
                        {/* Veteran Badge */}
                        {p && (p.kills || 0) >= 5 && (
                          <span
                            className="veteran-badge"
                            onMouseEnter={(e) => {
                              if (showBoardTooltips) {
                                showTooltip(
                                  "🎖️ Veteran: This unit has killed 5+ enemy units and always rolls with advantage in combat."
                                );
                                e.stopPropagation();
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            🎖️
                          </span>
                        )}
                        {/* Terrain Glyph and Tooltip */}
                        {terrainGlyph && (
                          <span
                            className="terrain-glyph"
                            onMouseEnter={(e) => {
                              if (showBoardTooltips) {
                                showTooltip(terrainTooltip);
                                e.stopPropagation();
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            {terrainGlyph}
                          </span>
                        )}
                        {kingAura && <span className="check" />}
                      </span>
                    )}
                  {showSpeechBubble &&
                    speechBubble && ( // Ensure target and speechBubble exist
                      <div
                        key={speechBubble.id}
                        className={`speech-bubble ${
                          speechBubbleObstaclePos
                            ? "black-king-bubble" // Courtiers use black bubble style
                            : speechBubbleTarget && speechBubbleTarget.p.color === "w"
                            ? "white-king-bubble"
                            : "black-king-bubble"
                        }`}
                      >
                        <AnimatedSpeechBubble text={speechBubble.text} />
                      </div>
                    )}

                  {/* 5. Stun Layer (under fog) */}
                  {p && p.stunnedForTurns !== undefined && p.stunnedForTurns > 0 && (
                    <>
                      {p.isExhausted ? (
                        <span
                          className="exhausted-glyph"
                          onMouseEnter={(e) => {
                            if (showBoardTooltips) {
                              showTooltip(
                                "😴 Exhausted: This piece repeated the same move 3 times and is stunned for 1 turn."
                              );
                              e.stopPropagation();
                            }
                          }}
                          onMouseLeave={hideTooltip}
                        >
                          😴
                        </span>
                      ) : (
                        <span className="stun-glyph">🌀</span>
                      )}
                    </>
                  )}

                  {/* 5.5. Bell of Names Protection Indicator */}
                  {p && p.type === "K" && p.color === B && p.name === "Morcant" && bellOfNamesExists(obstacles, boardSize) && (
                    <span
                      className="bell-glyph"
                      onMouseEnter={(e) => {
                        if (showBoardTooltips) {
                          showTooltip(
                            "🔔 Protected by the Bell of Names: Morcant cannot die until the Bell of Names is destroyed."
                          );
                          e.stopPropagation();
                        }
                      }}
                      onMouseLeave={hideTooltip}
                    >
                      🔔
                    </span>
                  )}

                  {/* 6. Fog Layer */}
                  {inFog && <div className="fog" />}

                  {/* Dice badges (Highest Layer) */}
                  {fx && atk && !isRerollTarget && (
                    <span
                      className={`badge ${
                        fx.kind === "piece"
                          ? fx.win
                            ? "ok"
                            : "bad"
                          : fx.ok
                          ? "ok"
                          : "bad"
                      }`}
                    >
                      {phase === "base" || phase === "mods" ? (
                        <span className="expr">
                          <span className="term">
                            {fx.a.rolls.map((roll: number, i: number) => (
                              <div
                                key={i}
                                style={{
                                  opacity:
                                    fx.adv && roll !== fx.a.base ? 0.5 : 1,
                                }}
                              >
                                <DiceD6
                                  rolling={
                                    phase === "base" &&
                                    rerollTarget !== "defender" &&
                                    !fx.a?.forced
                                  }
                                  result={roll}
                                  size={24}
                                  seed={(fx.id ?? 0) + i}
                                />
                              </div>
                            ))}
                            {phase !== "base" && <strong>{fx.a.base}</strong>}
                          </span>
                          {sumsA.support > 0 && (
                            <>
                              <span className="plus">+</span>
                              <span className="term">
                                <strong>{sumsA.support}</strong> 👥
                              </span>
                            </>
                          )}
                          {sumsA.sword > 0 && (
                            <>
                              <span className="plus">+</span>
                              <span className="term">
                                <strong>{sumsA.sword}</strong> 🗡️
                              </span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className={`${bumpA ? "pbmp" : ""}`}>
                          <strong>{dispA ?? fx.a.total}</strong>
                        </span>
                      )}
                    </span>
                  )}
                  {fx && def && !isRerollTarget && fx.kind === "piece" && (
                    <span className={`badge ${fx.win ? "bad" : "ok"}`}>
                      {phase === "base" || phase === "mods" ? (
                        <span className="expr">
                          <span className="term">
                            {fx.d.rolls && fx.d.rolls.length > 1 ? (
                              // Display all rolls if defender has advantage
                              <span className="flex items-center gap-0.5">
                                {fx.d.rolls.map((roll: number, idx: number) => (
                                  <DiceD6
                                    key={idx}
                                    rolling={
                                      phase === "base" &&
                                      rerollTarget !== "attacker" &&
                                      !fx.d?.forced
                                    }
                                    result={roll}
                                    size={24}
                                    seed={(fx?.id ?? 0) + 5 + idx}
                                  />
                                ))}
                              </span>
                            ) : (
                              <DiceD6
                                rolling={
                                  phase === "base" &&
                                  rerollTarget !== "attacker" &&
                                  !(fx.kind === "piece" && fx.d?.forced)
                                }
                                result={fx?.d?.base ?? null}
                                size={24}
                                seed={(fx?.id ?? 0) + 5}
                              />
                            )}
                            {phase !== "base" && <strong>{fx.d.base}</strong>}
                          </span>
                          {sumsD.shield > 0 && (
                            <>
                              <span className="plus">+</span>
                              <span className="term">
                                <strong>{sumsD.shield}</strong> 🛡️
                              </span>
                            </>
                          )}
                          {/* Display terrain modifier text only if it's not zero */}
                          {/* Add safe navigation for fx.to */}
                          {/* Add key prop */}
                          {sumsD.terrain !== 0 &&
                            fx.to &&
                            T[fx.to.y]?.[fx.to.x] && (
                              <React.Fragment key="terrain-mod">
                                <span className="plus">
                                  {sumsD.terrain > 0 ? "+" : "-"}
                                </span>
                                <span className="term">
                                  <strong>{Math.abs(sumsD.terrain)}</strong>
                                  {/* Safe navigation added */}
                                  {T[fx.to.y]?.[fx.to.x] === "forest"
                                    ? "🌲"
                                    : T[fx.to.y]?.[fx.to.x] === "water"
                                    ? "💧"
                                    : "?"}{" "}
                                  {/* Show icon based on terrain */}
                                </span>
                              </React.Fragment>
                            )}
                        </span>
                      ) : (
                        <span className={`${bumpD ? "pbmp" : ""}`}>
                          <strong>{dispD ?? fx.d.total}</strong>
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sell Button Overlay - Only show during market phase when not deploying an item/piece and market is enabled */}
      {phase === "market" &&
        currentLevelConfig?.marketEnabled !== false &&
        !marketAction &&
        sellButtonPos &&
        board[sellButtonPos.y]?.[sellButtonPos.x]?.color === W &&
        board[sellButtonPos.y]?.[sellButtonPos.x]?.type !== "K" && (
          <div
            className="sell-button-overlay"
            style={{
              position: "absolute",
              top: `${12 + (boardSize - 1 - sellButtonPos.y) * 88 - 22}px`, // Position above the piece square
              left: `${12 + 24 + sellButtonPos.x * 88 + 88 / 2 - 32}px`, // Center horizontally (button width ~40px)
              zIndex: 1000,
            }}
            onMouseLeave={(e) => {
              const rt = (e as React.MouseEvent)
                .relatedTarget as HTMLElement | null;
              if (!rt || !(rt instanceof HTMLElement) || !rt.closest(".tile")) {
                // If we didn't go back to a tile, dismiss
                setSellButtonPos(null);
              }
            }}
          >
            <button
              className="sell-button"
              onClick={(e) => {
                e.stopPropagation();
                sellPiece(sellButtonPos.x, sellButtonPos.y);
              }}
            >
              SELL
            </button>
          </div>
        )}
    </div>
  );
}

function NameInputComponent({
  position,
  onConfirm,
  onCancel,
}: {
  position: { top: number; left: number };
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onConfirm(name.trim() || "Unit"); // Default name if empty
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[240]"
        onClick={onCancel}
      ></div>
      <div
        className="fixed z-[250]"
        style={{
          top: position.top,
          left: position.left,
          transform: "translate(-50%, 8px)",
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 p-2 bg-zinc-800 rounded-lg shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unit Name..."
            maxLength={12}
            className="bg-zinc-900 text-white rounded px-2 py-1 text-sm w-32"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            OK
          </button>
        </form>
      </div>
    </>,
    document.body
  );
}

// --- Main App Component ---
export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [seed, setSeed] = useState(() => new Date().toISOString());
  const [muted, setMuted] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [showBoardTooltips, setShowBoardTooltips] = useState(true);
  const [needsReinit, setNeedsReinit] = useState(false); // Track when board needs re-initialization
  
  // ========== DEV TOOLS - COMMENT OUT BEFORE RELEASE ==========
  const [showDevPanel, setShowDevPanel] = useState(false); // Hidden by default
  
  // Keyboard shortcut: Press Ctrl+D (Windows/Linux) or Cmd+D (Mac) to toggle dev panel
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check for Ctrl+D (Windows/Linux) or Cmd+D (Mac)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        // Only toggle if not typing in an input field
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault(); // Prevent browser default (bookmark dialog)
          setShowDevPanel((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  // ============================================================
  
  // Clear saved game data on initial app load (when intro popup is shown)
  useEffect(() => {
    if (showIntro) {
      localStorage.removeItem("dicechess_campaign_v1");
    }
  }, []); // Run only once on mount
  const [lastMove, setLastMove] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [moveAnim, setMoveAnim] = useState<null | {
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    glyph: string;
    color: "w" | "b";
    equip?: Equip;
  }>(null);
  const [drag, setDrag] = useState<null | {
    id: string;
    from: { x: number; y: number };
    glyph: string;
    color: "w" | "b";
    equip?: Equip;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  }>(null);

  const rngRef = useRef<() => number>(() => Math.random());
  const combatIdRef = useRef(0);
  const [Bstate, setB] = useState<Board>(
    () => Array.from({ length: 5 }, () => Array(5).fill(null)) as Board // Start with 5x5 for level 1
  );
  const [Tstate, setT] = useState<Terrain>(() => emptyTerrain(5)); // Start with 5x5 for level 1
  const [obstacles, setObstacles] = useState<Obstacle>(() => emptyObstacles(5)); // Obstacles grid
  const [turn, setTurn] = useState<Color>(W);
  const [sel, setSel] = useState<{ x: number; y: number } | null>(null);
  const [legal, setLegal] = useState<{ x: number; y: number }[]>([]);
  const [win, setWin] = useState<Color | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [fx, setFx] = useState<any>(null); // {kind:'piece'|'obstacle',from,to,a,d?,win?,ok?,obstacleType?:ObstacleType}
  const [phase, setPhase] = useState<Phase>("market");
  const [dispA, setDispA] = useState<number | null>(null);
  const [dispD, setDispD] = useState<number | null>(null);
  const [bumpA, setBumpA] = useState(false);
  const [bumpD, setBumpD] = useState(false);
  const [speechBubble, setSpeechBubble] = useState<{
    text: string;
    id: number;
    targetId: string;
  } | null>(null);
  const [marketPoints, setMarketPoints] = useState(100);
  const [showMarketConfirm, setShowMarketConfirm] = useState(false);
  const startBattleBtnRef = useRef<HTMLButtonElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Story Card state
  const [currentStoryCard, setCurrentStoryCard] =
    useState<StoryCardType | null>(null);
  const currentStoryCardRef = useRef<StoryCardType | null>(null);
  const [storyCardQueue, setStoryCardQueue] = useState<StoryCardType[]>([]);
  const [storyOutcome, setStoryOutcome] = useState<{
    outcomes: OutcomeData[];
    nextCard?: StoryCardType;
    lastCard?: StoryCardType;
  } | null>(null);
  const [showTransition, setShowTransition] = useState(false);
  const playBattleTrumpet = () => {
    try {
      const Ctx: any =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      const makeHorn = (freq: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.6, now);
        o.connect(g);
        g.connect(gain);
        o.start(now);
        o.stop(now + 1.2);
      };
      makeHorn(330);
      makeHorn(392);
      makeHorn(523.25);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      gain.connect(lp);
      lp.connect(ctx.destination);
    } catch (e) {}
  };

  const [prayerDice, setPrayerDice] = useState(2); // Will be updated from campaign state
  const [rerollState, setRerollState] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    kind: "piece" | "obstacle";
    loserPos: { x: number; y: number };
    obstacleType?: ObstacleType;
  } | null>(null);
  const [rerollPopupPosition, setRerollPopupPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rerollTarget, setRerollTarget] = useState<
    "attacker" | "defender" | null
  >(null);

  const [disguisePopupState, setDisguisePopupState] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [disguisePopupPosition, setDisguisePopupPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [namingState, setNamingState] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [nameInputPosition, setNameInputPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [destroyedPieceIds, setDestroyedPieceIds] = useState<string[]>([]);
  const [failedAttackId, setFailedAttackId] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showRulesItemInfo, setShowRulesItemInfo] = useState(false);

  // Track recent moves per piece for exhaustion detection
  const [pieceMovesHistory, setPieceMovesHistory] = useState<
    Map<
      string,
      Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>
    >
  >(new Map());

  // Helper function to detect exhaustion (repetitive moves)
  function checkExhaustion(
    pieceId: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    board: Board
  ): boolean {
    // Get or create move history for this piece
    const history = pieceMovesHistory.get(pieceId) || [];

    // Add current move
    const newHistory = [...history, { from, to }];

    // Keep only last 6 moves (enough to detect 3 repetitions)
    const recentMoves = newHistory.slice(-6);

    // Check if the last 6 moves form a repetitive pattern (A->B, B->A, A->B)
    if (recentMoves.length >= 6) {
      // Check for pattern: from1->to1, to1->from1, from1->to1, to1->from1, from1->to1, to1->from1
      const isRepetitive =
        recentMoves[0].from.x === recentMoves[2].from.x &&
        recentMoves[0].from.y === recentMoves[2].from.y &&
        recentMoves[0].to.x === recentMoves[2].to.x &&
        recentMoves[0].to.y === recentMoves[2].to.y &&
        recentMoves[1].from.x === recentMoves[3].from.x &&
        recentMoves[1].from.y === recentMoves[3].from.y &&
        recentMoves[1].to.x === recentMoves[3].to.x &&
        recentMoves[1].to.y === recentMoves[3].to.y &&
        recentMoves[2].from.x === recentMoves[4].from.x &&
        recentMoves[2].from.y === recentMoves[4].from.y &&
        recentMoves[2].to.x === recentMoves[4].to.x &&
        recentMoves[2].to.y === recentMoves[4].to.y &&
        recentMoves[3].from.x === recentMoves[5].from.x &&
        recentMoves[3].from.y === recentMoves[5].from.y &&
        recentMoves[3].to.x === recentMoves[5].to.x &&
        recentMoves[3].to.y === recentMoves[5].to.y;

      if (isRepetitive) {
        // Apply exhaustion stun (2 turns - unified stun rule)
        // This ensures the piece is stunned until the START of its next-next turn
        const piece = board[to.y]?.[to.x];
        if (piece && piece.id === pieceId) {
          piece.stunnedForTurns = 2;
          piece.isExhausted = true;
        }
        // Reset history after exhaustion
        setPieceMovesHistory((prev) => {
          const newMap = new Map(prev);
          newMap.delete(pieceId);
          return newMap;
        });
        return true;
      }
    }

    // Update history
    setPieceMovesHistory((prev) => {
      const newMap = new Map(prev);
      newMap.set(pieceId, recentMoves);
      return newMap;
    });

    return false;
  }

  // Add state for unspent gold
  const [unspentGold, setUnspentGold] = useState(0);
  // State for the currently active market action
  const [marketAction, setMarketAction] = useState<MarketAction>(null);

  // Sell button state
  const [sellButtonPos, setSellButtonPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Campaign state for carryover roster
  const [campaign, setCampaign] = useState<CampaignState>(() => {
    const saved = localStorage.getItem("dicechess_campaign_v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          level: parsed.level || 1,
          whiteRoster: parsed.whiteRoster || [],
          prayerDice: parsed.prayerDice || 2,
          unlockedItems:
            parsed.unlockedItems && Array.isArray(parsed.unlockedItems)
              ? parsed.unlockedItems
              : [],
          freeUnits: new Map(parsed.freeUnits || []),
          freeItems: new Map(parsed.freeItems || []),
        };
      } catch (e) {
        console.warn("Failed to parse saved campaign state:", e);
      }
    }
    return {
      level: 1,
      whiteRoster: [],
      prayerDice: 2,
      unlockedItems: [],
      freeUnits: new Map(),
      freeItems: new Map(),
    };
  });

  // Current level configuration (loaded asynchronously)
  const [currentLevelConfig, setCurrentLevelConfig] =
    useState<LevelConfig | null>(null);

  // Load level configuration when campaign level changes
  useEffect(() => {
    loadLevelConfig(campaign.level).then((config) => {
      setCurrentLevelConfig(config);
    });
  }, [campaign.level]);

  // Get current board size from level configuration
  const currentBoardSize = currentLevelConfig?.boardSize ?? 7;

  // Track items unlocked in this level
  const [thisLevelUnlockedItems, setThisLevelUnlockedItems] = useState<
    Exclude<Equip, undefined>[]
  >([]);

  // Track enemy pieces killed this level for ransom
  const [killedEnemyPieces, setKilledEnemyPieces] = useState<KilledPiece[]>([]);

  // Track if we should show the initial victory message or main content
  const [showVictoryDetails, setShowVictoryDetails] = useState(false);

  // Auto-transition from phrase to details after 2 seconds (only for wins)
  useEffect(() => {
    if (win === W && phrase && !showVictoryDetails) {
      const timer = setTimeout(() => {
        setShowVictoryDetails(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
    // For losses, show details immediately
    if (win === B) {
      setShowVictoryDetails(true);
    }
  }, [win, phrase, showVictoryDetails]);

  // Save campaign state to localStorage whenever it changes
  useEffect(() => {
    const serialized = {
      ...campaign,
      freeUnits: Array.from(campaign.freeUnits.entries()),
      freeItems: Array.from(campaign.freeItems.entries()),
    };
    localStorage.setItem("dicechess_campaign_v1", JSON.stringify(serialized));
  }, [campaign]);

  // Sync prayer dice state with campaign state
  useEffect(() => {
    setPrayerDice(campaign.prayerDice);
  }, [campaign.prayerDice]);

  const TMG = fastMode ? TIMING.fast : TIMING.normal;
  const PIECE_MOVE_MS = 150;
  const PIECE_MOVE_EASE = "ease-out";

  // --- Tooltip state ---
  const [tooltipText, setTooltipText] = useState<string | null>(null);
  const mousePos = useGlobalMousePos(!!tooltipText);
  const tooltip = tooltipText
    ? { text: tooltipText, x: mousePos.x, y: mousePos.y }
    : null;

  const showTooltip = (text: string) => {
    setTooltipText(text);
  };

  const hideTooltip = () => {
    setTooltipText(null);
  };

  // Moved check calculations before the effect that uses them
  const kW = useMemo(
    () => findK(Bstate, W, currentBoardSize),
    [Bstate, currentBoardSize]
  );
  const kB = useMemo(
    () => findK(Bstate, B, currentBoardSize),
    [Bstate, currentBoardSize]
  );
  const wChk = useMemo(
    () =>
      kW
        ? threatened(Bstate, Tstate, obstacles, { x: kW.x, y: kW.y }, B, currentBoardSize)
        : false,
    [Bstate, Tstate, obstacles, kW]
  );
  const bChk = useMemo(
    () =>
      kB
        ? threatened(Bstate, Tstate, obstacles, { x: kB.x, y: kB.y }, W, currentBoardSize)
        : false,
    [Bstate, Tstate, obstacles, kB]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (drag) {
        setDrag((d) =>
          d ? { ...d, clientX: e.clientX, clientY: e.clientY } : null
        );
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (drag && boardRef.current) {
        const boardRect = boardRef.current.getBoundingClientRect();
        const x = Math.floor((e.clientX - boardRect.left - 12 - 24) / 88);
        const y =
          currentBoardSize -
          1 -
          Math.floor((e.clientY - boardRect.top - 12) / 88);

        const isLegal = legal.some((m) => m.x === x && m.y === y);
        if (isLegal) {
          setSel(null);
          setLegal([]);
          perform(drag.from, { x, y }, false, true);
          setDrag(null); // Clear drag state after performing move
          return; // Prevent setDrag(null) below
        }
      }
      setDrag(null); // Clear drag on illegal move or drop outside
    };

    const onBlur = () => {
      setDrag(null); // Clear drag if window loses focus
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur); // Also clear drag if window loses focus
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [drag, legal, Bstate, Tstate]); // Added Bstate, Tstate as dependencies for perform closure

  // useEffect now depends on seed *and* level, init is passed unspentGold
  useEffect(() => {
    if (currentLevelConfig) {
      init(seed, campaign.level, unspentGold, currentLevelConfig);
    }
  }, [seed, campaign.level, unspentGold, currentLevelConfig]);

  // Keep ref in sync with state
  useEffect(() => {
    currentStoryCardRef.current = currentStoryCard;
  }, [currentStoryCard]);

  // Show story cards immediately when advancing to next level (skip intro popup)
  useEffect(() => {
    // Only show story cards if:
    // 1. We have story cards in the queue
    // 2. No current story card is showing
    // 3. Intro popup is not showing (campaign.level > 1 means we're past the first level)
    // 4. We're not showing the intro popup
    if (storyCardQueue.length > 0 && !currentStoryCard && !showIntro && campaign.level > 1) {
      setCurrentStoryCard(storyCardQueue[0]);
    }
  }, [storyCardQueue, currentStoryCard, showIntro, campaign.level]);

  useEffect(() => {
    sfx.muted = muted;
  }, [muted]);

  // Bot Turn Logic - Removed bChk from dependency array
  useEffect(() => {
    if (!win && turn === B && phase === "playing") {
      // Calculate speech bubble typing delay
      let speechDelay = 0;
      if (speechBubble && speechBubble.text) {
        // Strip ** markers to get actual character count
        const cleanText = speechBubble.text.replace(/\*\*/g, "");
        // 50ms per character + 500ms extra to let player read the completed bubble
        speechDelay = cleanText.length * 50 + 500;
      }

      const totalDelay = TMG.botThink + speechDelay;

      const t = setTimeout(() => {
        // Calculate bChk inside the effect if needed for immediate logic, or rely on the state update triggering re-render
        const isBlackInCheck = kB
          ? threatened(
              Bstate,
              Tstate,
              obstacles,
              { x: kB.x, y: kB.y },
              W,
              currentBoardSize
            )
          : false;

        const botBehavior = currentLevelConfig?.botBehavior || "balanced";

        const m = bot(
          Bstate,
          Tstate,
          obstacles,
          B,
          rngRef.current,
          currentBoardSize,
          botBehavior
        );
        if (!m) {
          // Check if king_escaped is enabled
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
          const kingEscapedEnabled = victoryConditions.includes("king_escaped");
          
          // Check if all black pieces are dead
          let allBlackPiecesDead = true;
          for (let y = 0; y < currentBoardSize; y++) {
            for (let x = 0; x < currentBoardSize; x++) {
              const piece = Bstate[y]?.[x];
              if (piece && piece.color === B) {
                allBlackPiecesDead = false;
                break;
              }
            }
            if (!allBlackPiecesDead) break;
          }
          
          // If king_escaped mode and all enemies wiped, give bonus but don't end game
          if (kingEscapedEnabled && allBlackPiecesDead && !isBlackInCheck) {
            sfx.purchase(); // Play a nice sound for the bonus
            setMarketPoints((prev) => prev + 40);
            setUnspentGold((prev) => prev + 40);
            setPhrase("Enemy wiped! +40g bonus");
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) {
                lastMove.notation += " (Enemy wiped! +40g)";
              }
              return newHistory;
            });
            // Continue the game - player still needs to reach the escape row
            // Set turn back to white so player can continue
            setTurn(W);
            return;
          }
          
          // If NOT king_escaped mode and all enemies are dead, player wins
          if (!kingEscapedEnabled && allBlackPiecesDead) {
            sfx.winCheckmate();
            setWin(W);
            handleLevelCompletion(W, Bstate);
            setPhrase("All enemies eliminated!");
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) {
                lastMove.notation += " (All enemies eliminated!)";
              }
              return newHistory;
            });
            return;
          }
          
          // If black is in check and has no moves → checkmate (game ends, player wins)
          if (isBlackInCheck) {
            sfx.winCheckmate();
            setWin(W); // Player wins if bot has no moves and is in check
            handleLevelCompletion(W, Bstate);
            setPhrase("King captured! Checkmate!");
            
            // Track King defeat for ransom
            if (kB) {
              setKilledEnemyPieces((prev) => [
                ...prev,
                { piece: kB.p, defeatType: "checkmate" },
              ]);
            }

            // Add '#' for checkmate
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) {
                lastMove.notation += "#";
              }
              return newHistory;
            });
            return;
          }
          
          // If black is NOT in check and has no moves → skip turn (continue game)
          setPhrase("Black skipped turn (no moves)");
          setMoveHistory((hist) => {
            const newHistory = [...hist];
            const lastMove = newHistory[newHistory.length - 1];
            if (lastMove) {
              // Only add skip notation if it's not already there
              if (!lastMove.notation.includes("(Skip)") && !lastMove.notation.includes("(Black skipped)")) {
                lastMove.notation += " (Skip)";
              }
            }
            return newHistory;
          });
          // Skip black's turn and continue with white
          setTurn(W);
          return;
        }
        perform(m.from, m.to, true);
      }, totalDelay);
      return () => clearTimeout(t);
    }
    // Dependencies now only include things that should trigger the bot's turn
  }, [turn, Bstate, Tstate, win, phase, TMG.botThink, kB, speechBubble]); // Added speechBubble dependency

  const vis = useMemo(
    () => visibility(Bstate, phase, currentBoardSize, currentLevelConfig?.fogRows ?? 2),
    [Bstate, phase, currentBoardSize, currentLevelConfig]
  );

  const startDrag = (e: React.MouseEvent, x: number, y: number) => {
    const p = Bstate[y]?.[x]; // Safe navigation
    if (
      !p ||
      p.color !== turn ||
      p.color !== W || // player can only drag white
      (p.stunnedForTurns && p.stunnedForTurns > 0) ||
      moveAnim ||
      fx ||
      phase !== "playing"
    )
      return;

    e.preventDefault(); // 👈 avoid click artifacts while dragging

    const tileEl = (e.target as HTMLElement).closest(".tile");
    if (!tileEl) return;
    const tileRect = tileEl.getBoundingClientRect();
    const offsetX = e.clientX - tileRect.left;
    const offsetY = e.clientY - tileRect.top;

    // Select piece so you get legal highlights & odds preview
    click(x, y);

    const colorKey = p.color as "w" | "b";
    // Check if GL has the type before accessing colorKey
    const pieceGlyphSet = GL[p.type as keyof typeof GL];
    const glyph =
      pieceGlyphSet && colorKey in pieceGlyphSet ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet] : "?";

    setDrag({
      id: p.id,
      from: { x, y },
      glyph: glyph,
      color: colorKey,
      equip: p.equip,
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX,
      offsetY,
    });
  };

  // Combat Animation Logic
  useEffect(() => {
    if (!fx) {
      if (
        phase !== "market" &&
        phase !== "playing" &&
        phase !== "awaiting_reroll" &&
        phase !== "awaiting_disguise_choice"
      ) {
        setPhase("playing");
      }
      return;
    }

    if (!fx.isReroll) {
      setRerollTarget(null);
    }

    setPhase("base");

    if (rerollTarget === "attacker") {
      if (fx.kind === "piece") setDispD(fx.d.total);
    } else if (rerollTarget === "defender") {
      setDispA(fx.a.total);
    } else {
      setDispA(null);
      setDispD(null);
    }

    const rollDuration = TMG.roll;
    const lingerDuration = TMG.linger;
    const modsDuration = TMG.mods;
    const totalDuration = TMG.total;

    const hasM =
      (fx.a.mods?.length || 0) > 0 ||
      (fx.kind === "piece" && (fx.d.mods?.length || 0) > 0);

    const t1 = setTimeout(() => {
      setDispA(fx.a.base);
      if (fx.kind === "piece") setDispD(fx.d.base);
      setPhase(hasM ? "mods" : "total");
    }, rollDuration + lingerDuration);

    const t2 = setTimeout(
      () => setPhase("total"),
      rollDuration + lingerDuration + (hasM ? modsDuration : 0)
    );
    const t3 = setTimeout(
      () => setPhase("winner"),
      rollDuration + lingerDuration + (hasM ? modsDuration : 0) + totalDuration
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [fx, TMG]);

  useEffect(() => {
    if (!fx || (phase !== "total" && phase !== "winner")) return;
    const tick = (
      s: number | null, // Allow null start value
      e: number,
      set: (n: number | null) => void,
      bump: (v: boolean) => void
    ) => {
      // If start value is null (e.g., from previous state), use the base value from fx
      const startVal = s ?? (set === setDispA ? fx.a.base : fx.d?.base ?? 0);
      if (startVal === null || typeof startVal === "undefined") return () => {}; // Safety check and return cleanup

      if (startVal === e) {
        bump(true);
        const tm = setTimeout(() => bump(false), 320);
        return () => clearTimeout(tm);
      }
      let v = startVal;
      const id = setInterval(() => {
        v += v < e ? 1 : -1;
        set(v);
        if (v === e) {
          clearInterval(id);
          bump(true);
          setTimeout(() => bump(false), 320);
        }
      }, 65);
      return () => clearInterval(id);
    };

    let c1 = () => {},
      c2 = () => {}; // Initialize cleanup functions

    if (rerollTarget !== "defender") {
      c1 = tick(dispA, fx.a.total, setDispA, setBumpA); // Pass current dispA
    } else {
      setBumpA(true);
      const tm = setTimeout(() => setBumpA(false), 320);
      c1 = () => clearTimeout(tm);
    }

    if (fx.kind === "piece") {
      if (rerollTarget !== "attacker") {
        c2 = tick(dispD, fx.d.total, setDispD, setBumpD); // Pass current dispD
      } else {
        setBumpD(true);
        const tm = setTimeout(() => setBumpD(false), 320);
        c2 = () => clearTimeout(tm);
      }
    }

    return () => {
      c1(); // Always call cleanup
      c2(); // Always call cleanup
    };
  }, [phase, fx, rerollTarget, dispA, dispD]); // Added rerollTarget, dispA, dispD dependencies

  useEffect(() => {
    if (speechBubble) {
      const timer = setTimeout(() => {
        setSpeechBubble(null);
      }, TMG.bubble); // Bubble visible for 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [speechBubble, TMG.bubble]);

  // Ref to track speech bubble state for timer closure
  const speechBubbleRef = useRef(speechBubble);
  useEffect(() => {
    speechBubbleRef.current = speechBubble;
  }, [speechBubble]);

  // Courtier speech timer - triggers independently from piece speech
  useEffect(() => {
    if (
      phase !== "playing" ||
      !currentLevelConfig?.courtierSpeechLines ||
      currentLevelConfig.courtierSpeechLines.length === 0 ||
      win
    ) {
      return; // Don't run during market, story, or after game ends
    }

    const speechChance = currentLevelConfig?.courtierSpeechChance ?? 0.3;
    const intervalConfig = currentLevelConfig?.courtierSpeechInterval ?? { min: 2000, max: 5000 };
    
    // Calculate random interval (either a fixed number or random between min/max)
    const getRandomInterval = (): number => {
      if (typeof intervalConfig === "number") {
        return intervalConfig;
      } else {
        const min = intervalConfig.min ?? 2000;
        const max = intervalConfig.max ?? 5000;
        return min + Math.random() * (max - min);
      }
    };

    let timeoutId: NodeJS.Timeout | null = null;
    let isActive = true;

    const scheduleNextCheck = () => {
      if (!isActive) return;
      
      const interval = getRandomInterval();
      timeoutId = setTimeout(() => {
        // Check if we're still in playing phase and should continue
        if (phase !== "playing" || win || !currentLevelConfig?.courtierSpeechLines) {
          isActive = false;
          return;
        }

        // Only trigger if there's no active speech bubble (don't interrupt piece speech)
        if (!speechBubbleRef.current) {
          const speakingCourtiers: { x: number; y: number; line: string }[] = [];
          obstacles.forEach((row, y) => {
            row.forEach((obs, x) => {
              if (obs === "courtier" && Math.random() < speechChance) {
                const randomLine = currentLevelConfig.courtierSpeechLines![Math.floor(Math.random() * currentLevelConfig.courtierSpeechLines!.length)];
                speakingCourtiers.push({ x, y, line: randomLine });
              }
            });
          });
          
          // Show speech bubbles for all courtiers that rolled successfully
          // Queue them sequentially so they appear one after another
          if (speakingCourtiers.length > 0) {
            speakingCourtiers.forEach((courtier, idx) => {
              setTimeout(() => {
                // Double-check there's still no piece speech bubble before showing
                if (!speechBubbleRef.current) {
                  setSpeechBubble({
                    text: courtier.line,
                    id: Date.now() + idx,
                    targetId: `courtier-${courtier.x}-${courtier.y}`
                  });
                  setTimeout(() => setSpeechBubble(null), 2000);
                }
              }, idx * 2500); // Stagger by 2.5 seconds each
            });
          }
        }
        
        // Schedule next check
        scheduleNextCheck();
      }, interval);
    };

    // Start the first check
    scheduleNextCheck();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [phase, currentLevelConfig, obstacles, win]);

  // safety: hide tooltip whenever we leave Market or start an action
  useEffect(() => {
    if (phase !== "market") hideTooltip();
  }, [phase]);
  useEffect(() => {
    if (marketAction) hideTooltip();
  }, [marketAction]);

  useEffect(() => {
    if (phase === "awaiting_reroll" && rerollState && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const top = boardRect.top + boardRect.height / 2;
      const left = boardRect.left + boardRect.width / 2;
      setRerollPopupPosition({ top, left });
    } else {
      setRerollPopupPosition(null);
    }
  }, [phase, rerollState]);

  useEffect(() => {
    if (
      phase === "awaiting_disguise_choice" &&
      disguisePopupState &&
      boardRef.current
    ) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const { x, y } = disguisePopupState;
      const visualY = currentBoardSize - 1 - y;
      const top = boardRect.top + 12 + visualY * 88 + 88 / 2;
      const left = boardRect.left + 12 + 24 + x * 88 + 88 / 2;
      setDisguisePopupPosition({ top, left });
    } else {
      setDisguisePopupPosition(null);
    }
  }, [phase, disguisePopupState]);

  useEffect(() => {
    if (namingState && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const { x, y } = namingState;
      const visualY = currentBoardSize - 1 - y;
      const top = boardRect.top + 12 + visualY * 88 + 60; // Position at the feet of the piece
      const left = boardRect.left + 12 + 24 + x * 88 + 44;
      setNameInputPosition({ top, left });
    } else {
      setNameInputPosition(null);
    }
  }, [namingState]);

  useEffect(() => {
    // When the game starts, always clear any pending market action.
    if (phase === "playing") {
      setMarketAction(null);
    }
  }, [phase]);

  // Campaign level completion handler
  function handleLevelCompletion(winner: Color, board: Board) {
    if (winner === W) {
      // Player won - compute survivors and update campaign state
      const survivors: Piece[] = [];
      for (let y = 0; y < currentBoardSize; y++) {
        for (let x = 0; x < currentBoardSize; x++) {
          const piece = board[y][x];
          if (piece && piece.color === W) {
            survivors.push(serializePiece(piece));
          }
        }
      }

      setCampaign((prev) => ({
        level: prev.level, // Don't increment level yet - let victory screen show first
        whiteRoster: survivors,
        prayerDice: prev.prayerDice, // Keep current prayer dice count
        unlockedItems: prev.unlockedItems || [], // Preserve unlocked items
        freeUnits: prev.freeUnits || new Map(), // Preserve free units
        freeItems: prev.freeItems || new Map(), // Preserve free items
      }));
    }
    // If player lost, don't update campaign state (they'll restart from current level)
  }

  // Sell piece function
  function sellPiece(x: number, y: number) {
    const piece = Bstate[y]?.[x];
    if (!piece || piece.color !== W || phase !== "market" || piece.type === "K" || currentLevelConfig?.marketEnabled === false)
      return; // Prevent selling King or when market is disabled

    const sellValue = getSellValue(piece);
    setMarketPoints((prev) => prev + sellValue);

    // Play cash out sound
    sfx.cashOut();

    // Remove the piece from the board
    const newBoard = cloneB(Bstate);
    newBoard[y][x] = null;
    setB(newBoard);

    // Hide sell button
    setSellButtonPos(null);

    // Update campaign roster if this piece was in it
    setCampaign((prev) => ({
      ...prev,
      whiteRoster: prev.whiteRoster.filter((p) => p.id !== piece.id),
    }));
  }

  // init now accepts currentLevel and currentUnspentGold
  // Helper function to place pieces on a row, avoiding obstacles
  function placePiecesAvoidingObstacles(
    board: Board,
    obstacles: Obstacle,
    pieces: (Piece | null)[],
    row: number,
    boardSize: number
  ) {
    // First pass: place pieces in their intended positions if not blocked by obstacles or other pieces
    for (let x = 0; x < boardSize; x++) {
      if (pieces[x] && board[row]?.[x] === null && obstacles[row]?.[x] === "none") {
        board[row][x] = pieces[x];
        pieces[x] = null; // Mark as placed
      }
    }

    // Second pass: find alternative positions for pieces that couldn't be placed
    const unplacedPieces = pieces.filter((p) => p !== null) as Piece[];

    // Sort unplaced pieces to prioritize King placement (and named/preconfigured pieces)
    unplacedPieces.sort((a, b) => {
      if (a.type === "K") return -1; // King gets highest priority
      if (b.type === "K") return 1;
      if (a.isPreconfigured && !b.isPreconfigured) return -1; // Preconfigured pieces next
      if (!a.isPreconfigured && b.isPreconfigured) return 1;
      return 0; // Keep other pieces in original order
    });

    // Count available slots on the row (no pieces AND no obstacles)
    let availableSlots = 0;
    for (let x = 0; x < boardSize; x++) {
      if (board[row]?.[x] === null && obstacles[row]?.[x] === "none") availableSlots++;
    }

    // If we have more unplaced pieces than slots, we need to sacrifice lower-priority pieces
    const piecesToPlace = unplacedPieces.slice(0, availableSlots);

    // Place pieces in available slots (King and preconfigured pieces will be placed first due to sorting)
    for (const piece of piecesToPlace) {
      for (let x = 0; x < boardSize; x++) {
        if (board[row]?.[x] === null && obstacles[row]?.[x] === "none") {
          board[row][x] = piece;
          break; // Move to next piece
        }
      }
    }
  }

  // Handle intro popup completion
  function handleIntroComplete() {
    setShowIntro(false);

    // Check if there are story cards to show
    if (storyCardQueue.length > 0) {
      setCurrentStoryCard(storyCardQueue[0]);
    }
    // If no story cards, game proceeds to market normally
  }

  // Handle story outcome acknowledgment
  function handleOutcomeAcknowledged() {
    const nextCard = storyOutcome?.nextCard;
    setStoryOutcome(null);

    // If there's a next card, show it; otherwise show transition then go to market or playing
    if (nextCard) {
      setCurrentStoryCard(nextCard);
    } else {
      setShowTransition(true);
      // Hide story card first
      setCurrentStoryCard(null);
      setStoryCardQueue([]);

      // Since banners start covering the screen, we can change phase immediately
      // The transition will reveal it when banners slide out
      // Always go to market phase to show victory conditions popup
      // Market component will be hidden if marketEnabled is false
      setPhase("market");

      // Medieval transition sound via WebAudio (match 2.5s animation)
      try {
        const Ctx: any =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const now = ctx.currentTime;
          const horn = ctx.createOscillator();
          const g1 = ctx.createGain();
          horn.type = "sawtooth";
          horn.frequency.setValueAtTime(420, now);
          g1.gain.setValueAtTime(0.0001, now);
          g1.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
          g1.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
          horn.connect(g1);
          g1.connect(ctx.destination);
          horn.start(now);
          horn.stop(now + 2.4);
        }
      } catch (e) {}

      // After full animation completes (2.5s), hide transition to reveal market screen
      setTimeout(() => {
        setShowTransition(false);
      }, 2500);
    }
  }

  // Handle story card choice events
  const handleStoryEvents = useCallback(
    (events: StoryEvent[]) => {
      const outcomes: OutcomeData[] = [];
      let nextCard: StoryCardType | undefined = undefined;
      let shouldStartBattle = false;
      
      // Accumulate all campaign changes to apply in one batch
      let campaignUpdates: Partial<CampaignState & { pendingEnemyPawns: number; pendingEnemyItemAssignments: Array<{ item: string; count: number }> }> = {};
      
      // Track free units to combine consecutive events of the same type
      let pendingFreeUnit: { pieceType: PieceType; count: number } | null = null;

      for (const event of events) {
        switch (event.type) {
          case "next_card":
            // Find the next card
            nextCard = currentLevelConfig?.storyCards?.find(
              (card) => card.id === event.cardId
            );
            break;

          case "give_gold":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            setMarketPoints((prev) => prev + event.amount);
            outcomes.push({
              message: `+${event.amount} Gold`,
              glyph: "💰",
              color: "text-yellow-100",
              bgColor: "bg-yellow-900",
              borderColor: "border-yellow-500",
            });
            break;

          case "remove_gold":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            setMarketPoints((prev) => Math.max(0, prev - event.amount));
            outcomes.push({
              message: `-${event.amount} Gold`,
              glyph: "💸",
              color: "text-red-100",
              bgColor: "bg-red-900",
              borderColor: "border-red-500",
            });
            break;

          case "give_prayer_die":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.prayerDice = (campaignUpdates.prayerDice ?? campaign.prayerDice) + 1;
            setPrayerDice((prev) => prev + 1);
            outcomes.push({
              message: "+1 Prayer Die",
              glyph: "🙏",
              color: "text-purple-100",
              bgColor: "bg-purple-900",
              borderColor: "border-purple-500",
            });
            break;

          case "remove_prayer_die":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.prayerDice = Math.max(0, (campaignUpdates.prayerDice ?? campaign.prayerDice) - 1);
            setPrayerDice((prev) => Math.max(0, prev - 1));
            outcomes.push({
              message: "-1 Prayer Die",
              glyph: "🙏",
              color: "text-purple-100",
              bgColor: "bg-purple-900",
              borderColor: "border-purple-500",
            });
            break;

          case "unlock_item":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.unlockedItems = [
              ...(campaignUpdates.unlockedItems ?? campaign.unlockedItems),
              event.item
            ];
            outcomes.push({
              message: `Unlocked ${event.item}!`,
              glyph: equipIcon(event.item) || "🔓",
              color: "text-orange-100",
              bgColor: "bg-orange-900",
              borderColor: "border-orange-500",
            });
            break;

          case "give_free_unit":
            {
              const newFreeUnits = new Map(campaignUpdates.freeUnits ?? campaign.freeUnits);
              const currentCount = newFreeUnits.get(event.pieceType) || 0;
              newFreeUnits.set(event.pieceType, currentCount + 1);
              campaignUpdates.freeUnits = newFreeUnits;
              
              // Accumulate consecutive free units of the same type
              if (pendingFreeUnit && pendingFreeUnit.pieceType === event.pieceType) {
                pendingFreeUnit.count++;
              } else {
                // If there's a pending unit of a different type, flush it first
                if (pendingFreeUnit) {
                  outcomes.push({
                    message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                    glyph: "🍀",
                    color: "text-green-100",
                    bgColor: "bg-green-900",
                    borderColor: "border-green-500",
                  });
                }
                pendingFreeUnit = { pieceType: event.pieceType, count: 1 };
              }
            }
            break;

          case "give_free_item":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            {
              const count = event.count ?? 1;
              const newFreeItems = new Map(campaignUpdates.freeItems ?? campaign.freeItems);
              const currentCount = newFreeItems.get(event.item) || 0;
              newFreeItems.set(event.item, currentCount + count);
              campaignUpdates.freeItems = newFreeItems;
              const itemIcon = equipIcon(event.item);
              outcomes.push({
                message: `x${count} ${itemIcon} Free ${event.item}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
            }
            break;

          case "increase_prayer_cost":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.prayerDiceCost = 100;
            outcomes.push({
              message: "Prayer Dice now cost 100g",
              glyph: "💎",
              color: "text-purple-100",
              bgColor: "bg-purple-900",
              borderColor: "border-purple-500",
            });
            break;

          case "attach_item_to_units":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            
            // Determine if we're targeting player or enemy
            const targetColor = event.target === "player" ? W : B;
            
            // If targeting player and they're not on the board yet (story phase),
            // attach items to the roster instead
            if (event.target === "player" && campaign.whiteRoster && campaign.whiteRoster.length > 0) {
              // Count how many player pieces are currently on the board
              let playerPiecesOnBoard = 0;
              for (let y = 0; y < currentBoardSize; y++) {
                for (let x = 0; x < currentBoardSize; x++) {
                  if (Bstate[y]?.[x]?.color === W) {
                    playerPiecesOnBoard++;
                  }
                }
              }
              
              // If no player pieces on board, we're in story phase - modify roster
              if (playerPiecesOnBoard === 0) {
                const updatedRoster = [...campaign.whiteRoster];
                // Randomly select pieces from roster to attach items to
                const indicesToModify = updatedRoster
                  .map((_, idx) => idx)
                  .sort(() => rngRef.current() - 0.5)
                  .slice(0, Math.min(event.count, updatedRoster.length));
                
                indicesToModify.forEach((idx) => {
                  updatedRoster[idx] = { ...updatedRoster[idx], equip: event.item };
                });
                
                campaignUpdates.whiteRoster = updatedRoster;
                
                const itemEmoji = equipIcon(event.item);
                const isNegativeItem = event.item === "curse" || event.item === "skull";
                const itemName = event.item === "curse" ? "Cursed" : event.item.charAt(0).toUpperCase() + event.item.slice(1);
                const glyphEmoji = event.item === "curse" ? itemEmoji : (event.item === "skull" ? "💀" : "✨");
                outcomes.push({
                  message: `${event.count} of your units are ${itemName}!`,
                  glyph: glyphEmoji,
                  color: isNegativeItem ? "text-red-100" : "text-blue-100",
                  bgColor: isNegativeItem ? "bg-red-900" : "bg-blue-900",
                  borderColor: isNegativeItem ? "border-red-500" : "border-blue-500",
                });
                break;
              }
            }
            
            // Otherwise, use the existing board-based logic (for enemy or in-battle player targeting)
            const targetPieces: { x: number; y: number; piece: Piece }[] = [];
            
            // Find all pieces of the target color on the board
            for (let y = 0; y < currentBoardSize; y++) {
              for (let x = 0; x < currentBoardSize; x++) {
                const piece = Bstate[y]?.[x];
                if (piece && piece.color === targetColor) {
                  targetPieces.push({ x, y, piece });
                }
              }
            }

            // Randomly select pieces to attach items to
            const piecesToModify = targetPieces
              .sort(() => rngRef.current() - 0.5)
              .slice(0, Math.min(event.count, targetPieces.length));

            // Attach the item to selected pieces
            const newBoard = Bstate.map(row => row.slice()) as Board;
            piecesToModify.forEach(({ x, y, piece }) => {
              if (newBoard[y]?.[x]) {
                newBoard[y][x] = { ...piece, equip: event.item };
              }
            });
            setB(newBoard);

            const itemEmoji = equipIcon(event.item);
            const isNegativeItem = event.item === "curse" || event.item === "skull";
            const itemName = event.item === "curse" ? "Cursed" : event.item.charAt(0).toUpperCase() + event.item.slice(1);
            // Use item emoji for curse, skull emoji for skull item, or sparkle for others
            const glyphEmoji = event.item === "curse" ? itemEmoji : (event.item === "skull" ? "💀" : "✨");
            outcomes.push({
              message: event.target === "player"
                ? `${event.count} of your units are ${itemName}!`
                : `${event.count} enemy units are ${itemName}!`,
              glyph: glyphEmoji,
              color: isNegativeItem ? "text-red-100" : "text-blue-100",
              bgColor: isNegativeItem ? "bg-red-900" : "bg-blue-900",
              borderColor: isNegativeItem ? "border-red-500" : "border-blue-500",
            });
            break;

          case "spawn_enemy_pawns":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            // Store the count to spawn when battle starts
            campaignUpdates.pendingEnemyPawns = 
              (campaignUpdates.pendingEnemyPawns ?? ((campaign as any).pendingEnemyPawns || 0)) + event.count;
            outcomes.push({
              message: "Extra enemies added",
              glyph: "⚔️",
              color: "text-red-100",
              bgColor: "bg-red-900",
              borderColor: "border-red-500",
            });
            break;

          case "assign_item_to_enemy":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            // Store to process after board is initialized
            campaignUpdates.pendingEnemyItemAssignments = [
              ...(campaignUpdates.pendingEnemyItemAssignments ?? ((campaign as any).pendingEnemyItemAssignments || [])),
              { item: event.item, count: event.count }
            ];
            outcomes.push({
              message: `Enemy equips ${event.count} ${event.item === "bow" ? "🏹" : "💰"}`,
              glyph: event.item === "bow" ? "🏹" : "💰",
              color: "text-orange-100",
              bgColor: "bg-orange-900",
              borderColor: "border-orange-500",
            });
            break;

          case "give_item":
          case "give_unit":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            // These will be handled when the battle starts (adds to initial boards)
            outcomes.push({
              message: event.type === "give_item" 
                ? `Item granted to ${event.target}` 
                : `Unit granted to ${event.target}`,
              glyph: "⚔️",
              color: "text-amber-100",
              bgColor: "bg-amber-900",
              borderColor: "border-amber-600",
            });
            break;

          case "start_battle":
            shouldStartBattle = true;
            break;
        }
      }
      
      // Flush any pending free unit at the end
      if (pendingFreeUnit) {
        outcomes.push({
          message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
          glyph: "🍀",
          color: "text-green-100",
          bgColor: "bg-green-900",
          borderColor: "border-green-500",
        });
      }
      
      // Apply all campaign updates in one batch to avoid race conditions
      if (Object.keys(campaignUpdates).length > 0) {
        setCampaign((prev) => ({ ...prev, ...campaignUpdates }));
      }

      // If there are outcomes, show them
      if (outcomes.length > 0) {
        // If there's a nextCard, that's the card we want to display WITH outcomes
        // We set it as lastCard so it's displayed, and set nextCard to undefined
        // since we've already "arrived" at that card
        const cardToDisplay = nextCard || currentStoryCardRef.current;
        
        // Hide current card
        setCurrentStoryCard(null);
        
        setStoryOutcome({
          outcomes,
          nextCard: undefined, // Already showing the destination card, no further transition needed
          lastCard: cardToDisplay || undefined,
        });
      } else {
        // No outcome to show, proceed immediately
        if (nextCard) {
          // Directly transition to next card without clearing
          setCurrentStoryCard(nextCard);
        } else if (shouldStartBattle) {
          // Clear card and go to market
          setCurrentStoryCard(null);
          setStoryCardQueue([]);
          // Always go to market phase to show victory conditions popup
          // Market component will be hidden if marketEnabled is false
          setPhase("market");
        }
      }
      
      // If battle should start, trigger re-init to process pending events
      if (shouldStartBattle) {
        setNeedsReinit(true);
      }
    },
    [campaign.level, currentLevelConfig, Bstate, currentBoardSize]
  );
  
  // Re-initialize board when pending events need to be processed
  useEffect(() => {
    if (needsReinit && currentLevelConfig) {
      // Only call init if there are actually pending events in the campaign state
      // This ensures we wait for the campaign state to be updated before initializing
      const hasPendingEvents = (campaign as any).pendingEnemyPawns || (campaign as any).pendingEnemyItemAssignments;
      if (hasPendingEvents) {
        init(seed, campaign.level, unspentGold, currentLevelConfig);
        setNeedsReinit(false);
      }
    }
  }, [needsReinit, campaign]);

  function init(
    s: string,
    currentLevel: number,
    currentUnspentGold: number,
    levelConfig: LevelConfig
  ) {
    const r = rngFrom(s + currentLevel); // Use level in seed for variation
    rngRef.current = r;

    // Get level configuration first to get board size
    const boardSize = levelConfig.boardSize;

    const B0 = Array.from({ length: boardSize }, () =>
      Array(boardSize).fill(null)
    ) as Board;
    const T0 = emptyTerrain(boardSize);
    const O0 = emptyObstacles(boardSize);

    // Check if king_escaped is enabled - if so, skip terrain on escape row (top row)
    const victoryConditions = levelConfig.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
    const kingEscapedEnabled = victoryConditions.includes("king_escaped");
    const escapeRow = kingEscapedEnabled ? boardSize - 1 : undefined;

    placeFeatures(B0, T0, O0, r, boardSize, levelConfig.terrainMatrix, escapeRow, levelConfig.randomTerrainPool);

    // Use level configuration - separate gold pools if specified
    // If specific gold pools aren't set, fall back to legacy enemyArmyGold/playerArmyGold, or default to 0
    const enemyPieceGold = levelConfig.enemyPieceGold ?? levelConfig.enemyArmyGold ?? 0;
    const playerPieceGold = levelConfig.playerPieceGold ?? levelConfig.playerArmyGold ?? 0;
    const enemyEquipmentGold = levelConfig.enemyEquipmentGold ?? levelConfig.enemyArmyGold ?? 0;
    const playerEquipmentGold = levelConfig.playerEquipmentGold ?? levelConfig.playerArmyGold ?? 0;

    // Campaign logic: handle white army based on level and survivors
    if (campaign.level <= 1 || campaign.whiteRoster.length === 0) {
      // Level 1 or no survivors: generate fresh white army (use playerPieceGold from config)
      // Convert string array to object array if needed for backward compatibility
      const rawGuaranteedWhite = levelConfig.guaranteedPieces?.white || [];
      const guaranteedWhitePieces = rawGuaranteedWhite.map(item => 
        typeof item === 'string' ? { type: item as PieceType } : item
      );
      const w = build(
        W,
        r,
        playerPieceGold,
        true,
        levelConfig.availableItems.whiteRandomization,
        boardSize,
        levelConfig.namedWhitePieces,
        levelConfig.whiteKingName,
        B0, // Pass board to count available slots
        0, // White back rank
        1, // White front rank
        false, // Don't skip King for white
        [], // No guaranteed items for white
        levelConfig.randomizationPieces?.white, // Allowed piece types for white randomization
        guaranteedWhitePieces, // Guaranteed pieces for white
        playerEquipmentGold, // Equipment gold for white
        O0, // Obstacles grid to check blocked slots
        levelConfig.playerPawnBudget // Pawn budget percentage for white
      );
      // Place white pieces, avoiding obstacles
      placePiecesAvoidingObstacles(B0, O0, w.back, 0, boardSize);
      placePiecesAvoidingObstacles(B0, O0, w.front, 1, boardSize);
      // After placing, update campaign.whiteRoster with all current white pieces
      const allWhitePieces: Piece[] = [];
      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          const piece = B0[y][x];
          if (piece && piece.color === W) {
            allWhitePieces.push(piece);
          }
        }
      }
      setCampaign((prev) => ({ ...prev, whiteRoster: allWhitePieces }));
    } else {
      // Level 2+: Hybrid approach - place survivors, then add guaranteed pieces, then random pieces
      
      // Step 1: Place carried over survivors first
      const deserializedRoster = campaign.whiteRoster.map(deserializePiece);
      placeRoster(B0, O0, deserializedRoster, boardSize);
      
      // Step 1.5: Update speech lines and properties of existing roster pieces from namedWhitePieces
      // This allows level designers to add new speech lines without creating duplicate pieces
      if (levelConfig.namedWhitePieces && levelConfig.namedWhitePieces.length > 0) {
        for (const namedPiece of levelConfig.namedWhitePieces) {
          // Find matching piece on the board (by name and type)
          let foundMatch = false;
          for (let y = 0; y < boardSize && !foundMatch; y++) {
            for (let x = 0; x < boardSize && !foundMatch; x++) {
              const boardPiece = B0[y][x];
              if (boardPiece && 
                  boardPiece.color === W && 
                  boardPiece.type === namedPiece.type && 
                  boardPiece.name === namedPiece.name) {
                // Found a match - update its properties
                if (namedPiece.speechLines) {
                  boardPiece.speechLines = namedPiece.speechLines;
                }
                if (namedPiece.equip && !boardPiece.equip) {
                  // Only add equipment if the piece doesn't already have any
                  boardPiece.equip = namedPiece.equip;
                }
                foundMatch = true;
              }
            }
          }
        }
      }
      
      // Step 2: Filter out namedWhitePieces that already exist in roster (to avoid duplicates)
      const namedPiecesToAdd = levelConfig.namedWhitePieces?.filter(namedPiece => {
        // Check if this named piece already exists on the board
        for (let y = 0; y < boardSize; y++) {
          for (let x = 0; x < boardSize; x++) {
            const boardPiece = B0[y][x];
            if (boardPiece && 
                boardPiece.color === W && 
                boardPiece.type === namedPiece.type && 
                boardPiece.name === namedPiece.name) {
              return false; // Already exists, don't add
            }
          }
        }
        return true; // Doesn't exist, add it
      }) || [];
      
      // Step 3: Add guaranteed pieces from level config (if any)
      const rawGuaranteedWhite = levelConfig.guaranteedPieces?.white || [];
      const guaranteedWhitePieces = rawGuaranteedWhite.map(item => 
        typeof item === 'string' ? { type: item as PieceType } : item
      );
      
      if (guaranteedWhitePieces.length > 0 || playerPieceGold > 0 || namedPiecesToAdd.length > 0) {
        // Generate guaranteed pieces and random pieces with remaining budget
        const w = build(
          W,
          r,
          playerPieceGold, // Use full playerPieceGold for random generation
          true,
          levelConfig.availableItems.whiteRandomization,
          boardSize,
          namedPiecesToAdd, // Only add named pieces that don't already exist
          undefined, // No custom king name (King already exists from survivors)
          B0, // Pass board to count available slots
          0, // White back rank
          1, // White front rank
          true, // Skip King generation (King already exists from survivors)
          [], // No guaranteed items for white
          levelConfig.randomizationPieces?.white, // Allowed piece types for white randomization
          guaranteedWhitePieces, // Guaranteed pieces to add
          playerEquipmentGold, // Equipment gold for white
          O0, // Obstacles grid to check blocked slots
          levelConfig.playerPawnBudget // Pawn budget percentage for white
        );
        
        // Place the new pieces (back rank and front rank)
        placePiecesAvoidingObstacles(B0, O0, w.back, 0, boardSize);
        placePiecesAvoidingObstacles(B0, O0, w.front, 1, boardSize);
      }
      
      // Update campaign roster with all current white pieces (survivors + new pieces)
      const allWhitePieces: Piece[] = [];
      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          const piece = B0[y][x];
          if (piece && piece.color === W) {
            allWhitePieces.push(piece);
          }
        }
      }
      setCampaign((prev) => ({ ...prev, whiteRoster: allWhitePieces }));
    }

    // Black army: always generate fresh each level
    // Check if king_escaped is the ONLY victory condition
    const kingEscapedOnly = victoryConditions.length === 1 && victoryConditions[0] === "king_escaped";
    
    // Check for pending items to add to black item pool (from story events)
    const pendingAssignments = (campaign as any).pendingEnemyItemAssignments || [];
    let blackItemPool = [...(levelConfig.availableItems.blackRandomization || [])];
    
    // Extract guaranteed items that MUST be equipped
    const guaranteedItems: Exclude<Equip, undefined>[] = [];
    for (const assignment of pendingAssignments) {
      for (let i = 0; i < assignment.count; i++) {
        guaranteedItems.push(assignment.item);
      }
    }
    
    // Check for pending pawns (from story events) - add them to guaranteed pieces
    const pendingPawns = (campaign as any).pendingEnemyPawns || 0;
    // Convert string array to object array if needed for backward compatibility
    const rawGuaranteedBlack = levelConfig.guaranteedPieces?.black || [];
    const guaranteedBlackPieces = rawGuaranteedBlack.map(item => 
      typeof item === 'string' ? { type: item as PieceType } : item
    );
    
    // Add pending pawns from story events as guaranteed pieces
    for (let i = 0; i < pendingPawns; i++) {
      guaranteedBlackPieces.push({ type: "P" });
    }
    
    const bl = build(
      B,
      r,
      enemyPieceGold,
      false,
      blackItemPool, // Regular randomization pool
      boardSize,
      levelConfig.namedBlackPieces,
      undefined, // No custom king name for black (optional for future)
      B0, // Pass board to count available slots
      boardSize - 1, // Black back rank
      boardSize - 2, // Black front rank
      kingEscapedOnly, // Pass flag to skip black King
      guaranteedItems, // Guaranteed items that MUST be equipped
      levelConfig.randomizationPieces?.black, // Allowed piece types for black randomization
      guaranteedBlackPieces, // Guaranteed pieces for black (including pending pawns)
      enemyEquipmentGold, // Equipment gold for black
      O0, // Obstacles grid to check blocked slots
      levelConfig.enemyPawnBudget // Pawn budget percentage for black
    );
    
    // Place black pieces, avoiding obstacles
    placePiecesAvoidingObstacles(B0, O0, bl.back, boardSize - 1, boardSize);
    placePiecesAvoidingObstacles(B0, O0, bl.front, boardSize - 2, boardSize);

    // Clear pending events after processing
    setCampaign((prev) => {
      const newCampaign = { ...prev };
      delete (newCampaign as any).pendingEnemyPawns;
      delete (newCampaign as any).pendingEnemyItemAssignments;
      return newCampaign;
    });
    
    setB(B0);
    setT(T0);
    setObstacles(O0);
    setTurn(W);
    setSel(null);
    setLegal([]);
    setWin(null);
    setPhrase(null);
    setFx(null);

    // Don't show story cards yet - wait for intro popup to be dismissed
    // Story cards will be shown after intro via handleIntroComplete
    setCurrentStoryCard(null);
    setStoryCardQueue(levelConfig.storyCards || []);
    // Default phase: market (will show victory conditions popup)
    // Market component will be hidden if marketEnabled is false (will be overridden if story cards exist)
    setPhase("market");

    // Set starting gold with carry-over (level-specific starting gold + unspent gold from previous level)
    setMarketPoints(levelConfig.startingGold + currentUnspentGold);
    setMarketAction(null);
    // Prayer dice are now managed by campaign state - don't reset them here
    setPrayerDice(campaign.prayerDice); // Set prayer dice from campaign state
    setRerollState(null);
    setDisguisePopupState(null);
    setDestroyedPieceIds([]);
    setFailedAttackId(null);
    setLastMove(null);
    setMoveHistory([]);
    setThisLevelUnlockedItems([]); // Reset unlocked items for new level
    setKilledEnemyPieces([]); // Reset killed enemies for new level
    setShowVictoryDetails(false); // Reset victory details for new level
  }

  function click(x: number, y: number) {
    console.log("[CLICK] Clicked at coordinates:", { x, y, boardSize: currentBoardSize });
    if (drag) return;
    if (phase === "market") {
      const B1 = cloneB(Bstate);
      let actionCompleted = false;

      if (marketAction?.type === "piece") {
        if (y <= 1 && !B1[y]?.[x] && obstacles[y]?.[x] === "none") {
          // Safe navigation
          // Valid placement (no piece and no obstacle)
          sfx.deploy();
          const newPieceId = `${W}${marketAction.name}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          B1[y][x] = {
            id: newPieceId,
            type: marketAction.name as PieceType,
            color: W,
          };
          setB(B1);
          
          // Deduct gold or consume free unit
          if (marketAction.isFree) {
            // Consume the free unit
            setCampaign((prev) => {
              const newFreeUnits = new Map(prev.freeUnits);
              const currentCount = newFreeUnits.get(marketAction.name as PieceType) || 0;
              if (currentCount > 1) {
                newFreeUnits.set(marketAction.name as PieceType, currentCount - 1);
              } else {
                newFreeUnits.delete(marketAction.name as PieceType);
              }
              return { ...prev, freeUnits: newFreeUnits };
            });
          } else {
            setMarketPoints(
              prev => prev - (VAL[marketAction.name as keyof typeof VAL] || 10)
            );
          }
          
          actionCompleted = true;
          setNamingState({ id: newPieceId, x, y });
          setMarketAction(null); // Clear action to prevent multiple placements
        }
      } else if (marketAction?.type === "item") {
        const piece = B1[y]?.[x]; // Safe navigation
        // Check if the piece exists, is white, doesn't have an equip, and is NOT a King trying to get Disguise
        if (
          piece &&
          piece.color === W &&
          !piece.equip &&
          !(piece.type === "K" && marketAction.name === "disguise")
        ) {
          sfx.equip();
          if (
            marketAction.name === "disguise" &&
            piece.type !== "P" // Already checked King above
          ) {
            piece.originalType = piece.type;
            piece.type = "P";
            piece.equip = marketAction.name;
          } else {
            // Handle non-disguise items or disguise for pawns
            piece.equip = marketAction.name;
          }
          setB(B1);
          
          // Deduct gold or consume free item
          if (marketAction.isFree) {
            // Consume the free item
            setCampaign((prev) => {
              const newFreeItems = new Map(prev.freeItems);
              const currentCount = newFreeItems.get(marketAction.name) || 0;
              if (currentCount > 1) {
                newFreeItems.set(marketAction.name, currentCount - 1);
              } else {
                newFreeItems.delete(marketAction.name);
              }
              return { ...prev, freeItems: newFreeItems };
            });
          } else {
            setMarketPoints(prev => prev - ITEM_COSTS[marketAction.name]);
          }
          
          actionCompleted = true;
        }
      }

      if (actionCompleted) {
        setMarketAction(null);
      } else if (marketAction) {
        // If an action was selected but the click was invalid, cancel the action.
        setMarketAction(null);
      }
      return;
    }

    if (
      fx ||
      win ||
      phase === "awaiting_reroll" ||
      phase === "awaiting_disguise_choice"
    )
      return;
    const p = Bstate[y]?.[x]; // Safe navigation
    if (sel && legal.some((s) => s.x === x && s.y === y)) {
      perform(sel, { x, y }, false);
      setSel(null);
      setLegal([]);
      return;
    }
    if (
      !p ||
      p.color !== turn ||
      p.color !== W ||
      (p.stunnedForTurns && p.stunnedForTurns > 0)
    ) {
      setSel(null);
      setLegal([]);
      return;
    }

    if (p.equip === "disguise") {
      setPhase("awaiting_disguise_choice");
      setDisguisePopupState({ x, y });
      return;
    }

    setSel({ x, y });
    setLegal(moves(Bstate, Tstate, obstacles, x, y, currentBoardSize));
  }

  const handleNameConfirm = (name: string) => {
    if (!namingState) return;
    const { id } = namingState;

    setB((currentBoard) => {
      const newBoard = cloneB(currentBoard);
      const pieceLocation = findPieceById(newBoard, id, currentBoardSize);
      if (pieceLocation) {
        const piece = newBoard[pieceLocation.y]?.[pieceLocation.x]; // Safe navigation
        if (piece) {
          piece.name = name;
        }
      }
      return newBoard;
    });
    setNamingState(null);
  };

  const handleNameCancel = () => {
    setNamingState(null);
  };

  function perform(
    from: { x: number; y: number },
    to: { x: number; y: number },
    isBot: boolean,
    isDragMove = false
  ) {
    console.log("[PERFORM] Move requested:", { from, to, isBot, currentBoardSize });
    setDrag(null);
    if (fx || win || moveAnim) return;
    const p = Bstate[from.y]?.[from.x]; // Safe navigation
    console.log("[PERFORM] Piece at from:", p);
    if (!p) return;
    const t = Bstate[to.y]?.[to.x]; // Safe navigation

    const currentCombatId = ++combatIdRef.current;
    const nextTurn = isBot ? W : B;

    const turnNumber = Math.floor(moveHistory.length / 2) + 1;

    // Crystal Ball Swap
    if (p.equip === "crystal_ball" && t && t.color === p.color) {
      sfx.crystalBall();
      const B1 = cloneB(Bstate);
      const userPiece = { ...p, equip: undefined };
      const targetPiece = { ...t };
      B1[to.y][to.x] = userPiece;
      B1[from.y][from.x] = targetPiece;

      // Check for exhaustion
      checkExhaustion(p.id, from, to, B1);

      // Pawn promotion check for crystal ball swaps
      // White promotes at top (boardSize-1), Black promotes at bottom (0)
      if (userPiece.type === "P") {
        const shouldPromote = 
          (userPiece.color === W && to.y === currentBoardSize - 1) ||
          (userPiece.color === B && to.y === 0);
        console.log("[SWAP-PROMOTION-CHECK]", { piece: "user", color: userPiece.color, toY: to.y, boardSize: currentBoardSize, shouldPromote, config: currentLevelConfig?.pawnPromotionType });
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED-SWAP]", { color: userPiece.color === W ? "white" : "black", to: promotionType });
          B1[to.y][to.x] = { ...userPiece, type: promotionType };
        }
      }
      if (targetPiece.type === "P") {
        const shouldPromote = 
          (targetPiece.color === W && from.y === currentBoardSize - 1) ||
          (targetPiece.color === B && from.y === 0);
        console.log("[SWAP-PROMOTION-CHECK]", { piece: "target", color: targetPiece.color, fromY: from.y, boardSize: currentBoardSize, shouldPromote, config: currentLevelConfig?.pawnPromotionType });
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED-SWAP]", { color: targetPiece.color === W ? "white" : "black", to: promotionType });
          B1[from.y][from.x] = { ...targetPiece, type: promotionType };
        }
      }

      setB(B1);
      setLastMove({ from, to });
      decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
      setTurn(nextTurn);
      setPhase("playing");
      
      const notation = getChessNotation(from, to, p, false);
      setMoveHistory((hist) => [
        ...hist,
        {
          turnNumber,
          color: p.color as Color,
          notation: `${notation} (swap)`,
          piece: { type: p.type, color: p.color as Color },
          inFog: !vis[to.y]?.[to.x], // Safe navigation
        },
      ]);
      return;
    }

    // Check for obstacle attack
    const targetObstacle = obstacles[to.y]?.[to.x];
    if (targetObstacle !== "none" && !t) {
      const dir = p.color === W ? 1 : -1;
      const lanceLungeUsed =
        p.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
      if (lanceLungeUsed) sfx.spear();

      const out = resolveObstacle(
        rngRef.current,
        p,
        Bstate,
        Tstate,
        obstacles,
        from,
        to,
        lanceLungeUsed,
        currentBoardSize
      );
      setFx({
        kind: "obstacle",
        from,
        to,
        a: out.a,
        ok: out.ok,
        id: currentCombatId,
        obstacleType: targetObstacle, // Store actual obstacle type
      });

      const notation = getChessNotation(from, to, p, true);
      const winPct = obstacleWinPercent(
        Bstate,
        Tstate,
        obstacles,
        p,
        from,
        to,
        currentBoardSize
      );
      const sup = supportCount(Bstate, Tstate, obstacles, p, from, to, currentBoardSize);
      const moveRec: MoveRecord = {
        turnNumber,
        color: p.color as Color,
        notation,
        piece: { type: p.type, color: p.color as Color },
        combat: {
          isSupported: sup > 0,
          winPercent: winPct,
          attackerRolls: out.a.rolls,
          defenderRolls: null, // Explicitly null for obstacle combat
          obstacleType: targetObstacle, // Store obstacle type for display
        },
        inFog: !vis[to.y]?.[to.x], // Safe navigation
      };
      setMoveHistory((hist) => [...hist, moveRec]);

      const delay =
        TMG.roll +
        TMG.linger +
        (out.a.mods?.length ? TMG.mods : 0) +
        TMG.total +
        TMG.winnerHold;

      setTimeout(() => {
        if (combatIdRef.current !== currentCombatId) return;

        if (!out.ok && p.color === W && prayerDice > 0) {
          setPhase("awaiting_reroll");
          setRerollState({ from, to, kind: "obstacle", loserPos: from, obstacleType: targetObstacle });
          return;
        }

        if (!out.ok) {
          sfx.combatLose();
          setFailedAttackId(p.id);
          setTimeout(() => setFailedAttackId(null), 400);
        }
        finishRockCombat(out.ok, lanceLungeUsed, from, to);
      }, delay);
      return;
    }

    // Piece vs piece
    if (t) {
      const dir = p.color === W ? 1 : -1;
      const lanceLungeUsed =
        p.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
      if (lanceLungeUsed) sfx.spear();
      const out = resolve(
        rngRef.current,
        p,
        t,
        Bstate,
        Tstate,
        obstacles,
        from,
        to,
        currentBoardSize,
        lanceLungeUsed
      );
      setFx({
        kind: "piece",
        from,
        to,
        a: out.a,
        d: out.d,
        win: out.win,
        id: currentCombatId,
      });

      const notation = getChessNotation(from, to, p, true);
      const winPct = winPercent(
        Bstate,
        Tstate,
        obstacles,
        p,
        t,
        from,
        to,
        currentBoardSize
      );
      const sup = supportCount(Bstate, Tstate, obstacles, p, from, to, currentBoardSize);
      const moveRec: MoveRecord = {
        turnNumber,
        color: p.color as Color,
        notation,
        piece: { type: p.type, color: p.color as Color },
        combat: {
          isSupported: sup > 0,
          winPercent: winPct,
          attackerRolls: out.a.rolls, // Store initial rolls
          defenderRolls: out.d.rolls, // Store initial rolls
        },
        inFog: !vis[to.y]?.[to.x], // Safe navigation
      };
      setMoveHistory((hist) => [...hist, moveRec]);

      const delay =
        TMG.roll +
        TMG.linger +
        (out.a.mods?.length || out.d.mods?.length ? TMG.mods : 0) +
        TMG.total +
        TMG.winnerHold;

      setTimeout(() => {
        if (combatIdRef.current !== currentCombatId) return;

        const playerLost =
          (p.color === W && !out.win) || (t.color === W && out.win);

        const forcedAttacker = !!out.a.forced;
        const forcedDefender = !!out.d.forced;
        const forcedForPlayer =
          (p.color === "w" && forcedAttacker) ||
          (t.color === "w" && forcedDefender);

        if (playerLost && prayerDice > 0 && !forcedForPlayer) {
          const loserPos = p.color === W ? from : to;
          setPhase("awaiting_reroll");
          setRerollState({ from, to, kind: "piece", loserPos });
          return;
        }

        const loser = out.win ? t : p;
        const winner = out.win ? p : t;

        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        const postAnimation = () => {
          if (loser?.id) {
            let idsToDestroy = [loser.id];
            if (loser.equip === "skull" && winner) {
              idsToDestroy.push(winner.id);
            }
            setDestroyedPieceIds(idsToDestroy);
          }
          if (!out.win) {
            setFailedAttackId(p.id);
            setTimeout(() => setFailedAttackId(null), 400);
          }
          setTimeout(() => {
            finishPieceCombat(out, lanceLungeUsed, from, to);
          }, 400);
        };

        if (out.win && !prefersReducedMotion) {
          setDestroyedPieceIds([t.id]);
          setTimeout(() => {
            const colorKey = p.color as "w" | "b";
            // Check if GL has the type before accessing colorKey
            const pieceGlyphSet = GL[p.type as keyof typeof GL];
            const glyph =
              pieceGlyphSet && colorKey in pieceGlyphSet
                ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet]
                : "?";

            setMoveAnim({
              id: p.id,
              from,
              to,
              glyph: glyph,
              color: colorKey,
              equip: p.equip,
            });
            setTimeout(() => {
              finishPieceCombat(out, lanceLungeUsed, from, to);
              setMoveAnim(null);
            }, PIECE_MOVE_MS);
          }, 150);
        } else {
          postAnimation();
        }
      }, delay);
      return;
    }

    // Quiet move
    const notation = getChessNotation(from, to, p, false);
    const moveRec: MoveRecord = {
      turnNumber,
      color: p.color as Color,
      notation,
      piece: { type: p.type, color: p.color as Color },
      inFog: !vis[to.y]?.[to.x], // Safe navigation
    };
    setMoveHistory((hist) => [...hist, moveRec]);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const commitQuietMove = () => {
      sfx.move();
      const B1 = cloneB(Bstate);
      const moved: Piece = { ...p };
      B1[to.y][to.x] = moved;
      B1[from.y][from.x] = null;

      // Check for exhaustion after the move
      checkExhaustion(p.id, from, to, B1);

      // Pawn promotion check for normal moves
      // White promotes at top (boardSize-1), Black promotes at bottom (0)
      const pieceAtDestination = B1[to.y]?.[to.x];
      if (pieceAtDestination && pieceAtDestination.type === "P") {
        const isWhitePawn = pieceAtDestination.color === W;
        const isBlackPawn = pieceAtDestination.color === B;
        const atTopRow = to.y === currentBoardSize - 1;
        const atBottomRow = to.y === 0;
        const shouldPromote = 
          (isWhitePawn && atTopRow) ||
          (isBlackPawn && atBottomRow);
        
        if (isBlackPawn) {
          console.log("[BLACK-PAWN-CHECK]", {
            color: pieceAtDestination.color,
            toY: to.y,
            boardSize: currentBoardSize,
            atBottomRow,
            shouldPromote
          });
        }
        
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED]", { color: pieceAtDestination.color === W ? "white" : "black", to: promotionType });
          B1[to.y][to.x] = { ...pieceAtDestination, type: promotionType };
        }
      }

      // Check for King Escaped victory condition
      const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
      if (victoryConditions.includes("king_escaped") && moved.type === "K" && moved.color === W && to.y === currentBoardSize - 1) {
        sfx.winCheckmate();
        setB(B1);
        setWin(W);
        handleLevelCompletion(W, B1);
        setPhrase("King escaped!");
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMove = newHistory[newHistory.length - 1];
          if (lastMove) lastMove.notation += " (Escaped!)";
          return newHistory;
        });
        setPhase("playing");
        return;
      }

      setB(B1);
      setLastMove({ from, to });
      decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
      setTurn(nextTurn);
      setPhase("playing");
    };

    const moveIsInFog = !(vis[from.y]?.[from.x] || vis[to.y]?.[to.x]); // Safe navigation

    if (prefersReducedMotion || isDragMove || moveIsInFog) {
      commitQuietMove();
    } else {
      const colorKey = p.color as "w" | "b";
      // Check if GL has the type before accessing colorKey
      const pieceGlyphSet = GL[p.type as keyof typeof GL];
      const glyph =
        pieceGlyphSet && colorKey in pieceGlyphSet
          ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet]
          : "?";

      setMoveAnim({
        id: p.id,
        from,
        to,
        glyph: glyph,
        color: colorKey,
        equip: p.equip,
      });

      setTimeout(() => {
        commitQuietMove();
        setMoveAnim(null);
      }, PIECE_MOVE_MS);
    }
  }

  function finishRockCombat(
    isSuccess: boolean,
    lanceLungeUsed: boolean,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    if (isSuccess) sfx.rockDestroy();
    const B1 = cloneB(Bstate);
    const O1 = obstacles.map(row => [...row]); // Clone obstacles
    const mv = B1[from.y]?.[from.x]; // Safe navigation
    if (!mv) {
      setFx(null);
      setPhase("playing");
      return;
    }

    const attackerState = lanceLungeUsed
      ? { ...mv, equip: undefined }
      : { ...mv };

    if (isSuccess) {
      // Check if we're destroying the Bell of Names
      const wasBellDestroyed = O1[to.y][to.x] === "bell";
      
      B1[to.y][to.x] = attackerState;
      B1[from.y][from.x] = null;
      O1[to.y][to.x] = "none"; // Remove the obstacle
      setObstacles(O1); // Update obstacles state
      setLastMove({ from, to }); // Set last move only on success
      
      // Special message when the bell is destroyed
      if (wasBellDestroyed) {
        setSpeechBubble({ 
          text: "**The bell shatters! Morcant is now vulnerable!**", 
          id: Date.now(), 
          targetId: "bell_destroyed" 
        });
      }

      // Check for exhaustion
      if (mv) checkExhaustion(mv.id, from, to, B1);

      // Pawn promotion check after destroying obstacle
      // White promotes at top (boardSize-1), Black promotes at bottom (0)
      const pieceAtDestination = B1[to.y]?.[to.x];
      if (pieceAtDestination && pieceAtDestination.type === "P") {
        const shouldPromote = 
          (pieceAtDestination.color === W && to.y === currentBoardSize - 1) ||
          (pieceAtDestination.color === B && to.y === 0);
        console.log("[OBSTACLE-PROMOTION-CHECK]", { 
          color: pieceAtDestination.color, 
          toY: to.y, 
          boardSize: currentBoardSize, 
          shouldPromote,
          config: currentLevelConfig?.pawnPromotionType 
        });
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED-OBSTACLE]", { color: pieceAtDestination.color === W ? "white" : "black", to: promotionType });
          B1[to.y][to.x] = { ...pieceAtDestination, type: promotionType };
        }
      }

      // Check for King Escaped victory condition
      const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
      if (victoryConditions.includes("king_escaped") && mv.type === "K" && mv.color === W && to.y === currentBoardSize - 1) {
        sfx.winCheckmate();
        setB(B1);
        setWin(W);
        handleLevelCompletion(W, B1);
        setPhrase("King escaped!");
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMove = newHistory[newHistory.length - 1];
          if (lastMove) lastMove.notation += " (Escaped!)";
          return newHistory;
        });
        setFx(null);
        setRerollState(null);
        setPhase("playing");
        return;
      }
    } else {
      B1[from.y][from.x] = attackerState;
      setLastMove(null); // No move occurred visually
    }
    setB(B1);
    decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
    setTurn(turn === W ? B : W);
    setFx(null);
    setRerollState(null);
    setPhase("playing");
  }

  function finishPieceCombat(
    out: any,
    lanceLungeUsed: boolean,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    let B1 = cloneB(Bstate);
    const mv = B1[from.y]?.[from.x]; // Safe navigation
    const tg = B1[to.y]?.[to.x]; // Safe navigation

    // Safety: if either missing, bail cleanly
    if (!mv || !tg) {
      setFx(null);
      setRerollState(null);
      setPhase("playing");
      return;
    }

    if (out.win) {
      // Attacker wins → defender dies (unless Staff converts)
      // Compute the post-move attacker state (Spear breaks)
      const moved: Piece = { ...mv };
      if (lanceLungeUsed) moved.equip = undefined;

      if (mv.equip === "staff") {
        // Convert defender instead of killing them
        sfx.convert();
        const conv: Piece = { ...tg, color: mv.color };
        B1[to.y][to.x] = conv;
        B1[from.y][from.x] = { ...moved, equip: undefined };
        
        // Pawn promotion check after staff conversion (attacker stays at from position)
        // White promotes at top (boardSize-1), Black promotes at bottom (0)
        const attackerAtFrom = B1[from.y]?.[from.x];
        if (attackerAtFrom && attackerAtFrom.type === "P") {
          const shouldPromote = 
            (attackerAtFrom.color === W && from.y === currentBoardSize - 1) ||
            (attackerAtFrom.color === B && from.y === 0);
          console.log("[STAFF-PROMOTION-CHECK]", { color: attackerAtFrom.color, fromY: from.y, boardSize: currentBoardSize, shouldPromote, config: currentLevelConfig?.pawnPromotionType });
          if (shouldPromote) {
            let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
            // Safeguard: never promote to Pawn or King
            if (promotionType === "P" || promotionType === "K") promotionType = "Q";
            console.log("[PAWN-PROMOTED-STAFF]", { color: attackerAtFrom.color === W ? "white" : "black", to: promotionType });
            B1[from.y][from.x] = { ...attackerAtFrom, type: promotionType };
          }
        }
        
        // Check if we unlocked an item (converted piece = "killed" for unlock purposes)
        checkUnlockItem(
          tg,
          mv.color as Color,
          setThisLevelUnlockedItems,
          setCampaign,
          campaign,
          setKilledEnemyPieces,
          setMarketPoints,
          setUnspentGold,
          tg.type === "K" ? "beheaded" : undefined
        );
        // If defender was a King, the game ends immediately
        if (tg.type === "K") {
          // Check for Bell of Names protection (protects black king only)
          if (tg.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
            // Black king is protected by the Bell of Names - conversion fails
            const bellPhrase = "The Bell of Names shields Morcant!";
            setPhrase(bellPhrase);
            setSpeechBubble({ 
              text: "**The bell protects me!**", 
              id: Date.now(), 
              targetId: tg.id 
            });
            
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${bellPhrase})`;
              return newHistory;
            });
            
            // Apply shadow visual effect to the king for 1 turn
            const B1 = cloneB(Bstate);
            const shadowKing = B1[to.y]?.[to.x];
            if (shadowKing) {
              shadowKing.shadowForTurns = 1;
            }
            // Staff is still consumed, but conversion fails
            B1[from.y][from.x] = { ...mv, equip: undefined };
            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          
          // No death → no stun
          if (mv.color === W) {
            sfx.winCheckmate();
          } else {
            sfx.loseCheckmate();
          }
          setB(B1);
          setWin(mv.color as Color);
          handleLevelCompletion(mv.color as Color, B1);
          const endPhrase = "King beheaded!";
          setPhrase(endPhrase);
          setMoveHistory((hist) => {
            const newHistory = [...hist];
            const lastMove = newHistory[newHistory.length - 1];
            if (lastMove) lastMove.notation += ` (${endPhrase})`;
            return newHistory;
          });
          setFx(null);
          setRerollState(null);
          setPhase("playing");
          return;
        }
      } else {
        // Normal capture path
        if (tg.equip === "skull") {
          // Both die
          sfx.combatLose(); // Play sound for attacker dying to skull
          const deadDefender = B1[to.y][to.x];
          const deadAttacker = B1[from.y][from.x];
          
          // Check for Bell of Names protection (protects black king only)
          if (deadDefender?.type === "K" && deadDefender.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
            // Black king is protected by the Bell of Names - only attacker dies
            B1[from.y][from.x] = null;
            onPieceDeath(B1, deadAttacker, from, turn); // 🎃 attacker's death
            
            const bellPhrase = "The Bell of Names shields Morcant!";
            setPhrase(bellPhrase);
            setSpeechBubble({ 
              text: "**The bell protects me!**", 
              id: Date.now(), 
              targetId: tg.id 
            });
            
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${bellPhrase})`;
              return newHistory;
            });
            
            // Apply shadow visual effect to the king for 1 turn
            const shadowKing = B1[to.y]?.[to.x];
            if (shadowKing) {
              shadowKing.shadowForTurns = 1;
            }
            
            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          
          B1[to.y][to.x] = null;
          B1[from.y][from.x] = null;
          onPieceDeath(B1, deadDefender, to, turn); // 🎃 defender's death
          onPieceDeath(B1, deadAttacker, from, turn); // 🎃 attacker's death
          // Check if we unlocked an item from defender
          checkUnlockItem(
            deadDefender,
            mv.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
            deadDefender?.type === "K" ? "beheaded" : undefined
          );

          // Both pieces die, so award a "kill" to both if they had any kills
          // (attacker doesn't get credit since they also die)

          // Early king checks after stuns
          if (deadAttacker?.type === "K") {
            if (tg.color === B) sfx.loseCheckmate();
            else sfx.winCheckmate();
            setB(B1);
            setWin(tg.color as Color);
            handleLevelCompletion(tg.color as Color, B1);
            const endPhrase = "King's soul is forfeit!";
            setPhrase(endPhrase);
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${endPhrase})`;
              return newHistory;
            });
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          if (deadDefender?.type === "K") {
            if (mv.color === W) sfx.winCheckmate();
            else sfx.loseCheckmate();
            setB(B1);
            setWin(mv.color as Color);
            handleLevelCompletion(mv.color as Color, B1);
            const endPhrase = "King beheaded!";
            setPhrase(endPhrase);
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${endPhrase})`;
              return newHistory;
            });
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
        } else {
          // Defender actually dies here
          if (tg.type !== "K") {
            sfx.capture();
          }
          onPieceDeath(B1, tg, to, turn); // 🎃 if defender had Curse
          // Check if we unlocked an item
          checkUnlockItem(
            tg,
            mv.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
            tg.type === "K" ? "beheaded" : undefined
          );

          // Award kill to attacker (track for veteran status)
          const newKills = (moved.kills || 0) + 1;
          moved.kills = newKills;

          B1[to.y][to.x] = moved;
          B1[from.y][from.x] = null;

          // Check for exhaustion
          checkExhaustion(mv.id, from, to, B1);

          // Pawn promotion check after combat win (must happen before early returns for king kills)
          const pieceAtDestination = B1[to.y]?.[to.x];
          if (pieceAtDestination && pieceAtDestination.type === "P") {
            const shouldPromote = 
              (pieceAtDestination.color === W && to.y === currentBoardSize - 1) ||
              (pieceAtDestination.color === B && to.y === 0);
            if (shouldPromote) {
              let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
              // Safeguard: never promote to Pawn or King
              if (promotionType === "P" || promotionType === "K") promotionType = "Q";
              B1[to.y][to.x] = { ...pieceAtDestination, type: promotionType };
            }
          }

          if (tg.type === "K") {
            // Check for Bell of Names protection (protects black king only)
            if (tg.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
              // Black king is protected by the Bell of Names - he cannot be killed
              // The attacker's attack fails completely (as if blocked)
              const bellPhrase = "The Bell of Names shields Morcant!";
              setPhrase(bellPhrase);
              setSpeechBubble({ 
                text: "**The bell protects me!**", 
                id: Date.now(), 
                targetId: tg.id 
              });
              
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += ` (${bellPhrase})`;
                return newHistory;
              });
              
              // Apply shadow visual effect to the king for 1 turn
              const B1 = cloneB(Bstate);
              const shadowKing = B1[to.y]?.[to.x];
              if (shadowKing) {
                shadowKing.shadowForTurns = 1;
                setB(B1);
              } else {
                setB(Bstate); // Fallback if king not found
              }
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
            
            if (moved.color === W) {
              sfx.winCheckmate();
            } else {
              sfx.loseCheckmate();
            }
            setB(B1);
            setWin(moved.color as Color);
            handleLevelCompletion(moved.color as Color, B1);
            const endPhrase = "King beheaded!";
            setPhrase(endPhrase);
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${endPhrase})`;
              return newHistory;
            });
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }

          // Check for King Escaped victory condition
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
          if (victoryConditions.includes("king_escaped") && moved.type === "K" && moved.color === W && to.y === currentBoardSize - 1) {
            sfx.winCheckmate();
            setB(B1);
            setWin(W);
            handleLevelCompletion(W, B1);
            setPhrase("King escaped!");
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += " (Escaped!)";
              return newHistory;
            });
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
        }

        setLastMove({ from, to });
      }
      // (end attacker win)
    } else {
      // Attacker loses → attacker dies unless Bow saves them
      const attackerState = lanceLungeUsed
        ? { ...mv, equip: undefined }
        : { ...mv };

      if (attackerState.equip === "bow") {
        // Bow breaks — no death => no stun
        sfx.bowBreak();
        B1[from.y][from.x] = { ...attackerState, equip: undefined };
        setLastMove(null); // No move occurred visually
      } else {
        // Attacker actually dies here
        if (mv.type !== "K") {
          sfx.combatLose();
        }
        const deadAttacker = B1[from.y][from.x];
        B1[from.y][from.x] = null;
        onPieceDeath(B1, deadAttacker, from, turn); // 🎃 attacker's death

        if (attackerState.equip === "skull") {
          // Kill defender too
          const deadDefender = B1[to.y][to.x];
          
          // Check for Bell of Names protection (protects black king only)
          if (deadDefender?.type === "K" && deadDefender.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
            // Black king is protected by the Bell of Names - skull fails to kill him
            const bellPhrase = "The Bell of Names shields Morcant!";
            setPhrase(bellPhrase);
            setSpeechBubble({ 
              text: "**The bell protects me!**", 
              id: Date.now(), 
              targetId: tg.id 
            });
            
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${bellPhrase})`;
              return newHistory;
            });
            
            // Apply shadow visual effect to the king for 1 turn
            const shadowKing = B1[to.y]?.[to.x];
            if (shadowKing) {
              shadowKing.shadowForTurns = 1;
            }
            
            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          
          sfx.combatLose(); // Play sound for defender dying to attacker's skull
          B1[to.y][to.x] = null;
          onPieceDeath(B1, deadDefender, to, turn); // 🎃 defender's death
          // Check if we unlocked an item from defender
          checkUnlockItem(
            deadDefender,
            mv.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
            deadDefender?.type === "K" ? "beheaded" : undefined
          );

          // Defender died (to skull), award kill to dead attacker's kill count
          // Note: attacker is dead so this won't be visible, but helps with consistency
        }

        // Early king checks after stuns
        if (tg.type === "K" && B1[to.y]?.[to.x] === null) {
          // Safe navigation
          // if defender also died
          if (mv.color === W) {
            sfx.winCheckmate();
          } else {
            sfx.loseCheckmate();
          }
          setB(B1);
          setWin(mv.color as Color); // Attacker's color wins
          handleLevelCompletion(mv.color as Color, B1);
          setPhrase("King's soul is forfeit!");
          setFx(null);
          setRerollState(null);
          setPhase("playing");
          return;
        }
        if (deadAttacker?.type === "K") {
          // Attacker (player's king) died, defender wins the game
          const endPhrase = "King dishonored!";
          const winner = mv.color === W ? B : W;

          // Track King defeat for ransom if it's the player's king (white) that died
          if (deadAttacker.color === W) {
            // Player king died, so black wins - but we don't track white king defeats for ransom
          } else if (deadAttacker.color === B) {
            // Black king died attacking, track for ransom
            trackKingDefeat(deadAttacker, "dishonored", setKilledEnemyPieces);
          }

          // Set phrase and move history BEFORE handleLevelCompletion
          setPhrase(endPhrase);
          setMoveHistory((hist) => {
            const newHistory = [...hist];
            const lastMove = newHistory[newHistory.length - 1];
            if (lastMove && !lastMove.notation.includes(endPhrase)) {
              lastMove.notation += ` (${endPhrase})`;
            }
            return newHistory;
          });

          if (mv.color === W) {
            sfx.loseCheckmate();
            setWin(B);
            handleLevelCompletion(B, B1);
          } else {
            sfx.winCheckmate();
            setWin(W);
            handleLevelCompletion(W, B1);
          }

          setB(B1);
          setFx(null);
          setRerollState(null);
          setPhase("playing");
          return;
        }
        setLastMove(null); // No move occurred visually
      }
      // (end attacker lose)
    }

    // Pawn promotion (check both positions - winner might be at 'to' or 'from')
    // White promotes at top (boardSize-1), Black promotes at bottom (0)
    const winnerFinalPos = out.win ? to : from;
    const winnerFinalPiece = B1[winnerFinalPos.y]?.[winnerFinalPos.x];
    if (winnerFinalPiece?.type === "P") {
      const shouldPromoteWinner = 
        (winnerFinalPiece.color === W && winnerFinalPos.y === currentBoardSize - 1) ||
        (winnerFinalPiece.color === B && winnerFinalPos.y === 0);
      console.log("[COMBAT-PROMOTION-CHECK]", { 
        piece: "winner", 
        color: winnerFinalPiece.color, 
        posY: winnerFinalPos.y, 
        boardSize: currentBoardSize, 
        shouldPromote: shouldPromoteWinner,
        config: currentLevelConfig?.pawnPromotionType
      });
      if (shouldPromoteWinner) {
        let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
        // Safeguard: never promote to Pawn or King
        if (promotionType === "P" || promotionType === "K") promotionType = "Q";
        console.log("[PAWN-PROMOTED-COMBAT]", { color: winnerFinalPiece.color === W ? "white" : "black", to: promotionType });
        B1[winnerFinalPos.y][winnerFinalPos.x] = { ...winnerFinalPiece, type: promotionType };
      }
    }
    
    // Also check if loser ended up at promotion square (shouldn't happen, but just in case)
    const loserFinalPos = out.win ? from : to;
    const loserFinalPiece = B1[loserFinalPos.y]?.[loserFinalPos.x];
    if (loserFinalPiece?.type === "P") {
      const shouldPromoteLoser = 
        (loserFinalPiece.color === W && loserFinalPos.y === currentBoardSize - 1) ||
        (loserFinalPiece.color === B && loserFinalPos.y === 0);
      console.log("[COMBAT-PROMOTION-CHECK]", { 
        piece: "loser", 
        color: loserFinalPiece.color, 
        posY: loserFinalPos.y, 
        boardSize: currentBoardSize, 
        shouldPromote: shouldPromoteLoser,
        config: currentLevelConfig?.pawnPromotionType
      });
      if (shouldPromoteLoser) {
        let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
        // Safeguard: never promote to Pawn or King
        if (promotionType === "P" || promotionType === "K") promotionType = "Q";
        console.log("[PAWN-PROMOTED-COMBAT]", { color: loserFinalPiece.color === W ? "white" : "black", to: promotionType });
        B1[loserFinalPos.y][loserFinalPos.x] = { ...loserFinalPiece, type: promotionType };
      }
    }

    // Flavor text: Decide on the speech bubble content in one atomic step to prevent potential flickering.
    const getSpeechBubbleContent = () => {
      const winner = out.win ? mv : tg;
      const loser = out.win ? tg : mv;
      const winnerColor = winner.color as Color;
      const loserColor = loser.color as Color;
      const swingValue = val(loser);
      // Safe navigation for winnerFinalPiece
      const winnerFinalPiece =
        B1[winner === mv ? to.y : from.y]?.[winner === mv ? to.x : from.x];
      const winnerFinalId = winnerFinalPiece?.id ?? winner.id; // Use ID of piece on board, or original if gone (trade)

      // Priority 1: High-impact swing move
      if (swingValue >= 40 && rngRef.current() < 0.75) {
        const text = rand(rngRef.current, SWING_PHRASES[winnerColor]);
        const king = findK(B1, winnerColor);
        const kingVisible =
          king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
        const targetId = king && kingVisible ? king.p.id : winnerFinalId;
        return { text, targetId };
      }

      // Priority 2: A named unit was involved (ALWAYS triggers)
      if (winner.name || loser.name) {
        // Check if winner is a featured piece with custom speech lines
        if (
          winner.isPreconfigured &&
          winner.speechLines &&
          winner.speechLines.length > 0
        ) {
          const text = rand(rngRef.current, winner.speechLines);
          return { text, targetId: winnerFinalId };
        }

        // Check if loser is a featured piece with custom speech lines (for defeat quotes)
        if (
          !out.win &&
          loser.isPreconfigured &&
          loser.speechLines &&
          loser.speechLines.length > 0
        ) {
          const text = rand(rngRef.current, loser.speechLines);
          const loserFinalPiece =
            B1[loser === mv ? from.y : to.y]?.[loser === mv ? from.x : to.x];
          const loserFinalId = loserFinalPiece?.id ?? loser.id;
          return { text, targetId: loserFinalId };
        }

        const shouldTaunt = loser.name && rngRef.current() < 0.5; // 50% chance for winner to taunt loser if loser has a name

        if (shouldTaunt) {
          // Winner taunts the named loser
          const text = rand(
            rngRef.current,
            NAMED_PHRASES[winnerColor].taunt
          ).replace("[UnitName]", loser.name!);
          const king = findK(B1, winnerColor);
          const kingVisible =
            king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
          const targetId = king && kingVisible ? king.p.id : winnerFinalId; // Speaker is the winner or their king
          return { text, targetId };
        } else if (winner.name) {
          // Winner praises themself
          const text = rand(
            rngRef.current,
            NAMED_PHRASES[winnerColor].win
          ).replace("[UnitName]", winner.name);
          return { text, targetId: winnerFinalId }; // Speaker is the winner (final piece)
        } else if (loser.name) {
          // Ensure loser name exists before proceeding
          // This case handles when only the loser is named and we didn't taunt
          // Find the winner's king or the winner piece to speak
          const king = findK(B1, winnerColor);
          const kingVisible =
            king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
          const speakerId = king && kingVisible ? king.p.id : winnerFinalId;
          const text = rand(
            rngRef.current,
            NAMED_PHRASES[loserColor].lose // Use loser's lament phrase
          ).replace("[UnitName]", loser.name!); // Referencing the loser by name
          return { text, targetId: speakerId }; // Winner/King speaks the lament
        }
      }

      // Priority 3: Generic phrase (50% chance if no swing and no named units)
      if (rngRef.current() < 0.5) {
        const text = rand(rngRef.current, PHRASES[winnerColor].win);
        const king = findK(B1, winnerColor);
        const kingVisible =
          king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
        const targetId = king && kingVisible ? king.p.id : winnerFinalId;
        return { text, targetId };
      }

      return null; // No speech bubble this time
    };

    const speechContent = getSpeechBubbleContent();
    if (speechContent) {
      setSpeechBubble({ ...speechContent, id: Math.random() });
    }

    setB(B1);
    decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
    setTurn(turn === W ? B : W);
    setFx(null);
    setRerollState(null);
    setDestroyedPieceIds([]);
    setPhase("playing");
  }

  const handleStartBattle = () => {
    // Only ask about unspent gold if market is available and there's unspent gold
    const marketEnabled = currentLevelConfig?.marketEnabled !== false;
    if (marketPoints !== 0 && marketEnabled) {
      setShowMarketConfirm(true);
    } else {
      setPhase("playing");
    }
  };

  // Shared rules content component
  const RulesContent = ({ 
    showItemInfo, 
    setShowItemInfo,
    className = "bg-zinc-900/95 rounded-2xl p-6 max-h-[80vh] overflow-y-auto",
    headingClass = "text-lg"
  }: { 
    showItemInfo: boolean; 
    setShowItemInfo: (val: boolean | ((prev: boolean) => boolean)) => void;
    className?: string;
    headingClass?: string;
  }) => {
    const itemOrder: (keyof typeof ITEM_DESCRIPTIONS)[] = [
      "sword",
      "shield",
      "lance",
      "torch",
      "bow",
      "staff",
      "crystal_ball",
      "disguise",
      "scythe",
      "banner",
      "curse",
      "skull",
    ];

    return (
      <div className={className}>
        <div className={`font-semibold mb-2 ${headingClass}`}>Combat</div>
        <ul className="ml-5 list-disc space-y-1 text-sm mb-4">
          <li>Pieces roll 1d6. Attacker wins on ≥ roll.</li>
          <li>
            Support: +1 for each friendly piece also attacking the square.
          </li>
          <li>
            King always attacks with Advantage (roll 2, keep highest).
          </li>
          <li>Stunned pieces always roll 1.</li>
          <li>
            🎖️ Veterans: Units that kill 5+ enemy units always roll with
            advantage (both attacking and defending).
          </li>
        </ul>
        <div className={`font-semibold mt-3 mb-1 ${headingClass}`}>Terrain</div>
        <ul className="ml-5 list-disc space-y-1 text-sm mb-4">
          <li>Forest (🌲): Defender gets +1 to their roll.</li>
          <li>Water (💧): Defender gets -1 to their roll.</li>
          <li>Rock (🪨): Blocks movement. Destroy with a roll of 5+.</li>
        </ul>
        <div className={`font-semibold mt-3 mb-1 flex justify-between items-center ${headingClass}`}>
          Items
          <button
            onClick={() => setShowItemInfo((s) => !s)}
            className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            {showItemInfo ? "Hide" : "Show"}
          </button>
        </div>
        {showItemInfo && (
          <ul className="ml-5 list-disc space-y-1 text-sm mb-4">
            {itemOrder.map((key) => (
              <li key={key}>{ITEM_DESCRIPTIONS[key]}</li>
            ))}
          </ul>
        )}
        <div className={`font-semibold mt-3 mb-1 ${headingClass}`}>Blessings</div>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li>{ITEM_DESCRIPTIONS["prayer_die"]}</li>
        </ul>
      </div>
    );
  };

  const GameInfo = () => {
    const [showItemInfo, setShowItemInfo] = useState(false);

    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Game Info</h1>
        {showRules && (
          <RulesContent 
            showItemInfo={showItemInfo} 
            setShowItemInfo={setShowItemInfo}
            className="bg-zinc-900/70 rounded-2xl p-3"
            headingClass=""
          />
        )}
      </div>
    );
  };

  const MoveHistoryLog = ({
    history,
    phase,
  }: {
    history: MoveRecord[];
    phase: Phase;
  }) => {
    const logRef = useRef<HTMLDivElement>(null);
    const prevHistoryLengthRef = useRef<number>(0);

    useEffect(() => {
      if (logRef.current) {
        const currentLength = history.length;
        const prevLength = prevHistoryLengthRef.current;
        
        // Only auto-scroll when history length actually increased (new moves added)
        // This prevents scroll resets when speech bubbles cause re-renders
        if (currentLength > prevLength) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
        
        prevHistoryLengthRef.current = currentLength;
      }
    }, [history]);

    const movePairs: { turn: number; w?: MoveRecord; b?: MoveRecord }[] = [];
    history.forEach((move) => {
      let pair = movePairs.find((p) => p.turn === move.turnNumber);
      if (!pair) {
        pair = { turn: move.turnNumber };
        movePairs.push(pair);
      }
      if (move.color === "w") pair.w = move;
      else pair.b = move;
    });

    const lastTurnNumber =
      movePairs.length > 0 ? movePairs[movePairs.length - 1].turn : 0;

    // Polyfill findLastIndex if it's not present (for environments < ES2023)
    function findLastIndex<T>(
      arr: T[],
      predicate: (value: T, index: number, obj: T[]) => boolean
    ): number {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (predicate(arr[i], i, arr)) return i;
      }
      return -1;
    }

    const lastWhiteMoveIndex = findLastIndex(history, (m) => m.color === "w");
    const lastBlackMoveIndex = findLastIndex(history, (m) => m.color === "b");

    return (
      <div className="mt-4 bg-zinc-900/70 rounded-2xl p-3">
        <h2 className="text-2xl font-semibold mb-2 text-white">Move History</h2>
        <div ref={logRef} className="max-h-96 overflow-y-auto pr-2">
          {movePairs.map((pair, index) => {
            const isLastWhiteAnimating =
              phase === "base" &&
              !!pair.w &&
              history[lastWhiteMoveIndex]?.turnNumber === pair.turn &&
              history[lastBlackMoveIndex]?.turnNumber !== pair.turn;
            const isLastBlackAnimating =
              phase === "base" &&
              !!pair.b &&
              history[lastBlackMoveIndex]?.turnNumber === pair.turn;

            return (
              <div
                key={pair.turn}
                className="grid grid-cols-[2rem_1fr_1fr] gap-x-2 items-start border-b border-zinc-700 py-1.5"
              >
                <div className="text-sm text-zinc-400 pt-1">{pair.turn}.</div>
                <MoveCell move={pair.w} isAnimating={isLastWhiteAnimating} />
                <MoveCell move={pair.b} isAnimating={isLastBlackAnimating} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const MoveCell = ({
    move,
    isAnimating,
  }: {
    move?: MoveRecord;
    isAnimating: boolean;
  }) => {
    if (!move) return <div />;

    // Ensure move.piece exists and type is valid before accessing GL
    const pieceType = move.piece?.type;
    const pieceColor = move.piece?.color as "w" | "b";
    const glyphSet = GL[pieceType as keyof typeof GL];
    const glyph = glyphSet && pieceColor in glyphSet ? glyphSet[pieceColor as keyof typeof glyphSet] : "?";

    const showGlyph = move.piece.type !== "P";

    const pctColorClass = move.combat
      ? move.combat.isSupported
        ? "text-blue-400"
        : move.combat.winPercent < 50
        ? "text-orange-400"
        : "text-green-400"
      : "";

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="font-bold text-white text-base flex items-center shrink-0"
          title={move.piece ? `${PIECE_NAMES[move.piece.type]}` : ""} // Check if move.piece exists
        >
          {showGlyph && (
            <span
              className="text-xl mr-0.5"
              style={{
                fontFamily:
                  '"Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans", system-ui, sans-serif',
              }}
            >
              {glyph}
            </span>
          )}
          {/* Show fog icon only for opponent's moves ending in fog */}
          <span>{move.inFog && move.color === B ? "🌫️" : move.notation}</span>
        </div>
        {move.combat && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${pctColorClass}`}>
              {move.combat.winPercent}%
            </span>
            <div className="flex items-center gap-1 ok px-1.5 py-0.5 rounded-md">
              {move.combat.attackerRolls.map((roll, i) => (
                <DiceD6 key={i} rolling={isAnimating} result={roll} size={16} />
              ))}
            </div>
            {move.rerolledBy === "attacker" && (
              <span className="text-sm">🙏</span>
            )}
            {
              move.combat.defenderRolls === null ? ( // Obstacle combat check
                <div className="flex items-center gap-1">
                  <span className="text-xs text-zinc-500">vs</span>
                  <span
                    className="text-xl"
                    style={{
                      fontFamily:
                        '"Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans", system-ui, sans-serif',
                    }}
                  >
                    {(() => {
                      const obstacleType = move.combat?.obstacleType || "rock";
                      if (obstacleType === "rock") return GL.ROCK.n;
                      if (obstacleType === "courtier") return GL.COURTIER.n;
                      if (obstacleType === "column") return GL.COLUMN.n;
                      if (obstacleType === "gate") return GL.GATE.n;
                      if (obstacleType === "bell") return GL.BELL.n;
                      return GL.ROCK.n; // Fallback
                    })()}
                  </span>
                </div>
              ) : move.combat.defenderRolls ? ( // Piece combat
                <>
                  <span className="text-xs text-zinc-500">vs</span>
                  <div className="flex items-center gap-1 bad px-1.5 py-0.5 rounded-md">
                    {move.combat.defenderRolls.map((roll, i) => (
                      <DiceD6
                        key={i}
                        rolling={isAnimating}
                        result={roll}
                        size={16}
                      />
                    ))}
                  </div>
                  {move.rerolledBy === "defender" && (
                    <span className="text-sm">🙏</span>
                  )}
                </>
              ) : null /* Handles cases where defenderRolls might be undefined just in case */
            }
          </div>
        )}
      </div>
    );
  };

  const Changelog = () => {
    const [showChangelog, setShowChangelog] = useState(true);

    return (
      <div className="space-y-3 mt-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Changelog</h1>
          <button
            onClick={() => setShowChangelog((s) => !s)}
            className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            {showChangelog ? "Hide" : "Show"}
          </button>
        </div>

        {showChangelog && (
          <div className="bg-zinc-900/70 rounded-2xl p-3 text-sm space-y-2">
            <div className="font-semibold text-base pt-2">
              v0.5 - Story Cards & Roguelike Progression
            </div>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <strong>Story Cards:</strong> Interactive story cards at the
                start of each level with branching dialogue.
              </li>
              <li>
                <strong>Roguelike Progression:</strong> Level-based campaign
                system with resource management, gold carryover, and ransom
                system.
              </li>
              <li>
                <strong>Featured Characters:</strong> Custom preconfigured
                pieces with names, equipment, golden name plates, and contextual
                speech bubbles.
              </li>
              <li>
                <strong>Text Animations and Sound Effects</strong>
              </li>
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Sound effect helper
  const playButtonSound = () => {
    try {
      const audio = new Audio(
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2W67OeeSwwPUKvl8bVjHAU2jdXxz3ktBSh+zPLaizsKFF+z6OyoVRQKRp/g8r5sIQUrgs/y2Ik2CBlmu+znmksNEE6r5fG2YhwGOI3V8c95LQUofsvw2os4ChRgs+jrqFUUCkWd4O++bSEGKoLN8tmJNggaaLvs6Z5MEA9Nq+XytmMcBjiO1PHPeS0FJ37L8NqLOAoUYLPo66hVFApFneHvvmwhBSmCzvHaiTcIGmi77OmeSwwPTqvl8rVkHAU3"
      );
      audio.volume = 0.15;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  const IntroPopup = ({ onEnter }: { onEnter: () => void }) => {
    return (
      // Adjusted padding-top for vertical centering
      <div className="fixed inset-0 bg-neutral-950 z-[1000] flex items-start justify-center p-4 pt-20 md:pt-28">
        {/* Removed transform style that might interfere */}
        <div className="bg-zinc-900/90 backdrop-blur rounded-2xl p-8 text-center space-y-6 border border-zinc-700 w-full max-w-md mx-auto">
          <h1 className="text-5xl font-bold text-white">DiceChess Project</h1>
          <button
            onClick={() => {
              playButtonSound();
              onEnter();
            }}
            className="px-10 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xl shadow-lg transition-transform hover:scale-105"
          >
            ENTER
          </button>
          <div className="text-left max-h-[40vh] overflow-y-auto pr-2 rounded-lg border border-zinc-700 p-2 bg-zinc-800/50">
            <Changelog />
          </div>
        </div>
      </div>
    );
  };

  const [modalPosition, setModalPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [winModalPosition, setWinModalPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (showMarketConfirm && startBattleBtnRef.current) {
      const buttonRect = startBattleBtnRef.current.getBoundingClientRect();
      // Calculate center of the button
      const top = buttonRect.top + buttonRect.height / 2;
      const left = buttonRect.left + buttonRect.width / 2;
      setModalPosition({ top, left });
    } else {
      setModalPosition(null);
    }
  }, [showMarketConfirm, phase]); // Re-calculate if showMarketConfirm or phase changes

  useEffect(() => {
    if (win && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const top = boardRect.top + boardRect.height / 2;
      const left = boardRect.left + boardRect.width / 2;
      setWinModalPosition({ top, left });
    } else {
      setWinModalPosition(null);
    }
  }, [win]);

  const handleReroll = (useReroll: boolean) => {
    if (!rerollState) return;

    const { from, to, kind } = rerollState;
    const p = Bstate[from.y]?.[from.x]; // Safe navigation
    if (!p) return;

    if (useReroll) {
      setPrayerDice(prayerDice - 1);
      // Update campaign state
      setCampaign((prev) => ({ ...prev, prayerDice: prev.prayerDice - 1 }));
      sfx.prayer();

      const isPlayerAttacking = p.color === W;

      // Both dice will be rerolled, so set reroll target to null to animate both
      setRerollTarget(null);

      if (kind === "obstacle") {
        const obstacleType = rerollState?.obstacleType || obstacles[to.y]?.[to.x] || "rock";
        const lanceLungeUsed =
          p.equip === "lance" &&
          to.y === from.y + (p.color === W ? 1 : -1) * 2 &&
          to.x === from.x;
        const out = resolveObstacle(
          rngRef.current,
          p,
          Bstate,
          Tstate,
          obstacles,
          from,
          to,
          lanceLungeUsed,
          currentBoardSize
        );

        // Update history AFTER getting new rolls
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMove = newHistory[newHistory.length - 1];
          if (lastMove && lastMove.combat) {
            lastMove.combat.attackerRolls = out.a.rolls; // Update with NEW rolls
            lastMove.rerolledBy = "attacker";
          }
          return newHistory;
        });

        setFx({ ...fx, a: out.a, ok: out.ok, isReroll: true });

        // Update display value to show the new roll
        setDispA(out.a.total);

        setTimeout(
          () => finishRockCombat(out.ok, lanceLungeUsed, from, to),
          TMG.rerollFinish
        );
      } else {
        // 'piece'
        const t = Bstate[to.y]?.[to.x]; // Safe navigation
        if (!t) return;
        const lanceLungeUsed =
          p.equip === "lance" &&
          to.y === from.y + (p.color === W ? 1 : -1) * 2 &&
          to.x === from.x;

        // Reroll BOTH attacker and defender dice
        let newA: number, newD: number, newRollsA: number[], newRollsD: number[];
        
        // Reroll attacker's dice
        const useAdvA = p.type === "K" || lanceLungeUsed;
        newRollsA = [d6(rngRef.current)];
        if (useAdvA) newRollsA.push(d6(rngRef.current));
        newA = useAdvA ? Math.max(...newRollsA) : newRollsA[0];
        
        // Reroll defender's dice (defender never has advantage)
        newRollsD = [d6(rngRef.current)];
        newD = newRollsD[0];

        // Update history AFTER getting new rolls (both attacker and defender rerolled)
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMove = newHistory[newHistory.length - 1];
          if (lastMove && lastMove.combat) {
            lastMove.combat.attackerRolls = newRollsA; // Update with NEW rolls
            lastMove.combat.defenderRolls = newRollsD; // Update with NEW rolls
            lastMove.rerolledBy = isPlayerAttacking ? "attacker" : "defender";
          }
          return newHistory;
        });

        // Update both attacker and defender fx since both are rerolled
        const newFxA = {
          ...fx.a,
          base: newA,
          total: newA + fx.a.mods.reduce((s: number, m: any) => s + m.value, 0),
          rolls: newRollsA,
        };
        const newFxD = {
          ...fx.d,
          base: newD,
          total: newD + fx.d.mods.reduce((s: number, m: any) => s + m.value, 0),
          rolls: newRollsD,
        };
        const newWin = newFxA.total >= newFxD.total;

        setFx({ ...fx, a: newFxA, d: newFxD, win: newWin, isReroll: true });

        // Update display values to trigger animation for both dice
        // The rerolled dice will show the new value, the other will bump/settle
        setDispA(newFxA.total);
        setDispD(newFxD.total);

        setTimeout(() => {
          const loser = newWin
            ? isPlayerAttacking
              ? t
              : p
            : isPlayerAttacking
            ? p
            : t;
          const winner = newWin
            ? isPlayerAttacking
              ? p
              : t
            : isPlayerAttacking
            ? t
            : p;

          if (loser) {
            let idsToDestroy = [loser.id];
            if (newWin && loser.equip === "skull" && winner) {
              idsToDestroy.push(winner.id);
            }
            setDestroyedPieceIds(idsToDestroy);
          }
          if (newWin) {
            sfx.capture();
          } else {
            sfx.combatLose();
          }

          setTimeout(() => {
            finishPieceCombat({ win: newWin }, lanceLungeUsed, from, to);
          }, 400);
        }, TMG.rerollFinish);
      }
    } else {
      // Player chose not to reroll
      const lanceLungeUsed =
        p.equip === "lance" &&
        to.y === from.y + (p.color === W ? 1 : -1) * 2 &&
        to.x === from.x;
      if (kind === "obstacle") {
        finishRockCombat(fx.ok, lanceLungeUsed, from, to);
      } else {
        const loser = fx.win ? Bstate[to.y]?.[to.x] : Bstate[from.y]?.[from.x]; // Safe navigation
        const winner = fx.win ? Bstate[from.y]?.[from.x] : Bstate[to.y]?.[to.x]; // Safe navigation
        if (loser) {
          let idsToDestroy = [loser.id];
          if (fx.win && loser.equip === "skull" && winner) {
            idsToDestroy.push(winner.id);
          }
          setDestroyedPieceIds(idsToDestroy);
          if (loser.color === W) {
            sfx.combatLose();
          } // Play sound only if player lost
          // Skull death sound is handled in finishPieceCombat now
          setTimeout(() => {
            finishPieceCombat(fx, lanceLungeUsed, from, to);
          }, 400);
        } else {
          // Should not happen in piece vs piece, but just in case
          finishPieceCombat(fx, lanceLungeUsed, from, to);
        }
      }
    }
    setRerollState(null);
    setPhase("playing");
  };

  const handleDisguiseChoice = (breakDisguise: boolean) => {
    if (!disguisePopupState) return;

    const { x, y } = disguisePopupState;
    const B1 = cloneB(Bstate);
    const p = B1[y]?.[x]; // Safe navigation

    if (!p || !p.originalType) return;

    if (breakDisguise) {
      sfx.reveal();
      p.type = p.originalType;
      p.originalType = undefined;
      p.equip = undefined;
      setB(B1);
      setSel({ x, y });
      // We need to calculate moves based on the *newly revealed* piece on the new board state
      setLegal(moves(B1, Tstate, obstacles, x, y, currentBoardSize));
    } else {
      setSel({ x, y });
      setLegal(moves(B1, Tstate, obstacles, x, y, currentBoardSize));
    }

    setDisguisePopupState(null);
    setPhase("playing");
  };

  const disguisedPiece = disguisePopupState
    ? Bstate[disguisePopupState.y]?.[disguisePopupState.x] // Safe navigation
    : null;
  const originalPieceType = disguisedPiece?.originalType;

  // --- Roguelike handlers ---
  const handleTryAgain = () => {
    // Fully reset run and return to Intro popup
    // Clear localStorage to remove all saved data
    localStorage.removeItem("dicechess_campaign_v1");
    
    setShowTransition(false);
    setShowIntro(true);
    setCurrentStoryCard(null);
    setStoryCardQueue([]);
    setStoryOutcome(null);
    setPhase("market");
    setWin(null);
    setMarketPoints(0);
    setUnspentGold(0);
    setKilledEnemyPieces([]);
    setThisLevelUnlockedItems([]);
    setCampaign({
      level: 1,
      whiteRoster: [],
      prayerDice: 2,
      unlockedItems: [],
      freeUnits: new Map(),
      freeItems: new Map(),
    });
    // Trigger fresh init
    setSeed(new Date().toISOString() + "-newgame");
  };

  const handleNextLevel = () => {
    // Calculate ransom gold (35% of regular pieces and items, excluding Kings)
    // Count purses separately (25g each, not subject to ransom %)
    const purseCount = killedEnemyPieces.filter((kp) => kp.piece.equip === "purse").length;
    const purseGold = purseCount * 25;

    const regularValue = killedEnemyPieces.reduce((sum, killedPiece) => {
      const piece = killedPiece.piece;

      // Skip Kings - they get full value, not ransom percentage
      if (piece.type === "K") return sum;

      // Regular piece values
      const pieceValue = VAL[piece.type as keyof typeof VAL] || 0;

      let itemValue = 0;
      if (piece.equip) {
        if (piece.equip !== "purse") {
          itemValue = ITEM_COSTS[piece.equip as keyof typeof ITEM_COSTS] || 0;
        }
      }
      return sum + pieceValue + itemValue;
    }, 0);
    const ransomGold = Math.floor(regularValue * 0.35);

    // Calculate King gold (full value, not ransom percentage)
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

    const totalGoldEarned = ransomGold + purseGold + kingGold;

    // Total gold to carry over = current unspent + ransom + king gold
    const totalGoldToCarry = marketPoints + totalGoldEarned;

    setUnspentGold(totalGoldToCarry); // Carry over all gold to next level
    setShowVictoryDetails(false); // Reset for next level
    setWin(null); // Clear win state
    setKilledEnemyPieces([]); // Clear killed pieces for next level
    setThisLevelUnlockedItems([]); // Clear unlocked items for next level
    const nextLevel = campaign.level + 1;
    setCampaign((prev) => ({
      ...prev,
      level: nextLevel,
      unlockedItems: prev.unlockedItems || [], // Preserve unlocked items
    }));
    // Generate a new seed that incorporates the level to ensure variation
    setSeed(new Date().toISOString() + `-level-${nextLevel}`);
    // useEffect watching seed AND campaign.level will call init with the correct (new) level and the saved unspentGold
    // init will load story cards into storyCardQueue, and we'll show the first one immediately
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 flex items-center justify-center relative">
      {/* Top-left controls - always visible */}
      <div className="fixed top-4 left-4 flex items-center gap-2 z-50">
        <button
          onClick={() => setShowRules((s) => !s)}
          className={`px-3 py-1 rounded-xl text-sm ${
            showRules
              ? "bg-emerald-700"
              : "bg-zinc-700 hover:bg-zinc-600"
          }`}
          title={showRules ? "Hide Game Rules" : "Show Game Rules"}
        >
          Game Rules
        </button>
      </div>
      {/* Top-right controls - always visible */}
      <div className="fixed top-4 right-4 flex items-center gap-2 z-50">
        <button
          onClick={() => setMuted((m) => !m)}
          className={`px-2 py-1 rounded-xl text-sm ${
            muted ? "bg-zinc-800" : "bg-zinc-700 hover:bg-zinc-600"
          }`}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={() => setFastMode((f) => !f)}
          className={`px-2 py-1 rounded-xl text-sm ${
            fastMode ? "bg-emerald-700" : "bg-zinc-700 hover:bg-zinc-600"
          }`}
          title={fastMode ? "Fast animations ON" : "Fast animations OFF"}
        >
          ⚡
        </button>
        <button
          onClick={() => setShowBoardTooltips((s) => !s)}
          className={`px-2 py-1 rounded-xl text-sm ${
            showBoardTooltips
              ? "bg-blue-700"
              : "bg-zinc-700 hover:bg-zinc-600"
          }`}
          title={showBoardTooltips ? "Tooltips ON" : "Tooltips OFF"}
        >
          ℹ️
        </button>
        {/* Hide New Game button during play */}
        {!win && (
          <button
            onClick={handleTryAgain}
            className="px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            New Game
          </button>
        )}
      </div>

      {showIntro && <IntroPopup onEnter={handleIntroComplete} />}
      {showTransition && (
        <div className="transition-overlay">
          <div className="transition-banner left" />
          <div className="transition-banner right" />
          <div className="transition-seal">
            <div className="transition-text">To Arms!</div>
          </div>
        </div>
      )}

      {/* Game Rules Modal */}
      {showRules && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[2000] p-4"
          onClick={(e) => {
            // Close modal when clicking the backdrop
            if (e.target === e.currentTarget) {
              setShowRules(false);
            }
          }}
        >
          <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 text-2xl font-bold bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center z-10"
              aria-label="Close Game Rules"
            >
              ×
            </button>
            <div className="bg-zinc-900 rounded-2xl p-6 max-h-[85vh] overflow-y-auto border-2 border-zinc-700">
              <h2 className="text-3xl font-bold mb-6 text-center">Game Rules</h2>
              <RulesContent 
                showItemInfo={showRulesItemInfo}
                setShowItemInfo={setShowRulesItemInfo}
              />
            </div>
          </div>
        </div>
      )}

      {/* Story Card System - only show if intro is dismissed */}
      {!showIntro && (currentStoryCard || storyOutcome) && (
        <StoryCard
          card={
            currentStoryCard ||
            storyOutcome?.lastCard || {
              id: "temp",
              bodyText: "",
              leftChoice: { text: "", events: [] },
              rightChoice: { text: "", events: [] },
            }
          }
          onChoice={handleStoryEvents}
          outcomeMode={
            storyOutcome
              ? {
                  outcomes: storyOutcome.outcomes,
                  onContinue: handleOutcomeAcknowledged,
                }
              : undefined
          }
          enableIdleAnimation={campaign.level === 1}
        />
      )}

      <div style={{ display: (showIntro || showTransition || currentStoryCard || storyOutcome) ? "none" : "block" }}>
        <div className="max-w-7xl mx-auto flex gap-8 justify-center flex-wrap md:flex-nowrap">
          <div className="order-1 w-full max-w-lg">
            {phase === "market" && currentLevelConfig?.marketEnabled !== false ? (
              <Market
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
                levelConfig={currentLevelConfig}
                campaign={campaign}
                marketPoints={marketPoints}
                setMarketPoints={setMarketPoints}
                setMarketAction={setMarketAction}
                setPrayerDice={setPrayerDice}
                setCampaign={setCampaign}
                sfx={sfx}
              />
            ) : (
              <div className="space-y-4">
                <GameInfo />
                <MoveHistoryLog history={moveHistory} phase={phase} />
              </div>
            )}
          </div>

          <div className="order-2 flex flex-col items-center">
            {/* Add Level indicator - Updated style */}
            <div className="text-2xl font-bold text-white mb-2">
              {currentLevelConfig?.name || `Level ${campaign.level}`}
            </div>
            <div className="mb-2 w-full flex justify-center items-center gap-4 text-base">
              <div
                className={`px-3 py-1 rounded-full font-semibold ${
                  win
                    ? "bg-gray-200 text-black"
                    : turn === W
                    ? "bg-white text-black"
                    : "bg-gray-700 text-white"
                }`}
              >
                {win
                  ? `Winner: ${win === W ? "White" : "Black"}${
                      phrase ? " — " + phrase : ""
                    }`
                  : turn === W
                  ? "Your Turn — White"
                  : "Bot Turn — Black"}
              </div>
              <div className="flex items-center gap-2 font-bold text-2xl">
                <span>🙏</span>
                <span className="text-purple-100">x{prayerDice}</span>
              </div>
            </div>
            <div className="stand" ref={boardRef}>
              <BoardComponent
                board={Bstate}
                T={Tstate}
                obstacles={obstacles}
                V={vis}
                sel={sel}
                legal={legal}
                click={click}
                fx={fx}
                phase={phase}
                dispA={dispA}
                dispD={dispD}
                bumpA={bumpA}
                bumpD={bumpD}
                wChk={wChk}
                bChk={bChk}
                speechBubble={speechBubble}
                marketAction={marketAction}
                onStartBattle={handleStartBattle}
                startBattleBtnRef={startBattleBtnRef}
                playBattleTrumpet={playBattleTrumpet}
                rerollState={rerollState}
                rerollTarget={rerollTarget}
                combatId={combatIdRef.current}
                destroyedPieceIds={destroyedPieceIds}
                failedAttackId={failedAttackId}
                showBoardTooltips={showBoardTooltips}
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
                drag={drag}
                startDrag={startDrag}
                lastMove={lastMove}
                moveAnim={moveAnim}
                sellPiece={sellPiece}
                sellButtonPos={sellButtonPos}
                setSellButtonPos={setSellButtonPos}
                boardSize={currentBoardSize}
                victoryConditions={currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"]}
                setSpeechBubble={setSpeechBubble}
                currentLevelConfig={currentLevelConfig}
              />
            </div>
          </div>
        </div>

        {showMarketConfirm && modalPosition && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
            <div
              className="bg-zinc-800 rounded-2xl p-6 shadow-lg text-white text-center absolute"
              style={{
                top: modalPosition.top,
                left: modalPosition.left,
                transform: "translate(-50%, -50%)", // Center it based on its own size
              }}
            >
              <h3 className="text-xl font-bold mb-4">You have unspent gold!</h3>
              <p className="mb-6">Are you sure you want to start the battle?</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setShowMarketConfirm(false)}
                  className="px-6 py-2 rounded-lg bg-zinc-600 hover:bg-zinc-500 font-bold"
                >
                  GO BACK
                </button>
                <button
                  onClick={() => {
                    setPhase("playing");
                    setShowMarketConfirm(false);
                  }}
                  className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold"
                >
                  BATTLE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Updated Win/Loss Modal */}
        <VictoryPopup
          win={win}
          showVictoryDetails={showVictoryDetails}
          phrase={phrase}
          thisLevelUnlockedItems={thisLevelUnlockedItems}
          killedEnemyPieces={killedEnemyPieces}
          handleNextLevel={handleNextLevel}
          handleTryAgain={handleTryAgain}
          winModalPosition={winModalPosition}
        />

        {phase === "awaiting_reroll" && rerollState && rerollPopupPosition && (
          <div
            className="fixed inset-0 bg-black/60 z-[2000]"
            onClick={() => handleReroll(false)}
          >
            <div
              className="bg-zinc-800 rounded-2xl p-5 shadow-lg text-white text-center absolute"
              style={{
                top: `${rerollPopupPosition.top}px`,
                left: `${rerollPopupPosition.left}px`,
                transform: "translate(-50%, -50%)",
                zIndex: 2100,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-3">Roll Failed!</h3>
              <p className="mb-4">
                Use a Prayer Die to reroll both dice? ({prayerDice} left)
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => handleReroll(false)}
                  className="px-5 py-2 rounded-lg bg-zinc-600 hover:bg-zinc-500 font-bold"
                >
                  No
                </button>
                <button
                  onClick={() => handleReroll(true)}
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-bold"
                >
                  Yes 🙏
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "awaiting_disguise_choice" &&
          disguisePopupState &&
          disguisePopupPosition && (
            <div
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => {
                setDisguisePopupState(null);
                setPhase("playing");
              }}
            >
              <div
                className="bg-zinc-800 rounded-2xl p-5 shadow-lg text-white text-center absolute"
                style={{
                  top: `${disguisePopupPosition.top}px`,
                  left: `${disguisePopupPosition.left}px`,
                  transform: "translate(-50%, -110%)",
                  zIndex: 100,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold mb-3">Break Disguise?</h3>
                <div className="flex justify-center gap-4 mt-4">
                  <button
                    onClick={() => handleDisguiseChoice(false)}
                    className="px-5 py-2 rounded-lg bg-zinc-600 hover:bg-zinc-500 font-bold"
                  >
                    Move as Pawn
                  </button>
                  {originalPieceType && PIECE_NAMES[originalPieceType as keyof typeof PIECE_NAMES] && (
                    <button
                      onClick={() => handleDisguiseChoice(true)}
                      className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 font-bold"
                    >
                      Reveal {PIECE_NAMES[originalPieceType as keyof typeof PIECE_NAMES]} (
                      {/* Ensure originalPieceType is a valid key before accessing GL */}
                      {(() => {
                        const glyphSet = GL[originalPieceType as keyof typeof GL];
                        return glyphSet && W in glyphSet ? glyphSet[W as keyof typeof glyphSet] : "?";
                      })()})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        {moveAnim &&
          (() => {
            if (!boardRef.current) return null;
            const boardRect = boardRef.current.getBoundingClientRect();
            const fromVisualY = currentBoardSize - 1 - moveAnim.from.y;
            const fromPos = {
              left: boardRect.left + 12 + 24 + moveAnim.from.x * 88,
              top: boardRect.top + 12 + fromVisualY * 88,
            };
            const toVisualY = currentBoardSize - 1 - moveAnim.to.y;
            const toPos = {
              left: boardRect.left + 12 + 24 + moveAnim.to.x * 88 + 6,
              top: boardRect.top + 12 + toVisualY * 88 + 2,
            };
            const dx = toPos.left - fromPos.left;
            const dy = toPos.top - fromPos.top;

            return createPortal(
              <div
                className="moving-piece"
                style={{
                  position: "fixed",
                  top: fromPos.top,
                  left: fromPos.left,
                  transform: `translate3d(${dx}px, ${dy}px, 0)`,
                  transition: `transform ${PIECE_MOVE_MS}ms ${PIECE_MOVE_EASE}`,
                  pointerEvents: "none",
                  zIndex: 80,
                  width: "88px",
                  height: "88px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className={`chip ${moveAnim.color === "w" ? "pw" : "pb"}`}
                >
                  {moveAnim.glyph}
                </span>
                {moveAnim.equip && (
                  <span className="equip-icon">
                    {equipIcon(moveAnim.equip)}
                  </span>
                )}
              </div>,
              document.body
            );
          })()}
        {drag &&
          createPortal(
            <div
              style={{
                position: "fixed",
                left: drag.clientX - drag.offsetX,
                top: drag.clientY - drag.offsetY,
                pointerEvents: "none",
                zIndex: 80,
                width: "88px",
                height: "88px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "scale(1.1)",
                transformOrigin: `${drag.offsetX}px ${drag.offsetY}px`,
              }}
            >
              <span className={`chip ${drag.color === "w" ? "pw" : "pb"}`}>
                {drag.glyph}
              </span>
              {drag.equip && (
                <span className="equip-icon">{equipIcon(drag.equip)}</span>
              )}
            </div>,
            document.body
          )}
      </div>

      <TooltipLayer tip={tooltip} />
      {namingState && nameInputPosition && (
        <NameInputComponent
          position={nameInputPosition}
          onConfirm={handleNameConfirm}
          onCancel={handleNameCancel}
        />
      )}
      
      {/* ========== DEV TOOLS - COMMENT OUT BEFORE RELEASE ========== */}
      {showDevPanel && (
        <div
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.9)",
            color: "#00ff00",
            padding: "12px",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "12px",
            border: "2px solid #00ff00",
            minWidth: "180px",
          }}
        >
          <div style={{ marginBottom: "8px", fontWeight: "bold", fontSize: "14px" }}>
            🛠️ DEV TOOLS <span style={{ fontSize: "10px", opacity: 0.6 }}>(Ctrl/Cmd+D)</span>
          </div>
          <div style={{ marginBottom: "8px", fontSize: "11px", opacity: 0.8 }}>
            Current Level: <strong>{campaign.level}</strong>
          </div>
          <div style={{ marginBottom: "8px", fontSize: "10px", opacity: 0.6 }}>
            Jump to Level:
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => {
                  setCampaign((prev) => ({
                    ...prev,
                    level,
                    whiteRoster: [], // Reset roster when jumping levels
                  }));
                  setShowIntro(true); // Show intro popup which leads to story cards
                  setWin(null);
                  // Let init() handle phase setting - don't override it here
                  // Generate new seed to trigger re-init
                  setSeed(new Date().toISOString() + `-level-${level}`);
                }}
                style={{
                  background: campaign.level === level ? "#00ff00" : "#222",
                  color: campaign.level === level ? "#000" : "#00ff00",
                  border: "1px solid #00ff00",
                  padding: "6px 12px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  fontWeight: "bold",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (campaign.level !== level) {
                    e.currentTarget.style.background = "#333";
                  }
                }}
                onMouseLeave={(e) => {
                  if (campaign.level !== level) {
                    e.currentTarget.style.background = "#222";
                  }
                }}
              >
                Level {level}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowDevPanel(false)}
            style={{
              background: "#ff0000",
              color: "#fff",
              border: "none",
              padding: "6px 10px",
              cursor: "pointer",
              borderRadius: "4px",
              fontSize: "11px",
              width: "100%",
              fontWeight: "bold",
            }}
          >
            Hide Panel
          </button>
        </div>
      )}
      {/* ============================================================ */}
    </div>
  );
}
