import React, { useMemo, useCallback, useState } from 'react';
import {
    View,
    StyleSheet,
    TextInput,
    Alert,
    ScrollView,
    StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
    Colors,
    Spacing,
    FontSizes,
    BorderRadius,
    Difficulty,
    Duration,
    MULTIPLIER_TABLE,
    DIFFICULTY_LABELS,
    DURATION_OPTIONS,
} from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useGameStore } from '../store/gameStore';
import { useWalletStore } from '../store/walletStore';
import { buildStakeTransaction } from '../solana/transactions';
import { openPhantomLink, buildSignAndSendUrl } from '../solana/phantom';
import { generateGameSeed } from '../solana/anticheat';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

export const SetupScreen: React.FC<Props> = ({ navigation }) => {
    const {
        stakeAmount,
        duration,
        difficulty,
        multiplier,
        setStakeAmount,
        setDuration,
        setDifficulty,
        setStatus,
        setTimeRemaining,
    } = useGameStore();

    const { publicKey, balance, session } = useWalletStore();
    const [loading, setLoading] = useState(false);

    const estimatedPayout = useMemo(
        () => (stakeAmount * multiplier).toFixed(4),
        [stakeAmount, multiplier],
    );

    const canStart =
        stakeAmount > 0 &&
        stakeAmount <= balance &&
        publicKey !== null &&
        !loading;

    const handleStart = useCallback(async () => {
        if (!publicKey || !session) {
            Alert.alert('Error', 'Wallet not connected');
            return;
        }

        if (stakeAmount > balance) {
            Alert.alert('Insufficient Balance', 'You do not have enough SOL.');
            return;
        }

        setLoading(true);
        try {
            // Build the stake transaction
            const tx = await buildStakeTransaction(
                publicKey,
                stakeAmount,
                duration,
                difficulty,
            );

            // In production: send via Phantom deep link
            // For demo, we skip the actual signing and go straight to game
            // const url = buildSignAndSendUrl(tx, session);
            // await openPhantomLink(url);

            // Generate game seed for anti-cheat
            const seed = await generateGameSeed();

            // Set game state
            setTimeRemaining(duration);
            setStatus('playing');

            // Navigate to game
            navigation.replace('Game');
        } catch (err: any) {
            Alert.alert('Transaction Failed', err.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }, [publicKey, session, stakeAmount, balance, duration, difficulty, navigation]);

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
        >
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <GlowText color={Colors.neonPurple} size="xl" align="center">
                Game Setup
            </GlowText>

            {/* Stake Amount */}
            <NeonCard glowColor={Colors.neonBlue} style={styles.section}>
                <GlowText color={Colors.textSecondary} size="sm">
                    STAKE AMOUNT (SOL)
                </GlowText>
                <TextInput
                    style={styles.input}
                    value={stakeAmount.toString()}
                    onChangeText={(text) => {
                        const v = parseFloat(text) || 0;
                        setStakeAmount(v);
                    }}
                    keyboardType="decimal-pad"
                    placeholderTextColor={Colors.textMuted}
                    placeholder="0.1"
                />
                <GlowText color={Colors.textMuted} size="xs">
                    Available: {balance.toFixed(4)} SOL
                </GlowText>
            </NeonCard>

            {/* Duration Selector */}
            <NeonCard glowColor={Colors.neonPurple} style={styles.section}>
                <GlowText color={Colors.textSecondary} size="sm">
                    TIME DURATION
                </GlowText>
                <View style={styles.optionRow}>
                    {DURATION_OPTIONS.map((d) => (
                        <NeonButton
                            key={d}
                            title={`${d}s`}
                            variant={duration === d ? 'primary' : 'secondary'}
                            size="sm"
                            onPress={() => setDuration(d)}
                            style={duration === d ? [styles.optionBtn, styles.optionBtnActive] : styles.optionBtn}
                        />
                    ))}
                </View>
            </NeonCard>

            {/* Difficulty Selector */}
            <NeonCard glowColor={Colors.neonPink} style={styles.section}>
                <GlowText color={Colors.textSecondary} size="sm">
                    DIFFICULTY
                </GlowText>
                <View style={styles.optionRow}>
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                        <NeonButton
                            key={d}
                            title={DIFFICULTY_LABELS[d]}
                            variant={difficulty === d ? 'primary' : 'secondary'}
                            size="sm"
                            onPress={() => setDifficulty(d)}
                            style={difficulty === d ? [styles.optionBtn, styles.optionBtnActive] : styles.optionBtn}
                        />
                    ))}
                </View>
            </NeonCard>

            {/* Preview Card */}
            <NeonCard glowColor={Colors.neonGreen} style={styles.section}>
                <View style={styles.previewRow}>
                    <GlowText color={Colors.textSecondary} size="body">
                        Multiplier
                    </GlowText>
                    <GlowText color={Colors.neonYellow} size="xl">
                        {multiplier.toFixed(1)}x
                    </GlowText>
                </View>
                <View style={styles.previewRow}>
                    <GlowText color={Colors.textSecondary} size="body">
                        Estimated Payout
                    </GlowText>
                    <GlowText color={Colors.neonGreen} size="xl">
                        {estimatedPayout} SOL
                    </GlowText>
                </View>
            </NeonCard>

            {/* Start Button */}
            <NeonButton
                title={loading ? 'Staking...' : 'Start Game'}
                onPress={handleStart}
                disabled={!canStart}
                loading={loading}
                variant="primary"
                size="lg"
                style={styles.startBtn}
            />

            <NeonButton
                title="Back"
                onPress={() => navigation.goBack()}
                variant="secondary"
                size="sm"
                style={styles.backBtn}
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
    },
    content: {
        padding: Spacing.lg,
        paddingTop: Spacing.xxl,
    },
    section: {
        marginTop: Spacing.md,
    },
    input: {
        color: Colors.neonBlue,
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        paddingVertical: Spacing.sm,
        marginVertical: Spacing.sm,
        fontFamily: 'monospace',
    },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: Spacing.sm,
        gap: Spacing.sm,
    },
    optionBtn: {
        flex: 1,
    },
    optionBtnActive: {
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.xs,
    },
    startBtn: {
        marginTop: Spacing.xl,
    },
    backBtn: {
        marginTop: Spacing.md,
    },
});
