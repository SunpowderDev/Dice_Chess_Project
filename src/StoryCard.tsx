import React, { useState } from "react";
import type { StoryCard as StoryCardType, StoryEvent, PieceType, Equip } from "./types";
import { GL } from "./constants";

const equipIcon = (e: Equip) =>
  e === "sword"
    ? "🗡️"
    : e === "shield"
    ? "🛡️"
    : e === "lance"
    ? "🪓"
    : e === "torch"
    ? "🔦"
    : e === "bow"
    ? "🏹"
    : e === "staff"
    ? "🪄"
    : e === "crystal_ball"
    ? "🔮"
    : e === "disguise"
    ? "🎭"
    : e === "scythe"
    ? "💀"
    : e === "banner"
    ? "🚩"
    : e === "curse"
    ? "🌀"
    : e === "skull"
    ? "💀"
    : e === "purse"
    ? "💰"
    : null;

interface StoryCardProps {
  card: StoryCardType;
  onChoice: (events: StoryEvent[]) => void;
}

const StoryCard: React.FC<StoryCardProps> = ({ card, onChoice }) => {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  const SWIPE_THRESHOLD = 150; // pixels needed to trigger choice
  const MAX_DRAG = 250; // maximum drag distance

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const diff = e.clientX - startX;
    // Clamp drag between -MAX_DRAG and MAX_DRAG
    const clampedDrag = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, diff));
    setDragX(clampedDrag);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    // Check if swipe exceeded threshold
    if (dragX < -SWIPE_THRESHOLD) {
      // Swiped left
      onChoice(card.leftChoice.events);
    } else if (dragX > SWIPE_THRESHOLD) {
      // Swiped right
      onChoice(card.rightChoice.events);
    }
    
    // Reset position
    setDragX(0);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragX(0);
    }
  };

  // Calculate opacity for choice text based on drag distance
  const leftOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD));
  const rightOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD));

  // Get character glyph if character is specified
  const getCharacterGlyph = () => {
    if (!card.character) return null;
    
    const pieceGlyphSet = GL[card.character.type as keyof typeof GL];
    const colorKey = card.character.color as "w" | "b";
    const glyph = pieceGlyphSet && pieceGlyphSet[colorKey] ? pieceGlyphSet[colorKey] : "?";
    
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className={`chip ${card.character.color === "w" ? "pw" : "pb"}`} style={{ width: '48px', height: '48px', fontSize: '40px' }}>
          {glyph}
        </span>
        {card.character.equip && (
          <span className="text-2xl">{equipIcon(card.character.equip)}</span>
        )}
      </div>
    );
  };

  return (
    <div className="story-card-container">
      <div className="story-card-overlay" />
      
      <div className="story-card">
        {/* Character icon at top */}
        {card.character && (
          <div className="story-card-character">
            {getCharacterGlyph()}
          </div>
        )}

        {/* Body text at top */}
        <div className="story-card-text">
          {card.bodyText}
        </div>

        {/* Swipeable image area */}
        <div 
          className="story-card-image-container"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div 
            className="story-card-image"
            style={{
              transform: `translateX(${dragX}px) rotate(${dragX * 0.02}deg)`,
              transition: isDragging ? 'none' : 'transform 0.3s ease-out',
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            {card.image ? (
              <img src={card.image} alt="Story scene" className="w-full h-full object-cover rounded-lg" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center text-gray-500">
                [Image]
              </div>
            )}

            {/* Choice overlays when dragging */}
            {isDragging && (
              <>
                <div 
                  className="story-choice-overlay left"
                  style={{ opacity: leftOpacity }}
                >
                  <div className="story-choice-text">
                    ← {card.leftChoice.text}
                  </div>
                </div>
                
                <div 
                  className="story-choice-overlay right"
                  style={{ opacity: rightOpacity }}
                >
                  <div className="story-choice-text">
                    {card.rightChoice.text} →
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Character name at bottom */}
        {card.character && (
          <div className="story-card-name">
            {card.character.name}
          </div>
        )}

        {/* Hint text */}
        <div className="story-card-hint">
          Swipe left or right to choose
        </div>
      </div>
    </div>
  );
};

export default StoryCard;

