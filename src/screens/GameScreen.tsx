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

import { Spacing } from '../theme';
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
                case 'light':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    break;
                case 'medium':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    break;
                case 'heavy':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    break;
            }
        } catch { }
    }, []);

    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            try {
                const msg = JSON.parse(event.nativeEvent.data);
                switch (msg.type) {
                    case 'ready': setGameReady(true); break;
                    case 'score':
                        setLocalScore(msg.score);
                        setLocalCombo(msg.combo);
                        break;
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
        },
        [navigation, setScore, setStatus, triggerHaptic],
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

    const timerColor = timeLeft > 30 ? '#aaa' : timeLeft > 10 ? '#ccc' : '#fff';

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

            {/* HUD: score left | pause center | timer right */}
            <View style={styles.hud} pointerEvents="box-none">
                <View style={styles.hudCol}>
                    <GlowText color="#666" size="xs" style={styles.label}>SCORE</GlowText>
                    <GlowText color="#eee" size="lg" weight="700">{score.toLocaleString()}</GlowText>
                    {combo > 1 && (
                        <GlowText color="#888" size="xs" weight="700">{`${combo.toFixed(1)}x`}</GlowText>
                    )}
                </View>

                <View style={styles.hudCenter}>
                    <NeonButton
                        title={paused ? '▶' : '⏸'}
                        onPress={paused ? handleResume : handlePause}
                        variant="secondary"
                        size="sm"
                        style={styles.pauseBtn}
                    />
                    {!launched && gameReady && (
                        <GlowText color="#666" size="xs" align="center" style={styles.launchHint}>
                            {'HOLD RIGHT\nTO LAUNCH'}
                        </GlowText>
                    )}
                </View>

                <View style={styles.hudColRight}>
                    <GlowText color="#666" size="xs" align="right" style={styles.label}>TIME</GlowText>
                    <GlowText color={timerColor} size="lg" weight="700" align="right">
                        {formatTime(timeLeft)}
                    </GlowText>
                </View>
            </View>

            {/* Pause overlay */}
            {paused && (
                <View style={styles.pauseOverlay}>
                    <GlowText color="#fff" size="hero" align="center" weight="700">PAUSED</GlowText>
                    <GlowText color="#666" size="body" align="center" style={styles.pauseSub}>
                        {`${stakeAmount} SOL staked • ${(stakeAmount * multiplier).toFixed(3)} SOL to win`}
                    </GlowText>
                    <View style={styles.pauseScoreBox}>
                        <GlowText color="#eee" size="xl" weight="700" align="center">{score.toLocaleString()}</GlowText>
                        <GlowText color="#555" size="xs" align="center">POINTS</GlowText>
                    </View>
                    <NeonButton title="Resume" onPress={handleResume} variant="primary" size="lg" style={styles.pauseAction} />
                    <NeonButton title="Quit (Lose Stake)" onPress={handleQuit} variant="danger" size="md" style={styles.pauseAction} />
                </View>
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
        backgroundColor: 'rgba(5,5,5,0.75)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    hudCol: { flex: 1, alignItems: 'flex-start' },
    hudColRight: { flex: 1, alignItems: 'flex-end' },
    hudCenter: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    label: { letterSpacing: 2, marginBottom: 2 },
    pauseBtn: {
        paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.06)', borderColor: '#333',
    },
    launchHint: { marginTop: 6 },
    pauseOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(5,5,5,0.94)',
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
    },
    pauseSub: { marginTop: 8, marginBottom: 24 },
    pauseScoreBox: { marginBottom: 28 },
    pauseAction: { marginTop: 14, alignSelf: 'stretch' },
});
