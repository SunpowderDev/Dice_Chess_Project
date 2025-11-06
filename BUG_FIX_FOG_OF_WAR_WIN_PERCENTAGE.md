# Bug Fix: Fog of War Win Percentage Calculation

## Issue
When attacking into fog of war, the displayed win percentage was incorrectly calculated using the defender's hidden equipment, revealing information the player shouldn't have access to.

### Example Scenario (User's Bug Report)
- Player's Queen with Scythe attacks an enemy unit in fog
- Win percentage shows 100%
- Player attacks and their Queen dies unexpectedly
- **Root Cause**: The defender in fog had a Scythe equipped, which always rolls 6 when defending against a Queen (non-pawn). The win percentage calculation was using this hidden equipment information, showing an incorrect 100% win chance.

## Root Cause Analysis

### The Scythe Item
According to the item description in `constants.ts`:
```typescript
scythe: "🪓Scythe: Always rolls a 6 against pawns."
```

The `winPercent` function correctly implements this:
- Line 2327-2328: If attacker has scythe AND defender is a pawn → attacker rolls 6
- Line 2339-2340: If defender has scythe AND attacker is a pawn → defender rolls 6

### The Bug
In the `BoardComponent` function (around line 3103), when displaying the win percentage overlay for a potential attack:

**Before Fix:**
```typescript
pct = winPercent(board, T, obstacles, a, d, sel!, { x, y }, boardSize);
```

This passed the actual defender piece `d` from the board, including all hidden properties like equipment, even when the defender was in fog.

### What Went Wrong
1. Player selects Queen with Scythe
2. Hovers over enemy in fog (defender has Scythe but player can't see it)
3. `winPercent` calculates using defender's hidden Scythe equipment
4. If defender has Scythe and attacker is not a pawn, defender gets automatic 6 roll
5. Win percentage displayed to player is based on this hidden information
6. Player sees incorrect odds (e.g., 100% when it should be much lower)
7. Player attacks and loses because the hidden Scythe triggers

## The Fix

### Change 1: Display Win Percentage (Line ~3099-3113)
Strip equipment from defender when calculating win percentage for display if the defender is in fog:

```typescript
let pct: number | undefined;
if (showPct && attacker && targetPiece) {
  const a = attacker as Piece;
  let d = targetPiece as Piece;
  
  // FOG OF WAR FIX: If the defender is in fog, strip their equipment
  // so win percentage doesn't reveal hidden information
  const inFog = !V[y]?.[x];
  if (inFog && d.equip) {
    d = { ...d, equip: undefined };
  }
  
  pct = winPercent(board, T, obstacles, a, d, sel!, { x, y }, boardSize);
}
```

### Change 2: Move History Win Percentage (Line ~6812-6844)
Also fix the move history to record the win percentage as the player saw it:

```typescript
// FOG OF WAR FIX: Calculate win% as the player saw it (without hidden equipment)
const defenderInFog = !vis[to.y]?.[to.x];
let defenderForWinPct = t;
if (defenderInFog && t.equip) {
  defenderForWinPct = { ...t, equip: undefined };
}
const winPct = winPercent(
  Bstate,
  Tstate,
  obstacles,
  p,
  defenderForWinPct,
  from,
  to,
  currentBoardSize
);
```

## What This Fix Does
1. **Checks Visibility**: Before calculating win percentage, checks if target square is in fog using the visibility matrix `V[y][x]`
2. **Strips Hidden Equipment**: If defender is in fog, creates a copy of the defender without equipment for the calculation
3. **Accurate Display**: Player now sees win percentage based only on visible information
4. **Historical Accuracy**: Move history records what the player saw, not the hidden truth

## Testing Recommendations
1. Equip a unit with Scythe
2. Place it in fog (enemy back ranks)
3. Attack it with a non-pawn piece
4. Verify win percentage shown is not 0% (which would be the case if defender's hidden Scythe was being used in calculation)
5. Verify the displayed percentage matches expected calculation without special equipment

## Files Modified
- `src/Dice_Chess.tsx` - Two locations:
  - ~Line 3099-3113: Display win percentage calculation
  - ~Line 6812-6844: Move history win percentage recording

## Build Status
✅ Project builds successfully with no compilation errors
⚠️ Some existing ESLint warnings (unrelated to this fix)

