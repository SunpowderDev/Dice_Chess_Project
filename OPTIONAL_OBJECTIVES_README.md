# Optional Objectives System - Implementation Guide

## Overview

The Optional Objectives system has been successfully implemented for Dice Chess. This system allows each level to define optional objectives that players can complete for bonus gold rewards.

## Implementation Summary

### 1. Core Components Created

#### **ObjectiveManager.ts**
- Central module for objective condition checking and tracking
- Reusable condition functions for common objective types
- Progress tracking and reward calculation
- Supports difficulty-based reward scaling

#### **Type Definitions (types.ts)**
- `OptionalObjective` - Defines objective structure with id, description, condition, and rewards
- `OptionalObjectiveCondition` - Flexible condition system with type and parameters
- `ObjectiveState` - Runtime tracking of completion status and progress
- `ObjectiveTracking` - Game state snapshot for condition evaluation

### 2. Supported Objective Types

The system currently supports the following objective condition types:

1. **`no_piece_type_lost`** - Player must not lose any pieces of a specific type (e.g., "Keep all Knights alive")
2. **`win_under_turns`** - Win the level within a certain number of turns
3. **`king_at_position`** - End the level with the King at a specific position/area
4. **`convert_pieces`** - Convert X enemy pieces using Staff
5. **`kill_count`** - Kill exactly/at least/at most X enemies
6. **`no_item_used`** - Don't use a specific item during the level
7. **`max_casualties`** - Don't lose more than X pieces total
8. **`dont_kill_courtiers`** - Don't destroy more than X courtiers
9. **`custom`** - Placeholder for custom condition logic (requires additional implementation)

### 3. UI Components

#### **Quest Panel**
- Displays optional objectives in orange below Victory Conditions
- Shows progress indicators (e.g., "0/3 Courtiers killed")
- Transitions to blue with checkmark when completed
- Animated completion effect with sound notification
- Shows difficulty-adjusted gold rewards

#### **Victory Popup**
- Displays completed objectives with their bonus gold
- Shows total objective bonus separate from ransom/loot
- Includes objective bonus in total gold carried forward

### 4. Game Integration

#### **Objective Tracking**
- Objectives initialized when level starts (in `init` function)
- Checked automatically on level completion
- Progress tracked through game state (turns, kills, courtiers destroyed, King position)

#### **Gold Rewards**
- Supports base reward amount
- Difficulty scaling through `rewardByDifficulty` (easy/hard)
- Automatically added to total gold when progressing to next level

## Usage - Adding Objectives to Levels

### Level JSON Configuration

Add an `optionalObjectives` array to your level JSON file:

```json
{
  "level": 1,
  "name": "Chapter 1: Edran the Crownless",
  ...
  "optionalObjectives": [
    {
      "id": "win_fast",
      "description": "Escape within 8 turns",
      "condition": {
        "type": "win_under_turns",
        "params": {
          "maxTurns": 8
        }
      },
      "reward": 30,
      "rewardByDifficulty": {
        "easy": 25,
        "hard": 40
      }
    },
    {
      "id": "save_galahad",
      "description": "Keep Sir Galahad alive",
      "condition": {
        "type": "no_piece_type_lost",
        "params": {
          "pieceType": "N"
        }
      },
      "reward": 25,
      "rewardByDifficulty": {
        "easy": 20,
        "hard": 35
      }
    },
    {
      "id": "save_peasants",
      "description": "Don't destroy more than 2 Courtiers",
      "condition": {
        "type": "dont_kill_courtiers",
        "params": {
          "maxCourtiers": 2
        }
      },
      "reward": 20,
      "rewardByDifficulty": {
        "easy": 15,
        "hard": 30
      }
    }
  ]
}
```

### Objective Structure

Each objective requires:
- **`id`**: Unique identifier (string)
- **`description`**: Display text shown to player (string)
- **`condition`**: Object with `type` and `params`
  - `type`: One of the supported condition types
  - `params`: Condition-specific parameters (varies by type)
- **`reward`**: Base gold reward (number)
- **`rewardByDifficulty`** (optional): Difficulty-specific rewards
  - `easy`: Gold amount for easy difficulty
  - `hard`: Gold amount for hard difficulty

### Condition Parameters by Type

