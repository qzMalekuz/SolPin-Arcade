import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Alert,
    BackHandler,
    Platform,
    Animated,
    Easing,
    Pressable,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { Colors, Spacing, Animations } from '../theme';
import { GlowText } from '../components/GlowText';
import { NeonButton } from '../components/NeonButton';
import { useGameStore } from '../store/gameStore';
import { generatePinballHTML } from '../game/PinballGame';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

export const GameScreen: React.FC<Props> = ({ navigation }) => {
    const { duration, difficulty, stakeAmount, multiplier, tutorialMode, setScore, setStatus } = useGameStore();

    const webviewRef = useRef<WebView>(null);
    const [score, setLocalScore] = useState(0);
    const [combo, setLocalCombo] = useState(1.0);
    const [timeLeft, setTimeLeft] = useState(duration);
    const [paused, setPaused] = useState(false);
    const [launched, setLaunched] = useState(false);
    const [gameReady, setGameReady] = useState(false);

    // Pause overlay animation
    const pauseOpacity = useRef(new Animated.Value(0)).current;
    const pauseSlide = useRef(new Animated.Value(20)).current;

    const html = generatePinballHTML({ difficulty, duration });

    useEffect(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    }, []);

    useEffect(() => {
        if (paused) {
            Animated.parallel([
                Animated.timing(pauseOpacity, { toValue: 1, duration: Animations.normal, useNativeDriver: true }),
                Animated.spring(pauseSlide, { toValue: 0, tension: 200, friction: 20, useNativeDriver: true }),
            ]).start();
        } else {
            pauseOpacity.setValue(0);
            pauseSlide.setValue(20);
        }
    }, [paused]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!paused) handlePause();
            return true;
        });
        return () => sub.remove();
    }, [paused]);

    const triggerHaptic = useCallback(async (level: string) => {
        try {
            switch (level) {
                case 'light': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
                case 'medium': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
                case 'heavy': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
            }
        } catch { }
    }, []);

    const onMessage = useCallback((event: WebViewMessageEvent) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            switch (msg.type) {
                case 'ready': setGameReady(true); break;
                case 'score': setLocalScore(msg.score); setLocalCombo(msg.combo); break;
                case 'timer': setTimeLeft(msg.timeLeft); break;
                case 'launched': setLaunched(true); break;
                case 'haptic': triggerHaptic(msg.level || 'light'); break;
                case 'gameover':
                    triggerHaptic(msg.result === 'lost' ? 'heavy' : 'medium');
                    setScore(msg.score);
                    setStatus(msg.result === 'won' ? 'won' : 'lost');
                    setTimeout(() => navigation.replace('Result'), 800);
                    break;
            }
        } catch { }
    }, [navigation, setScore, setStatus, triggerHaptic]);

    const sendToGame = useCallback((msg: object) => {
        webviewRef.current?.injectJavaScript(
            `window.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(${JSON.stringify(msg)})}));true;`,
        );
    }, []);

    const handlePause = useCallback(() => { setPaused(true); sendToGame({ type: 'pause' }); }, [sendToGame]);
    const handleResume = useCallback(() => { setPaused(false); sendToGame({ type: 'resume' }); }, [sendToGame]);

    const handleQuit = useCallback(() => {
        if (tutorialMode) {
            setStatus('lost');
            setScore(score);
            navigation.replace('Result');
            return;
        }
        Alert.alert('Quit Game', 'You will lose your stake.', [
            { text: 'Continue', style: 'cancel', onPress: handleResume },
            { text: 'Quit', style: 'destructive', onPress: () => { setStatus('lost'); setScore(score); navigation.replace('Result'); } },
        ]);
    }, [handleResume, setStatus, setScore, score, navigation, tutorialMode]);

    const formatTime = useCallback((s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }, []);

    const timerColor = timeLeft > 30 ? '#999' : timeLeft > 10 ? '#ccc' : '#f2f2f2';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <WebView
                ref={webviewRef} source={{ html }} style={StyleSheet.absoluteFill}
                onMessage={onMessage} javaScriptEnabled scrollEnabled={false} bounces={false}
                overScrollMode="never" showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
                originWhitelist={['*']} mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback
            />

            <View style={styles.hud} pointerEvents="box-none">
                <View style={styles.hudCol}>
                    <GlowText color="#666" size="xs" glow={0} style={styles.label}>SCORE</GlowText>
                    <GlowText color="#f2f2f2" size="lg" weight="700" glow={0}>{score.toLocaleString()}</GlowText>
                    {combo > 1 && <GlowText color="#888" size="xs" weight="600" glow={0}>{`${combo.toFixed(1)}x`}</GlowText>}
                </View>
                <View style={styles.hudCenter}>
                    <Pressable onPress={paused ? handleResume : handlePause} style={styles.pauseBtn} hitSlop={8}>
                        {paused ? (
                            <View style={styles.playIcon} />
                        ) : (
                            <View style={styles.pauseIcon}>
                                <View style={styles.pauseBar} />
                                <View style={styles.pauseBar} />
                            </View>
                        )}
                    </Pressable>
                    {!launched && gameReady && (
                        <GlowText color="#555" size="xs" align="center" glow={0} style={styles.launchHint}>{'HOLD RIGHT\nTO LAUNCH'}</GlowText>
                    )}
                </View>
                <View style={styles.hudColRight}>
                    <GlowText color="#666" size="xs" align="right" glow={0} style={styles.label}>TIME</GlowText>
                    <GlowText color={timerColor} size="lg" weight="700" align="right" glow={0}>{formatTime(timeLeft)}</GlowText>
                </View>
            </View>

            {paused && (
                <Animated.View style={[styles.pauseOverlay, { opacity: pauseOpacity }]}>
                    <Animated.View style={{ transform: [{ translateY: pauseSlide }] }}>
                        <GlowText color="#f2f2f2" size="hero" align="center" weight="700" glow={1}>PAUSED</GlowText>
                        <GlowText color="#666" size="body" align="center" glow={0} style={styles.pauseSub}>
                            {tutorialMode ? 'Tutorial Mode • No stake' : `${stakeAmount} SOL staked • ${(stakeAmount * multiplier).toFixed(3)} SOL to win`}
                        </GlowText>
                        <View style={styles.pauseScoreBox}>
                            <GlowText color="#f2f2f2" size="xl" weight="700" align="center" glow={0}>{score.toLocaleString()}</GlowText>
                            <GlowText color="#555" size="xs" align="center" glow={0}>POINTS</GlowText>
                        </View>
                        <NeonButton title="Resume" onPress={handleResume} variant="primary" size="lg" style={styles.pauseAction} />
                        <NeonButton title={tutorialMode ? 'Quit' : 'Quit (Lose Stake)'} onPress={handleQuit} variant="danger" size="md" style={styles.pauseAction} />
                    </Animated.View>
                </Animated.View>
            )}
        </View>
    );
};

const TOP_PAD = Platform.OS === 'android' ? (StatusBar.currentHeight || 30) + 4 : 48;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    hud: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'flex-start',
        paddingHorizontal: 12, paddingTop: TOP_PAD, paddingBottom: 8,
        backgroundColor: 'rgba(5,5,5,0.70)',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    hudCol: { flex: 1, alignItems: 'flex-start' },
    hudColRight: { flex: 1, alignItems: 'flex-end' },
    hudCenter: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    label: { letterSpacing: 2, marginBottom: 2 },
    pauseBtn: {
        width: 54,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pauseIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    pauseBar: {
        width: 3,
        height: 12,
        borderRadius: 1,
        backgroundColor: '#f2f2f2',
    },
    playIcon: {
        width: 0,
        height: 0,
        borderTopWidth: 7,
        borderBottomWidth: 7,
        borderLeftWidth: 10,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: '#f2f2f2',
        marginLeft: 2,
    },
    launchHint: { marginTop: 6 },
    pauseOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.92)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
    pauseSub: { marginTop: Spacing.sm, marginBottom: Spacing.lg },
    pauseScoreBox: { marginBottom: Spacing.lg },
    pauseAction: { marginTop: Spacing.sm + 4, alignSelf: 'stretch' },
});
