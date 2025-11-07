import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

type MusicType = 'main_menu' | 'level' | 'end_game';

interface MusicManagerProps {
  musicMuted: boolean;
}

export interface MusicManagerHandle {
  playMainMenuMusic: () => void;
  playLevelMusic: (level: number) => void;
  playEndGameMusic: () => void;
  stopMusic: () => void;
}

// Music file paths
const MUSIC_FILES = {
  mainMenu: '/music/Main_Menu_ShadowedCrown.mp3',
  level1: ['/music/level1_BetrayalatHighkeep.mp3'],
  level2: ['/music/level2_TheDarkHunt.mp3', '/music/level2_TheDarkHunt_2.mp3'],
  level3: ['/music/level3_PilgrimsPass.mp3', '/music/level3_PilgrimsPass_B.mp3'],
  level4: ['/music/level4_PontiffPintus.mp3'],
  level5: [], // Placeholder - user will add files later
  endGame: '/music/End_Game_FallenThrone.mp3',
};

export const MusicManager = forwardRef<MusicManagerHandle, MusicManagerProps>(
  ({ musicMuted }, ref) => {
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    const currentPlaylistRef = useRef<string[]>([]);
    const currentPlaylistIndexRef = useRef<number>(0);
    const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const playlistActiveRef = useRef<boolean>(false);
    const currentMusicTypeRef = useRef<{ type: MusicType; level?: number } | null>(null);

    // Fade out current audio
    const fadeOut = (onComplete?: () => void) => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      const audio = currentAudioRef.current;
      if (!audio) {
        onComplete?.();
        return;
      }

      const fadeDuration = 1000; // 1 second fade
      const fadeSteps = 20;
      const fadeInterval = fadeDuration / fadeSteps;
      const volumeStep = (audio.volume || 1) / fadeSteps;

      let currentStep = 0;
      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        if (currentStep >= fadeSteps) {
          audio.pause();
          audio.currentTime = 0;
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
          onComplete?.();
        } else {
          audio.volume = Math.max(0, audio.volume - volumeStep);
        }
      }, fadeInterval);
    };

    // Play a single track
    const playTrack = (src: string, volume: number = 0.5) => {
      const audio = new Audio(src);
      audio.loop = true;
      audio.volume = volume;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Auto-play was prevented - this is normal for browsers
        });
      }

      currentAudioRef.current = audio;
      return audio;
    };

    // Play a playlist sequentially
    const playPlaylist = (playlist: string[], volume: number = 0.5) => {
      if (playlist.length === 0) return;

      playlistActiveRef.current = true;
      currentPlaylistRef.current = playlist;
      currentPlaylistIndexRef.current = 0;

      const playNext = (index: number) => {
        if (!playlistActiveRef.current) {
          return;
        }

        if (index >= playlist.length) {
          playNext(0);
          return;
        }

        const audio = new Audio(playlist[index]);
        audio.volume = volume;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Auto-play was prevented
          });
        }

        currentAudioRef.current = audio;
        currentPlaylistIndexRef.current = index;

        audio.addEventListener('ended', () => {
          if (playlistActiveRef.current) {
            playNext(index + 1);
          }
        });

        if (playlist.length === 1) {
          audio.loop = true;
        }
      };

      playNext(0);
    };

    // Stop music completely
    const stopAllMusic = () => {
      playlistActiveRef.current = false;

      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      currentMusicTypeRef.current = null;
    };

    // Imperative methods exposed via ref
    useImperativeHandle(ref, () => ({
      playMainMenuMusic: () => {
        if (musicMuted) return;

        // Check if already playing main menu music
        if (
          currentMusicTypeRef.current?.type === 'main_menu' &&
          currentAudioRef.current &&
          !currentAudioRef.current.paused
        ) {
          return; // Already playing, don't restart
        }

        fadeOut(() => {
          playlistActiveRef.current = false;

          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }

          playTrack(MUSIC_FILES.mainMenu, 0.5);
          currentMusicTypeRef.current = { type: 'main_menu' };
        });
      },

      playLevelMusic: (level: number) => {
        if (musicMuted) return;

        // Check if already playing this level's music
        if (
          currentMusicTypeRef.current?.type === 'level' &&
          currentMusicTypeRef.current?.level === level &&
          currentAudioRef.current &&
          !currentAudioRef.current.paused
        ) {
          return; // Already playing, don't restart
        }

        fadeOut(() => {
          playlistActiveRef.current = false;

          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }

          const playlist = (() => {
            switch (level) {
              case 1:
                return MUSIC_FILES.level1;
              case 2:
                return MUSIC_FILES.level2;
              case 3:
                return MUSIC_FILES.level3;
              case 4:
                return MUSIC_FILES.level4;
              case 5:
                return MUSIC_FILES.level5;
              default:
                return [];
            }
          })();

          if (playlist.length > 0) {
            playPlaylist(playlist, 0.3); // Lower volume for level music
            currentMusicTypeRef.current = { type: 'level', level };
          }
        });
      },

      playEndGameMusic: () => {
        if (musicMuted) return;

        // Check if already playing end game music
        if (
          currentMusicTypeRef.current?.type === 'end_game' &&
          currentAudioRef.current &&
          !currentAudioRef.current.paused
        ) {
          return; // Already playing, don't restart
        }

        fadeOut(() => {
          playlistActiveRef.current = false;

          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }

          playTrack(MUSIC_FILES.endGame, 0.5);
          currentMusicTypeRef.current = { type: 'end_game' };
        });
      },

      stopMusic: () => {
        stopAllMusic();
      },
    }));

    // Stop music when muted
    useEffect(() => {
      if (musicMuted) {
        stopAllMusic();
      }
    }, [musicMuted]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        stopAllMusic();
      };
    }, []);

    // This component doesn't render anything
    return null;
  }
);

MusicManager.displayName = 'MusicManager';
