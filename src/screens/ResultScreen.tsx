import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Spacing } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useGameStore } from '../store/gameStore';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export const ResultScreen: React.FC<Props> = ({ navigation }) => {
    const {
        status,
        score,
        stakeAmount,
        multiplier,
        rewardAmount,
        txSignature,
        duration,
        difficulty,
        resetGame,
    } = useGameStore();

    const isWin = status === 'won';

    const handlePlayAgain = () => {
        resetGame();
        navigation.replace('Setup');
    };

    const handleHome = () => {
        resetGame();
        navigation.popToTop();
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            {/* Result Header */}
            <GlowText
                color={isWin ? Colors.neonGreen : Colors.danger}
                size="hero"
                align="center"
            >
                {isWin ? 'YOU WIN!' : 'GAME OVER'}
            </GlowText>

            <GlowText color={Colors.textSecondary} size="body" align="center" style={styles.subtext}>
                {isWin
                    ? 'You survived the timer! Rewards are yours.'
                    : 'Ball drained before the timer ended.'}
            </GlowText>

            {/* Stats Card */}
            <NeonCard
                glowColor={isWin ? Colors.neonGreen : Colors.danger}
                style={styles.card}
            >
                <View style={styles.statRow}>
                    <GlowText color={Colors.textSecondary} size="body">
                        Score
                    </GlowText>
                    <GlowText color={Colors.neonYellow} size="lg">
                        {score.toLocaleString()}
                    </GlowText>
                </View>

                <View style={styles.statRow}>
                    <GlowText color={Colors.textSecondary} size="body">
                        Stake
                    </GlowText>
                    <GlowText color={Colors.textPrimary} size="lg">
                        {stakeAmount.toFixed(4)} SOL
                    </GlowText>
                </View>

                <View style={styles.statRow}>
                    <GlowText color={Colors.textSecondary} size="body">
                        Difficulty
                    </GlowText>
                    <GlowText color={Colors.neonPurple} size="lg">
                        {difficulty.toUpperCase()} / {duration}s
                    </GlowText>
                </View>

                {isWin && (
                    <>
                        <View style={[styles.statRow, styles.rewardRow]}>
                            <GlowText color={Colors.textSecondary} size="body">
                                Multiplier
                            </GlowText>
                            <GlowText color={Colors.neonBlue} size="lg">
                                {multiplier.toFixed(1)}x
                            </GlowText>
                        </View>

                        <View style={[styles.statRow, styles.rewardRow]}>
                            <GlowText color={Colors.neonGreen} size="md" weight="700">
                                REWARD
                            </GlowText>
                            <GlowText color={Colors.neonGreen} size="xl" weight="700">
                                {(stakeAmount * multiplier).toFixed(4)} SOL
                            </GlowText>
                        </View>

                        {txSignature && (
                            <View style={styles.sigContainer}>
                                <GlowText color={Colors.textMuted} size="xs" align="center">
                                    TX: {txSignature.slice(0, 20)}...
                                </GlowText>
                            </View>
                        )}
                    </>
                )}

                {!isWin && (
                    <View style={[styles.statRow, styles.rewardRow]}>
                        <GlowText color={Colors.danger} size="md" weight="700">
                            LOST STAKE
                        </GlowText>
                        <GlowText color={Colors.danger} size="xl" weight="700">
                            -{stakeAmount.toFixed(4)} SOL
                        </GlowText>
                    </View>
                )}
            </NeonCard>

            {/* Actions */}
            <View style={styles.actions}>
                <NeonButton
                    title="Play Again"
                    onPress={handlePlayAgain}
                    variant={isWin ? 'primary' : 'secondary'}
                    size="lg"
                />
                <NeonButton
                    title="Leaderboard"
                    onPress={() => navigation.navigate('Leaderboard')}
                    variant="secondary"
                    size="md"
                    style={styles.secondaryBtn}
                />
                <NeonButton
                    title="Home"
                    onPress={handleHome}
                    variant="danger"
                    size="sm"
                    style={styles.secondaryBtn}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
        paddingHorizontal: Spacing.lg,
        justifyContent: 'center',
    },
    subtext: {
        marginTop: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    card: {
        marginBottom: Spacing.xl,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.xs,
    },
    rewardRow: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    sigContainer: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    actions: {
        gap: Spacing.md,
    },
    secondaryBtn: {
        marginTop: 0,
    },
});
