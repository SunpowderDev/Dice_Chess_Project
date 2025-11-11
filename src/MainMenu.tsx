import React, { useState } from "react";

interface MainMenuProps {
  onEnter: () => void;
}

export function MainMenu({ onEnter }: MainMenuProps) {
  const [showChangelog, setShowChangelog] = useState(true);

  const playButtonSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2W67OeeSwwPUKvl8bVjHAU2jdXxz3ktBSh+zPLaizsKFF+z6OyoVRQKRp/g8r5sIQUrgs/y2Ik2CBlmu+znmksNEE6r5fG2YhwGOI3V8c95LQUofsvw2os4ChRgs+jrqFUUCkWd4O++bSEGKoLN8tmJNggaaLvs6Z5MEA9Nq+XytmMcBjiO1PHPeS0FJ37L8NqLOAoUYLPo66hVFApFneHvvmwhBSmCzvHaiTcIGmi77OmeSwwPTqvl8rVkHAU3');
      audio.volume = 0.15;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  const Changelog = () => {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Changelog</h1>
          <button
            onClick={() => setShowChangelog((s) => !s)}
            className="px-2 py-1 text-xs bg-amber-950 hover:bg-amber-900 rounded"
          >
            {showChangelog ? "Hide" : "Show"}
          </button>
        </div>

        {showChangelog && (
          <div className="bg-stone-950/70 rounded-2xl p-3 text-sm space-y-2">
            <div className="font-semibold text-base pt-2">
              v0.6 - Tutorial, Music, & Optional Objectives
            </div>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <strong>Tutorial Popups:</strong> New hint cards trigger when the player 
                starts a new level. These cards provide helpful tips and guidance.
              </li>
              <li>
                <strong>Optional Objectives:</strong> Added a randomized and
                level-based system to reward players for achieving optional goals.
              </li>
              <li>
                <strong>Music:</strong> Each level now plays to its own tune.
              </li>
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(circle at 50% 50%, rgba(120, 53, 15, 0.3) 0%, rgba(28, 25, 23, 0.95) 50%, #0c0a09 100%)'
      }}
    >
      {/* Medieval parchment-style container */}
      <div className="relative w-full max-w-2xl">
        {/* Decorative corners */}
        <div className="absolute -top-4 -left-4 text-6xl text-amber-600 opacity-50">❦</div>
        <div className="absolute -top-4 -right-4 text-6xl text-amber-600 opacity-50">❦</div>
        <div className="absolute -bottom-4 -left-4 text-6xl text-amber-600 opacity-50">❦</div>
        <div className="absolute -bottom-4 -right-4 text-6xl text-amber-600 opacity-50">❦</div>

        {/* Main parchment */}
        <div 
          className="relative rounded-2xl p-8 text-center space-y-6 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #2d1810 0%, #1c1410 50%, #2d1810 100%)',
            border: '4px solid',
            borderImage: 'linear-gradient(135deg, #d4af37 0%, #f4e4a6 50%, #d4af37 100%) 1',
            boxShadow: '0 0 40px rgba(212, 175, 55, 0.3), inset 0 0 60px rgba(0, 0, 0, 0.5)'
          }}
        >
          {/* Title with medieval styling */}
          <div className="space-y-2">
            <h1 
              className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600"
              style={{ 
                fontFamily: 'Georgia, serif',
                textShadow: '0 2px 10px rgba(212, 175, 55, 0.5)'
              }}
            >
              DiceChess
            </h1>
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-20 bg-gradient-to-r from-transparent via-amber-600 to-transparent"></div>
              <span className="text-amber-400 text-sm tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>
                ⚔ PROJECT ⚔
              </span>
              <div className="h-px w-20 bg-gradient-to-r from-transparent via-amber-600 to-transparent"></div>
            </div>
          </div>

          {/* Enter button */}
          <button
            onClick={() => {
              playButtonSound();
              onEnter();
            }}
            className="relative px-12 py-4 rounded-xl font-bold text-2xl shadow-2xl transition-all hover:scale-105 group"
            style={{
              background: 'linear-gradient(135deg, #d4af37 0%, #f4e4a6 50%, #d4af37 100%)',
              color: '#1a1410',
              boxShadow: '0 8px 24px rgba(212, 175, 55, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
              fontFamily: 'Georgia, serif',
              letterSpacing: '0.1em'
            }}
          >
            <span className="relative z-10">ENTER</span>
            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: 'linear-gradient(135deg, #f4e4a6 0%, #d4af37 50%, #f4e4a6 100%)',
              }}
            ></div>
          </button>

          {/* Changelog section */}
          <div 
            className="text-left max-h-[40vh] overflow-y-auto pr-2 rounded-lg p-4"
            style={{
              background: 'rgba(28, 20, 16, 0.6)',
              border: '2px solid rgba(212, 175, 55, 0.3)',
              boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.5)'
            }}
          >
            <Changelog />
          </div>
        </div>
      </div>
    </div>
  );
}

