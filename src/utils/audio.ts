import { Audio, AVPlaybackSource } from 'expo-av';
import { useGameStore } from '../store/gameStore';

// -----------------------------------------------------------
// Audio manager using expo-av (Expo Go compatible)
// All sound files should be placed in /assets/sounds/
// For the demo we use programmatic placeholder references.
// -----------------------------------------------------------

type SoundName =
    | 'flipper'
    | 'bumper'
    | 'drain'
    | 'launch'
    | 'win'
    | 'lose'
    | 'combo'
    | 'bgm';

const soundCache: Map<SoundName, Audio.Sound> = new Map();

/** Preload a sound file into cache */
const loadSound = async (
    name: SoundName,
    source: AVPlaybackSource,
): Promise<void> => {
    try {
        const { sound } = await Audio.Sound.createAsync(source, {
            shouldPlay: false,
        });
        soundCache.set(name, sound);
    } catch (err) {
        console.warn(`[Audio] Failed to load sound "${name}":`, err);
    }
};

/**
 * Initialize all game sounds.
 * Call this once on app start.
 *
 * NOTE: In the demo build, we skip actual audio files.
 * When you add .wav/.mp3 files to /assets/sounds/,
 * uncomment the require() lines below.
 */
export const initAudio = async (): Promise<void> => {
    await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
    });

    // Uncomment when actual sound assets are added:
    // await loadSound('flipper', require('../../assets/sounds/flipper.wav'));
    // await loadSound('bumper',  require('../../assets/sounds/bumper.wav'));
    // await loadSound('drain',   require('../../assets/sounds/drain.wav'));
    // await loadSound('launch',  require('../../assets/sounds/launch.wav'));
    // await loadSound('win',     require('../../assets/sounds/win.wav'));
    // await loadSound('lose',    require('../../assets/sounds/lose.wav'));
    // await loadSound('combo',   require('../../assets/sounds/combo.wav'));
    // await loadSound('bgm',     require('../../assets/sounds/bgm.mp3'));
};

/**
 * Play a sound effect.
 * Respects the global sound toggle in gameStore.
 */
export const playSound = async (name: SoundName): Promise<void> => {
    if (!useGameStore.getState().soundEnabled) return;

    const sound = soundCache.get(name);
    if (!sound) return;

    try {
        await sound.setPositionAsync(0);
        await sound.playAsync();
    } catch (err) {
        console.warn(`[Audio] Failed to play "${name}":`, err);
    }
};

/**
 * Start background music loop.
 */
export const startBGM = async (): Promise<void> => {
    if (!useGameStore.getState().soundEnabled) return;

    const bgm = soundCache.get('bgm');
    if (!bgm) return;

    try {
        await bgm.setIsLoopingAsync(true);
        await bgm.setVolumeAsync(0.4);
        await bgm.playAsync();
    } catch (err) {
        console.warn('[Audio] Failed to start BGM:', err);
    }
};

/**
 * Stop background music.
 */
export const stopBGM = async (): Promise<void> => {
    const bgm = soundCache.get('bgm');
    if (!bgm) return;

    try {
        await bgm.stopAsync();
    } catch (err) {
        console.warn('[Audio] Failed to stop BGM:', err);
    }
};

/**
 * Unload all cached sounds. Call on app unmount.
 */
export const unloadAllSounds = async (): Promise<void> => {
    for (const [, sound] of soundCache) {
        try {
            await sound.unloadAsync();
        } catch { }
    }
    soundCache.clear();
};
