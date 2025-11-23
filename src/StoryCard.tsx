import React, { useState, useEffect, useRef } from "react";
import type {
  StoryCard as StoryCardType,
  StoryEvent,
  Equip,
  OutcomeData,
} from "./types";
import { GL } from "./constants";

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
    : null;

interface StoryCardProps {
  card: StoryCardType;
  onChoice: (events: StoryEvent[]) => void;
  outcomeMode?: {
    outcomes: OutcomeData[];
    onContinue: () => void;
  };
  enableIdleAnimation?: boolean;
}

const StoryCard: React.FC<StoryCardProps> = ({ card, onChoice, outcomeMode, enableIdleAnimation = false }) => {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const dragXRef = useRef(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const ensureAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        audioCtxRef.current = new Ctx();
      }
    }
    return audioCtxRef.current;
  };

  const playTextBlip = () => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "square";
      osc.frequency.value = 380; // medieval-ish
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  };

  const SWIPE_THRESHOLD = 80; // pixels needed to trigger choice
  const MAX_DRAG = 120; // maximum drag distance

  // Sound effects
  const playButtonClickSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2W67OeeSwwPUKvl8bVjHAU2jdXxz3ktBSh+zPLaizsKFF+z6OyoVRQKRp/g8r5sIQUrgs/y2Ik2CBlmu+znmksNEE6r5fG2YhwGOI3V8c95LQUofsvw2os4ChRgs+jrqFUUCkWd4O++bSEGKoLN8tmJNggaaLvs6Z5MEA9Nq+XytmMcBjiO1PHPeS0FJ37L8NqLOAoUYLPo66hVFApFneHvvmwhBSmCzvHaiTcIGmi77OmeSwwPTqvl8rVkHAU3');
      audio.volume = 0.15;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  const playSwipeSound = () => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const duration = 0.18;
      const sr = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.floor(sr * duration), sr);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1000;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + duration);
    } catch (e) {}
  };

  const playRewardSound = () => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      
      // Create ascending arpeggio for reward feel
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        osc.connect(gain);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.25);
      });
      
      gain.connect(ctx.destination);
    } catch (e) {}
  };

  // Play reward sound when outcomes appear
  useEffect(() => {
    if (outcomeMode && outcomeMode.outcomes.length > 0) {
      playRewardSound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomeMode]);

  // Complete text animation immediately (called when card is swiped)
  const completeTextAnimation = () => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
    // Set text to full immediately
    const fullText = card.bodyText.replace(/\*\*/g, '');
    setDisplayedText(fullText);
    setIsAnimating(false);
  };

  // Animate text letter by letter
  useEffect(() => {
    if (outcomeMode) return; // Don't animate in outcome mode
    
    // Remove ** markers from text for animation (we'll add styling via parseText)
    const text = card.bodyText.replace(/\*\*/g, '');
    setDisplayedText("");
    setIsAnimating(true);

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.substring(0, currentIndex + 1));
        currentIndex++;
        
        // Play sound every few characters
        if (currentIndex % 3 === 0) {
          playTextBlip();
        }
      } else {
        clearInterval(interval);
        animationIntervalRef.current = null;
        setIsAnimating(false);
      }
    }, 30); // 30ms per character

    animationIntervalRef.current = interval;

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.bodyText, outcomeMode]);

  // Parse text with **emphasis** - works with original bodyText structure
  const parseText = (displayText: string) => {
    // Parse original bodyText to find emphasis markers
    const originalText = card.bodyText;
    const parts = originalText.split(/(\*\*.*?\*\*)/g);
    
    let currentPos = 0;
    const elements: JSX.Element[] = [];
    
    parts.forEach((part, idx) => {
      if (!part) return;
      
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const innerText = part.slice(2, -2); // Remove ** markers
        const partLength = innerText.length;
        
        // Check if this part should be displayed based on displayText length
        const visibleLength = Math.max(0, Math.min(partLength, displayText.length - currentPos));
        
        if (visibleLength > 0) {
          elements.push(
            <span key={idx} className="speech-emphasis">
              {innerText.substring(0, visibleLength).split('').map((letter, i) => (
                <span
                  key={i}
                  className="speech-letter"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {letter}
                </span>
              ))}
            </span>
          );
        }
        currentPos += partLength;
      } else {
        // Regular text
        const partLength = part.length;
        const visibleLength = Math.max(0, Math.min(partLength, displayText.length - currentPos));
        
        if (visibleLength > 0) {
          elements.push(<span key={idx}>{part.substring(0, visibleLength)}</span>);
        }
        currentPos += partLength;
      }
    });
    
    return elements;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
  };

  // Use document-level event listeners for dragging to work outside the container
  useEffect(() => {
    if (!isDragging) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      // Clamp drag between -MAX_DRAG and MAX_DRAG
      const clampedDrag = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, diff));
      dragXRef.current = clampedDrag;
      setDragX(clampedDrag);
      
      // Complete text animation immediately if user crosses swipe threshold
      if (animationIntervalRef.current && (Math.abs(clampedDrag) >= SWIPE_THRESHOLD)) {
        completeTextAnimation();
      }
    };

    const handleDocumentMouseUp = () => {
      const currentDragX = dragXRef.current;
      
      // Complete text animation immediately if still animating (before processing swipe)
      if (animationIntervalRef.current) {
        completeTextAnimation();
      }
      
      // Stop dragging and reset position first
      setIsDragging(false);
      setDragX(0);
      dragXRef.current = 0;
      
      // Then handle choice after state is updated
      setTimeout(() => {
        if (currentDragX < -SWIPE_THRESHOLD) {
          // Swiped left - play swipe sound
          playSwipeSound();
          onChoice(card.leftChoice.events);
        } else if (currentDragX > SWIPE_THRESHOLD) {
          // Swiped right - play swipe sound
          playSwipeSound();
          onChoice(card.rightChoice.events);
        }
      }, 0);
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, startX]);

  // Calculate opacity for choice text based on drag distance
  const leftOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD));
  const rightOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD));

  // Get overlay background style for left choice
  const getLeftOverlayStyle = () => {
    if (card.leftChoice.overlayColor) {
      return {
        opacity: leftOpacity,
        background: `linear-gradient(to right, ${card.leftChoice.overlayColor}, transparent)`,
      };
    }
    // Default behavior - use CSS classes
    return { opacity: leftOpacity };
  };

  // Get overlay background style for right choice
  const getRightOverlayStyle = () => {
    if (card.rightChoice.overlayColor) {
      return {
        opacity: rightOpacity,
        background: `linear-gradient(to left, ${card.rightChoice.overlayColor}, transparent)`,
      };
    }
    // Default behavior - use CSS classes
    return { opacity: rightOpacity };
  };

  // Get character display (styled like board pieces)
  const getCharacterDisplay = () => {
    if (!card.character) return null;

    const pieceGlyphSet = GL[card.character.type as keyof typeof GL];
    const colorKey = card.character.color as "w" | "b";
    const glyph =
      pieceGlyphSet && colorKey in pieceGlyphSet ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet] : "?";

    return (
      <div className="piece-container" style={{ width: '88px', height: '88px' }}>
        <span className={`chip ${card.character.color === "w" ? "pw" : "pb"}`}>
          {glyph}
        </span>
        {card.character.equip && (
          <span className="equip-icon">
            {equipIcon(card.character.equip)}
          </span>
        )}
        {card.character.name && card.character.name !== "Narrator" && (
          <span className="piece-name preconfigured">
            {card.character.name}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="story-card-container" onMouseDown={() => ensureAudioContext()?.resume().catch(() => {})}>
      <div className="story-card-overlay" />

      <div className="story-card">
        {/* Medieval framed miniature: Character + Speech - hidden in outcome mode */}
        {!outcomeMode && card.character && card.character.name !== "Narrator" && (
          <div className="story-miniature">
            <div className="miniature-frame">
              {/* Character portrait on left */}
              <div className="miniature-character">{getCharacterDisplay()}</div>

              {/* Speech bubble coming from character */}
              <div className="miniature-speech">
                <div className="speech-tail" />
                <div className="speech-content">{parseText(displayedText)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Body text for cards without character or Narrator mode - hidden in outcome mode */}
        {!outcomeMode && (!card.character || card.character.name === "Narrator") && (
          <div className="story-card-text">{parseText(displayedText)}</div>
        )}

        {/* Outcome mode - show results */}
        {outcomeMode ? (
          <div className="story-outcome-area">
            <div className={outcomeMode.outcomes.length > 3 ? "space-y-2" : "space-y-4"}>
              {outcomeMode.outcomes.map((outcome, idx) => {
                const isCompact = outcomeMode.outcomes.length > 3;
                return (
                  <div
                    key={idx}
                    className={`${outcome.bgColor} border-2 ${outcome.borderColor} rounded-lg ${isCompact ? 'p-3' : 'p-5'} ${outcome.color} text-center font-bold shadow-lg transform transition-all duration-300`}
                    style={{
                      animation: `outcomeAppear 0.4s ease-out ${idx * 0.15}s both, outcomePulse 1s ease-in-out ${idx * 0.15 + 0.4}s both`,
                    }}
                  >
                    <div className="flex items-center justify-center gap-3">
                      <span className={isCompact ? "text-2xl" : "text-4xl"} style={{ animation: `glyphSpin 0.6s ease-out ${idx * 0.15}s both` }}>
                        {outcome.glyph}
                      </span>
                      <span className={isCompact ? "text-lg" : "text-2xl"} style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>{outcome.message}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Swipeable image area */}
            <div
              className={`story-card-image-container ${!isDragging && !isAnimating && enableIdleAnimation ? 'idle-hint' : ''}`}
              onMouseDown={handleMouseDown}
            >
              <div
                className="story-card-image"
                style={{
                  transform: !isDragging && !isAnimating && enableIdleAnimation 
                    ? undefined 
                    : `translateX(${dragX}px) rotate(${dragX * 0.02}deg)`,
                  transition: isDragging ? "none" : "transform 0.3s ease-out",
                  cursor: isDragging ? "grabbing" : "grab",
                }}
              >
                {card.image ? (
                  <img
                    key={`${card.id}-${card.image}`}
                    src={(() => {
                      const imagePath = card.image;
                      // If already a full URL or data URI, use as-is
                      if (imagePath.startsWith('http') || imagePath.startsWith('data:')) {
                        return imagePath;
                      }
                      // If already starts with PUBLIC_URL, use as-is (avoid double prefixing)
                      const publicUrl = process.env.PUBLIC_URL || '';
                      if (publicUrl && imagePath.startsWith(publicUrl)) {
                        return imagePath;
                      }
                      // Otherwise, prepend PUBLIC_URL with proper slash handling
                      return `${publicUrl}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
                    })()}
                    alt="Story scene"
                    className="w-full h-full object-cover rounded-lg"
                    draggable="false"
                    onDragStart={(e) => e.preventDefault()}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center text-gray-500">
                    [Image]
                  </div>
                )}

                {/* Choice overlays when dragging */}
                {isDragging && (
                  <>
                    <div
                      className={`story-choice-overlay left ${card.character?.name === "Narrator" && !card.leftChoice.overlayColor ? "narrator" : ""}`}
                      style={getLeftOverlayStyle()}
                    >
                      <div className="story-choice-text">
                        ← {card.leftChoice.text}
                      </div>
                    </div>

                    <div
                      className={`story-choice-overlay right ${card.character?.name === "Narrator" && !card.rightChoice.overlayColor ? "narrator" : ""}`}
                      style={getRightOverlayStyle()}
                    >
                      <div className="story-choice-text">
                        {card.rightChoice.text} →
                      </div>
                    </div>
                  </>
                )}

                {/* Drag hint hand icon */}
                {!isDragging && !isAnimating && enableIdleAnimation && (
                  <div className="story-card-drag-hint">
                    ✋
                  </div>
                )}
              </div>
            </div>

            {/* Hint text */}
            <div className="story-card-hint">Swipe the card left or right to choose</div>
          </>
        )}
        {/* Continue button - positioned at bottom-right of the card when in outcome mode */}
        {outcomeMode && (
          <button
            onClick={() => {
              playButtonClickSound();
              outcomeMode.onContinue();
            }}
            className="story-continue-arrow"
            aria-label="Continue"
            style={{ fontFamily: 'serif' }}
          >
            <span className="story-continue-text">Continue</span>
            <svg 
              width="28" 
              height="28" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default StoryCard;
