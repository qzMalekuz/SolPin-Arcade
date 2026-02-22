import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Alert,
    BackHandler,
    Platform,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { Colors, Spacing } from '../theme';
import { GlowText } from '../components/GlowText';
import { NeonButton } from '../components/NeonButton';
import { useGameStore } from '../store/gameStore';
import { generatePinballHTML } from '../game/PinballGame';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

export const GameScreen: React.FC<Props> = ({ navigation }) => {
    const {
        duration,
        difficulty,
        stakeAmount,
        multiplier,
        setScore,
        setStatus,
    } = useGameStore();

    const webviewRef = useRef<WebView>(null);
    const [score, setLocalScore] = useState(0);
    const [combo, setLocalCombo] = useState(1.0);
    const [timeLeft, setTimeLeft] = useState(duration);
    const [paused, setPaused] = useState(false);
    const [launched, setLaunched] = useState(false);
    const [gameReady, setGameReady] = useState(false);

    const html = generatePinballHTML({ difficulty, duration });

    // Android back → pause
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!paused) handlePause();
            return true;
        });
        return () => sub.remove();
    }, [paused]);

    // Haptic feedback handler
    const triggerHaptic = useCallback(async (type: string) => {
        try {
            switch (type) {
                case 'light':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    break;
                case 'medium':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    break;
                case 'heavy':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    break;
                default:
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch { }
    }, []);

    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            try {
                const msg = JSON.parse(event.nativeEvent.data);
                switch (msg.type) {
                    case 'ready':
                        setGameReady(true);
                        break;
                    case 'score':
                        setLocalScore(msg.score);
                        setLocalCombo(msg.combo);
                        break;
                    case 'timer':
                        setTimeLeft(msg.timeLeft);
                        break;
                    case 'launched':
                        setLaunched(true);
                        break;
                    case 'haptic':
                        triggerHaptic(msg.type === 'haptic' ? msg.type : 'light');
                        // Read the haptic type from the correct field
                        if (msg.type === 'haptic') triggerHaptic(msg.type);
                        break;
                    case 'gameover':
                        triggerHaptic(msg.result === 'lost' ? 'heavy' : 'medium');
                        setScore(msg.score);
                        setStatus(msg.result === 'won' ? 'won' : 'lost');
                        setTimeout(() => navigation.replace('Result'), 800);
                        break;
                }
            } catch { }
        },
        [navigation, setScore, setStatus, triggerHaptic],
    );

    // Fix: parse haptic messages correctly
    const onMessageFixed = useCallback(
        (event: WebViewMessageEvent) => {
            try {
                const msg = JSON.parse(event.nativeEvent.data);
                if (msg.type === 'haptic') {
                    triggerHaptic(msg.type === 'haptic' ? (msg as any).type : 'light');
                    // Extract the actual haptic level from nested type field
                }
                // Delegate to main handler
                onMessage(event);
            } catch { }
        },
        [onMessage, triggerHaptic],
    );

    const sendToGame = useCallback((msg: object) => {
        webviewRef.current?.injectJavaScript(
            `window.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(${JSON.stringify(msg)})}));true;`,
        );
    }, []);

    const handlePause = useCallback(() => {
        setPaused(true);
        sendToGame({ type: 'pause' });
    }, [sendToGame]);

    const handleResume = useCallback(() => {
        setPaused(false);
        sendToGame({ type: 'resume' });
    }, [sendToGame]);

    const handleQuit = useCallback(() => {
        Alert.alert('Quit Game', 'You will lose your stake.', [
            { text: 'Continue', style: 'cancel', onPress: handleResume },
            {
                text: 'Quit',
                style: 'destructive',
                onPress: () => {
                    setStatus('lost');
                    setScore(score);
                    navigation.replace('Result');
                },
            },
        ]);
    }, [handleResume, setStatus, setScore, score, navigation]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const timerColor =
        timeLeft > 30 ? '#88aa88' : timeLeft > 10 ? '#bbaa77' : '#aa5555';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <WebView
                ref={webviewRef}
                source={{ html }}
                style={StyleSheet.absoluteFill}
                onMessage={onMessage}
                javaScriptEnabled
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                originWhitelist={['*']}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
            />

            {/* ── TOP HUD BAR ── */}
            {/* Score on far left, Pause center, Timer far right — no overlap */}
            <View style={styles.hud} pointerEvents="box-none">
                {/* Left: Score */}
                <View style={styles.hudCol}>
                    <GlowText color="#778899" size="xs" style={styles.label}>
                        SCORE
                    </GlowText>
                    <GlowText color="#ccddee" size="lg" weight="700">
                        {score.toLocaleString()}
                    </GlowText>
                    {combo > 1 && (
                        <GlowText color="#9988bb" size="xs" weight="700">
                            {`${combo.toFixed(1)}x`}
                        </GlowText>
                    )}
                </View>

                {/* Center: Pause button + launch hint */}
                <View style={styles.hudCenter}>
                    <NeonButton
                        title={paused ? '▶' : '⏸'}
                        onPress={paused ? handleResume : handlePause}
                        variant="secondary"
                        size="sm"
                        style={styles.pauseBtn}
                    />
                    {!launched && gameReady && (
                        <GlowText color="#778899" size="xs" align="center" style={styles.launchHint}>
                            {'HOLD RIGHT\nTO LAUNCH'}
                        </GlowText>
                    )}
                </View>

                {/* Right: Timer */}
                <View style={styles.hudColRight}>
                    <GlowText color="#778899" size="xs" align="right" style={styles.label}>
                        TIME
                    </GlowText>
                    <GlowText color={timerColor} size="lg" weight="700" align="right">
                        {formatTime(timeLeft)}
                    </GlowText>
                </View>
            </View>

            {/* ── PAUSE OVERLAY ── */}
            {paused && (
                <View style={styles.pauseOverlay}>
                    <GlowText color="#aabbdd" size="hero" align="center" weight="700">
                        PAUSED
                    </GlowText>
                    <GlowText color="#667788" size="body" align="center" style={styles.pauseSub}>
                        {`${stakeAmount} SOL staked • ${(stakeAmount * multiplier).toFixed(3)} SOL to win`}
                    </GlowText>
                    <View style={styles.pauseScoreBox}>
                        <GlowText color="#ccddee" size="xl" weight="700" align="center">
                            {score.toLocaleString()}
                        </GlowText>
                        <GlowText color="#778899" size="xs" align="center">
                            POINTS
                        </GlowText>
                    </View>
                    <NeonButton
                        title="Resume"
                        onPress={handleResume}
                        variant="primary"
                        size="lg"
                        style={styles.pauseAction}
                    />
                    <NeonButton
                        title="Quit (Lose Stake)"
                        onPress={handleQuit}
                        variant="danger"
                        size="md"
                        style={styles.pauseAction}
                    />
                </View>
            )}
        </View>
    );
};

const TOP_PAD = Platform.OS === 'android' ? (StatusBar.currentHeight || 30) + 4 : 48;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#080810',
    },
    hud: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 12,
        paddingTop: TOP_PAD,
        paddingBottom: 8,
        backgroundColor: 'rgba(8,8,16,0.7)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(100,110,130,0.15)',
    },
    hudCol: {
        flex: 1,
        alignItems: 'flex-start',
    },
    hudColRight: {
        flex: 1,
        alignItems: 'flex-end',
    },
    hudCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    label: {
        letterSpacing: 2,
        marginBottom: 2,
    },
    pauseBtn: {
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: 'rgba(12,12,25,0.8)',
        borderColor: '#556677',
    },
    launchHint: {
        marginTop: 6,
    },
    pauseOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(8,8,16,0.93)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    pauseSub: {
        marginTop: 8,
        marginBottom: 24,
    },
    pauseScoreBox: {
        marginBottom: 28,
    },
    pauseAction: {
        marginTop: 14,
        alignSelf: 'stretch',
    },
});
