import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { Colors, Spacing, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { useGameStore } from '../store/gameStore';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

const useFadeInDown = (delay: number = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    useEffect(() => {
        const t = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: Animations.smooth, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, tension: 200, friction: 18, useNativeDriver: true }),
            ]).start();
        }, delay);
        return () => clearTimeout(t);
    }, []);
    return { opacity, transform: [{ translateY }] };
};

export const ResultScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { status, score, stakeAmount, multiplier, txSignature, duration, difficulty, resetGame } = useGameStore();
    const isWin = status === 'won';

    const headerAnim = useFadeInDown(100);
    const cardAnim = useFadeInDown(300);
    const actionsAnim = useFadeInDown(500);

    useEffect(() => {
        if (isWin) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        }
    }, [isWin]);

    const handlePlayAgain = () => { resetGame(); navigation.replace('Setup'); };
    const handleHome = () => { resetGame(); navigation.popToTop(); };

    return (
        <View style={[styles.container, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg }]}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <Animated.View style={headerAnim}>
                <GlowText color={isWin ? Colors.success : Colors.danger} size="hero" align="center" weight="700" glow={1}>
                    {isWin ? 'YOU WIN!' : 'GAME OVER'}
                </GlowText>
                <GlowText color={Colors.textSecondary} size="body" align="center" glow={0} style={styles.subtext}>
                    {isWin ? 'You survived the timer! Rewards are yours.' : 'Ball drained before the timer ended.'}
                </GlowText>
            </Animated.View>

            <Animated.View style={cardAnim}>
                <NeonCard style={styles.card}>
                    <View style={styles.statRow}>
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>Score</GlowText>
                        <AnimatedNumber value={score} duration={1000} color={Colors.textPrimary} size="lg" weight="700" />
                    </View>
                    <View style={styles.statRow}>
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>Stake</GlowText>
                        <GlowText color={Colors.textPrimary} size="lg" weight="600" glow={0}>{stakeAmount.toFixed(4)} SOL</GlowText>
                    </View>
                    <View style={styles.statRow}>
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>Difficulty</GlowText>
                        <GlowText color={Colors.textSecondary} size="lg" weight="600" glow={0}>{difficulty.toUpperCase()} / {duration}s</GlowText>
                    </View>

                    {isWin && (
                        <>
                            <View style={[styles.statRow, styles.rewardRow]}>
                                <GlowText color={Colors.textSecondary} size="body" glow={0}>Multiplier</GlowText>
                                <GlowText color={Colors.textPrimary} size="lg" weight="700" glow={0}>{multiplier.toFixed(1)}x</GlowText>
                            </View>
                            <View style={[styles.statRow, styles.rewardRow]}>
                                <GlowText color={Colors.success} size="md" weight="700" glow={0}>REWARD</GlowText>
                                <AnimatedNumber value={stakeAmount * multiplier} duration={1400} decimals={4} suffix=" SOL" color={Colors.success} size="xl" weight="700" />
                            </View>
                            {txSignature && (
                                <View style={styles.sigContainer}>
                                    <GlowText color={Colors.textMuted} size="xs" align="center" glow={0}>TX: {txSignature.slice(0, 20)}...</GlowText>
                                </View>
                            )}
                        </>
                    )}

                    {!isWin && (
                        <View style={[styles.statRow, styles.rewardRow]}>
                            <GlowText color={Colors.danger} size="md" weight="700" glow={0}>LOST STAKE</GlowText>
                            <GlowText color={Colors.danger} size="xl" weight="700" glow={0}>-{stakeAmount.toFixed(4)} SOL</GlowText>
                        </View>
                    )}
                </NeonCard>
            </Animated.View>

            <Animated.View style={[styles.actions, actionsAnim]}>
                <NeonButton title="Play Again" onPress={handlePlayAgain} variant={isWin ? 'primary' : 'secondary'} size="lg" />
                <NeonButton title="Leaderboard" onPress={() => navigation.navigate('Leaderboard')} variant="secondary" size="md" />
                <NeonButton title="Home" onPress={handleHome} variant="danger" size="sm" />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
    subtext: { marginTop: Spacing.sm, marginBottom: Spacing.lg },
    card: { marginBottom: Spacing.lg },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs + 2 },
    rewardRow: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    sigContainer: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    actions: { gap: Spacing.sm + 4 },
});
