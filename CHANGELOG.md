# Changelog

All notable changes to DiceChess Mono will be documented in this file.

## [0.5.0] - 2024

### Added

#### Story Cards System
- **Reigns-style Story Cards**: Interactive story cards that appear at the start of each level to set the stage and escalate stakes
- **Branching Dialogue**: Support for chaining story cards together to create branching narrative paths
- **Character Integration**: Story cards feature character glyphs with name tags and equipment, matching their in-game appearance
- **Medieval Styling**: Character cards use a beautiful medieval framed miniature style with speech bubbles
- **Narrator Mode**: Option to use simple narrator cards without character visuals
- **Swipe Interaction**: Intuitive left/right swipe gestures to make choices
- **Choice Events**: Story card choices can trigger various events:
  - Chain to next story card (branching dialogue)
  - Give/remove gold
  - Give items or units to player/enemy
  - Award Prayer Dice
  - Start battle phase
- **Outcome Feedback**: Clear visual feedback showing the results of player choices
- **Battle Transition**: Epic medieval transition animation ("To Arms!") when moving from story to battle

#### Roguelike Progression
- **Level-based Campaign**: Agile progression system where players advance through multiple levels
- **Resource Management**: Gold and items carry over between levels (unspent gold persists)
- **Ransom System**: Collect gold from captured enemy pieces (35% of piece value)
- **King Capture Rewards**: Full gold value for capturing enemy kings
- **New Game Reset**: Complete reset functionality that returns to the intro screen and clears all progress
- **Try Again**: Full reset on game loss that starts fresh from the beginning

#### Featured Characters
- **Custom Character Pieces**: Special preconfigured pieces with names, equipment, and unique speech bubbles
- **Visual Distinction**: Featured characters have golden name plates and stand out from market-bought units
- **Character Speech**: Featured pieces can deliver contextual speech bubbles during gameplay
- **Emphasis Animation**: Special text animation for emphasized words in speech bubbles (wave effect)

#### Text Animations
- **Animated Speech Bubbles**: Text appears letter-by-letter with smooth animation
- **Emphasis Markers**: Use `**text**` syntax to mark words for special emphasis animation
- **Wave Effect**: Emphasized words animate with a wave motion (letters move up and down)
- **Story Card Animations**: Body text in story cards also animates in letter-by-letter
- **Sound Effects**: Text blips play during text animation for audio feedback

### Changed

- **Game Flow**: Changed from `Market → Battle` to `Intro → Story → Market → Battle`
- **Story Card Layout**: Character display moved to top-left with medieval framed miniature style
- **Name Plate Styling**: Golden gradient name plates for featured characters, black for market units
- **Battle Transitions**: Improved transition animation that fully covers screen before revealing new phase

### Technical Improvements

- **WebAudio API**: Replaced HTML audio with WebAudio API for more reliable sound playback
- **Sound Effects**: Added button click sounds, swipe sounds, and text animation blips
- **Battle Trumpet**: Epic horn sound when starting battles
- **Transition Sounds**: Medieval horn sounds during battle transitions

---

## Previous Versions

*Earlier changelog entries to be added as needed.*