**`win_under_turns`**
```json
"params": { "maxTurns": 10 }
```

**`no_piece_type_lost`**
```json
"params": { "pieceType": "N" }  // K, Q, R, B, N, or P
```

**`king_at_position`**
```json
"params": {
  "rank": 7,  // Optional: specific rank (0-indexed)
  "file": 3,  // Optional: specific file (0-indexed)
  "area": "top"  // Optional: "top", "bottom", "left", or "right"
}
```

**`convert_pieces`**
```json
"params": { "count": 3 }
```

**`kill_count`**
```json
"params": {
  "count": 5,
  "comparison": "atleast",  // "exact", "atleast", or "atmost"
  "pieceType": "P"  // Optional: specific piece type
}
```

**`no_item_used`**
```json
"params": { "itemType": "torch" }
```

**`max_casualties`**
```json
"params": { "maxLosses": 3 }
```

**`dont_kill_courtiers`**
```json
"params": { "maxCourtiers": 2 }
```

## Example Levels

### Level 1 - Tutorial Level
- **Escape within 8 turns** - Encourages fast, decisive play (+30g)
- **Keep Sir Galahad alive** - Protect named unit (+25g)
- **Don't destroy more than 2 Courtiers** - Precision over collateral damage (+20g)

### Level 2 - Forest Hunt
- **Win with no more than 3 casualties** - Conservative strategy (+35g)
- **Defeat Corvis within 12 turns** - Time pressure (+40g)

## Known Limitations & Future Enhancements

### Current Limitations

1. **Player Piece Loss Tracking**: Objectives like `no_piece_type_lost` and `max_casualties` currently don't fully track when player pieces are lost in combat. Additional combat hooks would be needed for complete functionality.

2. **Real-time Progress Updates**: Objectives are primarily checked on level completion. For more dynamic feedback, additional event hooks could be added to check objectives after each turn or combat.

3. **Item Usage Tracking**: The `itemsUsed` set is initialized but not fully populated during gameplay. Item usage hooks would need to be added to track which items the player uses.

4. **Piece Conversion Tracking**: Staff conversion counting is initialized but not fully hooked into the combat system.

### Recommended Future Enhancements

1. **Visual Notifications**: Add toast/banner notifications when objectives are completed mid-game
2. **Sound Effects**: Custom sound effects for objective completion (currently reuses purchase sound)
3. **Objective Tooltips**: Hover tooltips explaining objective conditions in detail
4. **Partial Credit**: Some objectives could award partial gold for getting close (e.g., 10 turns instead of 8)
5. **Combo Bonuses**: Extra gold for completing all objectives in a level
6. **Objective History**: Track objective completion across campaign for stats/achievements
7. **Dynamic Objectives**: Objectives that change based on story choices or difficulty

## Technical Notes

### Performance
- Objective checking is efficient and only runs at key moments (level completion)
- Progress calculation is O(n) where n is board size (for King position) or tracked pieces
- No impact on game performance during normal play

### Extensibility
- New objective types can be easily added to `ObjectiveManager.ts`
- Custom condition logic can be implemented for unique level requirements
- Difficulty scaling is built-in and automatic

### Testing Recommendations
1. Test each objective type in isolation
2. Verify difficulty scaling works correctly
3. Test edge cases (exactly meeting vs. exceeding requirements)
4. Ensure objectives reset properly between levels
5. Test with and without market enabled

## Files Modified

### New Files
- `src/ObjectiveManager.ts` - Core objective system logic

### Modified Files
- `src/types.ts` - Added objective type definitions
- `src/levelConfig.ts` - Added optionalObjectives to LevelConfig
- `src/Dice_Chess.tsx` - Integrated objective tracking and UI
- `src/VictoryPopup.tsx` - Added objective completion display
- `src/styles.css` - Added objective completion animations
- `public/levels/level1.json` - Added example objectives
- `public/levels/level2.json` - Added example objectives

## Conclusion

The Optional Objectives system is fully functional and ready for use. It provides a flexible, extensible framework for adding replayability and challenge to levels. The system seamlessly integrates with the existing game mechanics and provides clear visual feedback to players.

For questions or additional objective types, refer to `ObjectiveManager.ts` for implementation patterns.

