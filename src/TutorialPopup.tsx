import React, { useEffect, useState } from 'react';
import type { TutorialType } from './types';

interface TutorialPopupProps {
  message: string;
  subMessage?: string;
  onCancel?: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
  position?: {
    top: number;
    left: number;
  };
  imageBanner?: string; // Path to banner image for mechanic tutorials
  centered?: boolean; // If true, centers the popup instead of positioning by coordinates
  arrowTarget?: string; // Data attribute selector for arrow to point at (e.g., "data-buy-pawn")
}

// Tutorial content definitions
export const TUTORIAL_CONTENT: Record<TutorialType, {
  title: string;
  body: string;
  imageBanner: string;
}> = {
  single_combat: {
    title: "Single Combat",
    body: "Both units roll 1d6. Attacker wins ties.",
    imageBanner: "/tutorial_SingleCombat.png",
  },
  supporting_units: {
    title: "Supporting Units",
    body: "Add +1 to attack rolls for each other friendly Unit attacking the same square.",
    imageBanner: "/tutorial_SupportingUnits.png",
  },
  king_advantage: {
    title: "King Advantage",
    body: "King always attacks with Advantage (roll 2d6, keep highest).",
    imageBanner: "/tutorial_KingAdvantage.png",
  },
  stunned_units: {
    title: "Stunned Units",
    body: "Stunned Units always roll 1.",
    imageBanner: "/tutorial_StunnedUnits.png",
  },
  exhausted_units: {
    title: "Exhausted Units",
    body: "After a Unit performs the same move 3 times, they are Stunned for one turn in exhaustion.",
    imageBanner: "/tutorial_ExhaustedUnits.png",
  },
  veterans: {
    title: "🎖️ Veterans",
    body: "Units that win 5 single combats become Veterans. They always roll with Advantage (both attacking and defending).",
    imageBanner: "/tutorial_Veterans.png",
  },
  market_buy_pawn: {
    title: "Market",
    body: "Your King needs an army. Hire Men-at-Arms and outfit them for war..",
    imageBanner: "/tutorial_Market.png",
  },
  market_view_battlefield: {
    title: "View Battlefield",
    body: "Gain information on the battlefield. To avoid ambushes, equip some units with 🔥 Torches to scout ahead and dispel the dark.",
    imageBanner: "/tutorial_ViewBattlefield.png",
  },
  prayer_dice: {
    title: "🙏 Pray to the Eye",
    body: "When a combat fails, you can use a Prayer Die to reroll the dice. This gives you a second chance to turn the tide of battle.",
    imageBanner: "/tutorial_PrayerDice.png",
  },
};

// Helper to get tutorial content by type
export const getTutorialContent = (type: TutorialType) => TUTORIAL_CONTENT[type];

export const TutorialPopup: React.FC<TutorialPopupProps> = ({
  message,
  subMessage,
  onCancel,
  onConfirm,
  cancelText = 'GO BACK',
  confirmText = 'CONTINUE',
  position,
  imageBanner,
  centered = false,
  arrowTarget,
}) => {
  // For mechanic tutorials with image banner
  const isMechanicTutorial = !!imageBanner;
  // Use position if provided, otherwise center
  const shouldCenter = centered || !position;
  
  // Arrow positioning state
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties | null>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  
  // Calculate arrow position when arrowTarget is provided
  useEffect(() => {
    if (!arrowTarget) {
      setArrowStyle(null);
      return;
    }
    
    const updateArrowPosition = () => {
      const targetElement = document.querySelector(`[${arrowTarget}]`);
      
      if (!targetElement || !popupRef.current) {
        setArrowStyle(null);
        return;
      }
      
      const targetRect = targetElement.getBoundingClientRect();
      const popupRect = popupRef.current.getBoundingClientRect();
      
      // Calculate arrow position pointing from popup to target
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const popupCenterX = popupRect.left + popupRect.width / 2;
      const popupCenterY = popupRect.top + popupRect.height / 2;
      
      // Calculate angle and distance
      const deltaX = targetCenterX - popupCenterX;
      const deltaY = targetCenterY - popupCenterY;
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Position arrow at the edge of popup closest to target
      const arrowLength = Math.max(60, distance - popupRect.width / 2 - targetRect.width / 2 - 40);
      
      setArrowStyle({
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${arrowLength}px`,
        transformOrigin: 'left center',
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        zIndex: 1000,
        pointerEvents: 'none',
      });
    };
    
    // Use setTimeout to ensure DOM is ready
    const timeoutId = setTimeout(updateArrowPosition, 100);
    const rafId = requestAnimationFrame(updateArrowPosition);
    
    window.addEventListener('resize', updateArrowPosition);
    window.addEventListener('scroll', updateArrowPosition, true);
    
    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateArrowPosition);
      window.removeEventListener('scroll', updateArrowPosition, true);
    };
  }, [arrowTarget, position, shouldCenter]);

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50"
      style={shouldCenter ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}
    >
      <div
        ref={popupRef}
        className={`tutorial-popup ${isMechanicTutorial ? 'tutorial-popup-mechanic' : ''}`}
        style={
          shouldCenter
            ? {}
            : {
                position: 'fixed',
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: 'translateX(-50%)',
                margin: 0,
                animation: 'tutorial-appear-positioned 0.3s ease-out',
              }
        }
      >
        {imageBanner && (
          <div className="tutorial-popup-banner">
            <img src={imageBanner} alt="" />
          </div>
        )}
        <div className="tutorial-popup-content">
          <h3 className="tutorial-popup-title">{message}</h3>
          {subMessage && <p className="tutorial-popup-subtitle">{subMessage}</p>}
          <div className="tutorial-popup-buttons">
            {onCancel && (
              <button
                onClick={onCancel}
                className="tutorial-popup-btn tutorial-popup-btn-cancel"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={onConfirm}
              className="tutorial-popup-btn tutorial-popup-btn-confirm"
            >
              {confirmText}
            </button>
          </div>
        </div>
        {arrowTarget && arrowStyle && (
          <div
            style={arrowStyle}
            className="tutorial-arrow"
          >
            <svg
              width="100%"
              height="20"
              viewBox="0 0 100 20"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <marker
                  id={`arrowhead-${arrowTarget}`}
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3, 0 6" fill="#fbbf24" />
                </marker>
              </defs>
              <line
                x1="0"
                y1="10"
                x2="100%"
                y2="10"
                stroke="#fbbf24"
                strokeWidth="3"
                markerEnd={`url(#arrowhead-${arrowTarget})`}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

