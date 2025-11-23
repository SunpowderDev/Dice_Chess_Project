import React from 'react';
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
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_SingleCombat.png`,
  },
  supporting_units: {
    title: "Supporting Units",
    body: "Add +1 to attack rolls for each other friendly Unit attacking the same square.",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_SupportingUnits.png`,
  },
  king_advantage: {
    title: "King Advantage",
    body: "King always attacks with Advantage (roll 2d6, keep highest).",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_KingAdvantage.png`,
  },
  king_escape_hint: {
    title: "To win this scenario, lead your King to the golden squares at the board's edge.",
    body: "",
    imageBanner: "",
  },
  stunned_units: {
    title: "Stunned Units",
    body: "Stunned Units always roll 1.",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_StunnedUnits.png`,
  },
  exhausted_units: {
    title: "Exhausted Units",
    body: "After a Unit performs the same move 3 times, they are Stunned for one turn in exhaustion.",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_ExhaustedUnits.png`,
  },
  veterans: {
    title: "🎖️ Veterans",
    body: "Units that win 5 single combats become Veterans. They always roll with Advantage (both attacking and defending).",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_Veterans.png`,
  },
  market_buy_pawn: {
    title: "Market",
    body: "Your King needs an army. Hire Men-at-Arms and outfit them for war.",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_Market.png`,
  },
  market_view_battlefield: {
    title: "👁️ View Battlefield",
    body: "Some battlefields are covered in a dense fog. To avoid ambushes, equip some units with 🔥 Torches to scout ahead and dispel the dark.",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_ViewBattlefield.png`,
  },
  prayer_dice: {
    title: "🙏 Pray to the Eye",
    body: "When a combat fails, you can use a Prayer Die to reroll a dice. This gives you a second chance to turn the tide of battle.",
    imageBanner: `${process.env.PUBLIC_URL}/tutorial_imgs/tutorial_PrayerDice.png`,
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
}) => {
  // For mechanic tutorials with image banner
  const isMechanicTutorial = !!imageBanner;
  // Use position if provided, otherwise center
  const shouldCenter = centered || !position;

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50"
      style={shouldCenter ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}
    >
      <div
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
      </div>
    </div>
  );
};

