// ===================================================================
// GameScreen — hosts the pinball engine, HUD, and controls
// ===================================================================

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
    View,
    StyleSheet,
    Dimensions,
    StatusBar,
    Alert,
    BackHandler,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Spacing, FontSizes } from '../theme';
import { GlowText } from '../components/GlowText';
import { NeonButton } from '../components/NeonButton';
import { PinballEngine, EngineState } from '../game/engine';
import { PinballCanvas } from '../game/PinballCanvas';
import { FlipperControls } from '../game/FlipperControls';
import { useGameStore } from '../store/gameStore';
import { formatScore } from '../game/scoring';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HUD_HEIGHT = 80;
const BOTTOM_PAD = 40;
const CANVAS_H = SCREEN_H - HUD_HEIGHT - BOTTOM_PAD;

export const GameScreen: React.FC<Props> = ({ navigation }) => {
    const {
        duration,
        difficulty,
        soundEnabled,
        setScore,
        setTimeRemaining,
        setStatus,
        toggleSound,
    } = useGameStore();

    const engineRef = useRef<PinballEngine | null>(null);
    const [score, setLocalScore] = useState(0);
    const [timeStr, setTimeStr] = useState('0:00');
    const [comboText, setComboText] = useState('');
    const [paused, setPaused] = useState(false);

    // Create engine instance
    const engine = useMemo(() => {
        const e = new PinballEngine(difficulty, duration);
        engineRef.current = e;
        return e;
    }, [difficulty, duration]);

    // Setup engine callbacks
    useEffect(() => {
        engine.onStateUpdate((state: EngineState) => {
            setLocalScore(state.score);
            setTimeStr(engine.getTimeFormatted());

            if (state.comboCount >= 3) {
                setComboText(`${state.comboCount}x COMBO!`);
            } else {
                setComboText('');
            }
        });

        engine.onBallDrain(() => {
            setStatus('lost');
            setScore(engine.state.score);
            setTimeRemaining(0);
            setTimeout(() => {
                navigation.replace('Result');
            }, 800);
        });

        engine.onTimerEnd(() => {
            setStatus('won');
            setScore(engine.state.score);
            setTimeRemaining(0);
            setTimeout(() => {
                navigation.replace('Result');
            }, 800);
        });

        // Start the game
        engine.start();

        return () => {
            engine.stop();
        };
    }, [engine]);

    // Handle Android back button
    useEffect(() => {
        const subscription = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                handlePause();
                return true;
            },
        );
        return () => subscription.remove();
    }, [paused]);

    const handlePause = useCallback(() => {
        if (paused) {
            engine.resume();
            setPaused(false);
        } else {
            engine.pause();
            setPaused(true);
        }
    }, [paused, engine]);

    const handleQuit = useCallback(() => {
        Alert.alert(
            'Quit Game',
            'You will lose your stake if you quit now.',
            [
                {
                    text: 'Continue', style: 'cancel', onPress: () => {
                        engine.resume();
                        setPaused(false);
                    }
                },
                {
                    text: 'Quit', style: 'destructive', onPress: () => {
                        engine.stop();
                        setStatus('lost');
                        setScore(engine.state.score);
                        navigation.replace('Result');
                    }
                },
            ],
        );
    }, [engine, navigation]);

    return (
        <View style={styles.container}>
            <StatusBar hidden />

            {/* HUD */}
            <View style={styles.hud}>
                <View style={styles.hudLeft}>
                    <GlowText color={Colors.neonYellow} size="xs">
                        SCORE
                    </GlowText>
                    <GlowText color={Colors.neonYellow} size="lg" weight="700">
                        {formatScore(score)}
                    </GlowText>
                </View>

                {comboText ? (
                    <View style={styles.hudCenter}>
                        <GlowText color={Colors.neonPink} size="md" weight="700" align="center">
                            {comboText}
                        </GlowText>
                    </View>
                ) : null}

                <View style={styles.hudRight}>
                    <GlowText color={Colors.danger} size="xs" align="right">
                        TIME
                    </GlowText>
                    <GlowText color={Colors.danger} size="lg" weight="700" align="right">
                        {timeStr}
                    </GlowText>
                </View>
            </View>

            {/* Table */}
            <View style={styles.tableContainer}>
                <PinballCanvas
                    engine={engine}
                    width={SCREEN_W}
                    height={CANVAS_H}
                />

                {/* Flipper touch zones overlay */}
                <FlipperControls engine={engine} />
            </View>

            {/* Bottom controls */}
            <View style={styles.bottomBar}>
                <NeonButton
                    title={paused ? '▶' : '⏸'}
                    onPress={handlePause}
                    variant="secondary"
                    size="sm"
                    style={styles.controlBtn}
                />
                <NeonButton
                    title={soundEnabled ? '🔊' : '🔇'}
                    onPress={toggleSound}
                    variant="secondary"
                    size="sm"
                    style={styles.controlBtn}
                />
                {paused && (
                    <NeonButton
                        title="QUIT"
                        onPress={handleQuit}
                        variant="danger"
                        size="sm"
                        style={styles.controlBtn}
                    />
                )}
            </View>

            {/* Pause overlay */}
            {paused && (
                <View style={styles.pauseOverlay}>
                    <GlowText color={Colors.neonBlue} size="hero" align="center">
                        PAUSED
                    </GlowText>
                    <NeonButton
                        title="Resume"
                        onPress={handlePause}
                        variant="primary"
                        size="lg"
                        style={styles.resumeBtn}
                    />
                    <NeonButton
                        title="Quit Game"
                        onPress={handleQuit}
                        variant="danger"
                        size="md"
                        style={styles.quitBtn}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
    },
    hud: {
        height: HUD_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    hudLeft: {
        flex: 1,
    },
    hudCenter: {
        flex: 1,
        alignItems: 'center',
    },
    hudRight: {
        flex: 1,
        alignItems: 'flex-end',
    },
    tableContainer: {
        flex: 1,
        position: 'relative',
    },
    bottomBar: {
        height: BOTTOM_PAD,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    controlBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
    },
    pauseOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    resumeBtn: {
        marginTop: Spacing.xl,
        width: '100%',
    },
    quitBtn: {
        marginTop: Spacing.md,
        width: '100%',
    },
});
