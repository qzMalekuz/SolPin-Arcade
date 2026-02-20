import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Alert,
    BackHandler,
    Dimensions,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Spacing, FontSizes } from '../theme';
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
        soundEnabled,
        setScore,
        setStatus,
        toggleSound,
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
                    case 'gameover':
                        setScore(msg.score);
                        setStatus(msg.result === 'won' ? 'won' : 'lost');
                        setTimeout(() => navigation.replace('Result'), 800);
                        break;
                }
            } catch { }
        },
        [navigation, setScore, setStatus],
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
        Alert.alert('Quit Game', 'You will lose your stake if you quit now.', [
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
        timeLeft > 30 ? '#00ff88' : timeLeft > 10 ? Colors.neonOrange : '#ff3355';

    return (
        <View style={styles.container}>
            {/* Status bar visible & translucent during gameplay */}
            <StatusBar
                barStyle="light-content"
                backgroundColor="transparent"
                translucent
            />

            {/* WebView pinball game — full screen */}
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

            {/* HUD — transparent overlay */}
            <View style={styles.hud} pointerEvents="box-none">
                {/* Score */}
                <View style={styles.hudLeft}>
                    <GlowText color="#aabbcc" size="xs" style={styles.hudLabel}>
                        SCORE
                    </GlowText>
                    <GlowText color="#ffe14d" size="lg" weight="700">
                        {score.toLocaleString()}
                    </GlowText>
                    {combo > 1 && (
                        <GlowText color="#ff2aff" size="xs" weight="700">
                            {`${combo.toFixed(1)}x`}
                        </GlowText>
                    )}
                </View>

                {/* Launch hint */}
                <View style={styles.hudCenter}>
                    {!launched && gameReady && (
                        <GlowText color="#00d4ff" size="xs" align="center" weight="700">
                            {'HOLD RIGHT\nTO LAUNCH'}
                        </GlowText>
                    )}
                </View>

                {/* Timer */}
                <View style={styles.hudRight}>
                    <GlowText color="#aabbcc" size="xs" align="right" style={styles.hudLabel}>
                        TIME
                    </GlowText>
                    <GlowText color={timerColor} size="lg" weight="700" align="right">
                        {formatTime(timeLeft)}
                    </GlowText>
                </View>
            </View>

            {/* Top-right controls */}
            <View style={styles.controls} pointerEvents="box-none">
                <NeonButton
                    title={paused ? '▶' : '⏸'}
                    onPress={paused ? handleResume : handlePause}
                    variant="secondary"
                    size="sm"
                    style={styles.ctrlBtn}
                />
            </View>

            {/* Pause overlay */}
            {paused && (
                <View style={styles.pauseOverlay}>
                    <GlowText color="#00d4ff" size="hero" align="center" weight="700">
                        PAUSED
                    </GlowText>
                    <GlowText
                        color="#8899aa"
                        size="body"
                        align="center"
                        style={styles.pauseSub}
                    >
                        {`${stakeAmount} SOL staked • ${(stakeAmount * multiplier).toFixed(3)} SOL to win`}
                    </GlowText>

                    <View style={styles.pauseScore}>
                        <GlowText color="#ffe14d" size="xl" weight="700" align="center">
                            {score.toLocaleString()}
                        </GlowText>
                        <GlowText color="#aabbcc" size="xs" align="center">
                            POINTS
                        </GlowText>
                    </View>

                    <NeonButton
                        title="Resume"
                        onPress={handleResume}
                        variant="primary"
                        size="lg"
                        style={styles.pauseBtn}
                    />
                    <NeonButton
                        title="Quit (Lose Stake)"
                        onPress={handleQuit}
                        variant="danger"
                        size="md"
                        style={styles.pauseBtn}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050510',
    },
    hud: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: Spacing.sm,
        paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 36,
        paddingBottom: 6,
        backgroundColor: 'rgba(5,5,16,0.65)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(100,130,200,0.15)',
    },
    hudLeft: { flex: 1 },
    hudCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    hudRight: { flex: 1, alignItems: 'flex-end' },
    hudLabel: { letterSpacing: 2, marginBottom: 2 },
    controls: {
        position: 'absolute',
        top: StatusBar.currentHeight ? StatusBar.currentHeight + 2 : 34,
        right: Spacing.sm,
        flexDirection: 'row',
        gap: 6,
    },
    ctrlBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(10,10,30,0.7)',
    },
    pauseOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(5,5,16,0.92)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    pauseSub: { marginTop: 8, marginBottom: Spacing.lg },
    pauseScore: { marginBottom: Spacing.xl },
    pauseBtn: { marginTop: Spacing.md, alignSelf: 'stretch' },
});
