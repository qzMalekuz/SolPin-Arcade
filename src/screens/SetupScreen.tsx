import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    TextInput,
    Alert,
    ScrollView,
    StatusBar,
    Animated,
    Easing,
    Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
    Colors,
    Spacing,
    FontSizes,
    Difficulty,
    DIFFICULTY_LABELS,
    DURATION_OPTIONS,
    Animations,
} from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useGameStore } from '../store/gameStore';
import { useInGameWalletStore } from '../store/inGameWalletStore';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

const useFadeInDown = (delay = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: Animations.smooth,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    tension: 200,
                    friction: 18,
                    useNativeDriver: true,
                }),
            ]).start();
        }, delay);

        return () => clearTimeout(timer);
    }, []);

    return { opacity, transform: [{ translateY }] };
};

export const SetupScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
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
    const { getBalanceSol, placeBet, solPrice } = useInGameWalletStore();
    const [stakeInput, setStakeInput] = useState(stakeAmount.toString());

    const inGameBalance = getBalanceSol();
    const balanceUsd = solPrice > 0 ? inGameBalance * solPrice : null;

    const estimatedPayout = useMemo(
        () => (stakeAmount * multiplier).toFixed(4),
        [stakeAmount, multiplier],
    );
    const canStart = stakeAmount >= 0.001 && stakeAmount <= inGameBalance;

    const anim0 = useFadeInDown(50);
    const anim1 = useFadeInDown(50 + Animations.stagger);
    const anim2 = useFadeInDown(50 + Animations.stagger * 2);
    const anim3 = useFadeInDown(50 + Animations.stagger * 3);
    const anim4 = useFadeInDown(50 + Animations.stagger * 4);
    const anim5 = useFadeInDown(50 + Animations.stagger * 5);

    const handleStart = useCallback(() => {
        if (stakeAmount < 0.001) {
            Alert.alert('Minimum Stake', 'Minimum stake is 0.001 SOL.');
            return;
        }
        if (stakeAmount > inGameBalance) {
            Alert.alert(
                'Insufficient Balance',
                'Not enough in-game wallet balance.\nGo to your In-Game Wallet to top up.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Top Up', onPress: () => navigation.navigate('InGameWallet') },
                ],
            );
            return;
        }

        const deducted = placeBet(stakeAmount);
        if (!deducted) {
            Alert.alert('Insufficient Balance', 'Not enough in-game wallet balance.');
            return;
        }

        setTimeRemaining(duration);
        setStatus('playing');
        navigation.replace('Game');
    }, [stakeAmount, inGameBalance, placeBet, duration, navigation, setStatus, setTimeRemaining]);

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={[
                styles.content,
                { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
            ]}
        >
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <Animated.View style={anim0}>
                <GlowText color={Colors.textPrimary} size="xl" align="center" weight="700" glow={0}>
                    Game Setup
                </GlowText>
            </Animated.View>

            {/* In-game wallet balance strip */}
            <Animated.View style={[styles.balanceStrip, anim0]}>
                <GlowText color={Colors.textSecondary} size="xs" glow={0}>IN-GAME BALANCE</GlowText>
                <View style={styles.balanceRight}>
                    <GlowText color={Colors.textPrimary} size="body" weight="700" glow={0}>
                        {inGameBalance.toFixed(4)} SOL
                    </GlowText>
                    {balanceUsd !== null && (
                        <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.balanceUsd}>
                            ≈ ${balanceUsd.toFixed(2)}
                        </GlowText>
                    )}
                </View>
            </Animated.View>

            <Animated.View style={anim1}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>
                        STAKE AMOUNT (SOL)
                    </GlowText>
                    <TextInput
                        style={styles.input}
                        value={stakeInput}
                        onChangeText={(text) => {
                            setStakeInput(text);
                            const parsed = parseFloat(text);
                            if (!isNaN(parsed)) setStakeAmount(parsed);
                        }}
                        onBlur={() => {
                            const parsed = parseFloat(stakeInput);
                            if (isNaN(parsed) || parsed <= 0) {
                                setStakeAmount(0.001);
                                setStakeInput('0.001');
                            } else {
                                setStakeAmount(parsed);
                                setStakeInput(parsed.toString());
                            }
                        }}
                        keyboardType="decimal-pad"
                        placeholderTextColor={Colors.textMuted}
                        placeholder="0.001"
                    />
                    {stakeAmount > inGameBalance && inGameBalance > 0 && (
                        <GlowText color={Colors.danger} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                            Exceeds in-game balance
                        </GlowText>
                    )}
                    {inGameBalance <= 0 && (
                        <GlowText color={Colors.danger} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                            No balance — top up your in-game wallet first
                        </GlowText>
                    )}
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim2}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>
                        TIME DURATION
                    </GlowText>
                    <View style={styles.optionRow}>
                        {DURATION_OPTIONS.map((option) => (
                            <NeonButton
                                key={option}
                                title={`${option}s`}
                                variant={duration === option ? 'primary' : 'secondary'}
                                size="sm"
                                onPress={() => setDuration(option)}
                                style={[
                                    styles.optionBtn,
                                    duration === option ? styles.optionBtnActive : undefined,
                                ]}
                            />
                        ))}
                    </View>
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim3}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>
                        DIFFICULTY
                    </GlowText>
                    <View style={styles.diffGrid}>
                        {([
                            { key: 'easy' as Difficulty, stars: '★☆☆', desc: 'Relaxed & Forgiving' },
                            { key: 'medium' as Difficulty, stars: '★★☆', desc: 'Balanced Challenge' },
                            { key: 'hard' as Difficulty, stars: '★★★', desc: 'Precision Required' },
                        ]).map((item) => {
                            const selected = difficulty === item.key;
                            return (
                                <Pressable
                                    key={item.key}
                                    onPress={() => setDifficulty(item.key)}
                                    style={[styles.diffBtn, selected ? styles.diffBtnActive : undefined]}
                                >
                                    <GlowText color={selected ? Colors.textPrimary : Colors.textMuted} size="xs" glow={0} align="center">
                                        {item.stars}
                                    </GlowText>
                                    <GlowText color={selected ? Colors.textPrimary : Colors.textSecondary} size="body" weight="700" glow={0} align="center">
                                        {DIFFICULTY_LABELS[item.key]}
                                    </GlowText>
                                    <GlowText color={selected ? Colors.textSecondary : Colors.textMuted} size="xs" glow={0} align="center">
                                        {item.desc}
                                    </GlowText>
                                </Pressable>
                            );
                        })}
                    </View>
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim4}>
                <NeonCard style={styles.section}>
                    <View style={styles.previewRow}>
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>Multiplier</GlowText>
                        <GlowText color={Colors.textPrimary} size="xl" weight="700" glow={0}>{multiplier.toFixed(1)}x</GlowText>
                    </View>
                    <View style={[styles.previewRow, styles.previewRowBorder]}>
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>Estimated Payout</GlowText>
                        <GlowText color={Colors.success} size="xl" weight="700" glow={0}>{estimatedPayout} SOL</GlowText>
                    </View>
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim5}>
                <NeonButton
                    title="Start Game"
                    onPress={handleStart}
                    disabled={!canStart}
                    variant="primary"
                    size="lg"
                    style={styles.startBtn}
                />
                {inGameBalance <= 0 && (
                    <NeonButton
                        title="Top Up In-Game Wallet"
                        onPress={() => navigation.navigate('InGameWallet')}
                        variant="secondary"
                        size="md"
                        style={styles.topUpBtn}
                    />
                )}
                <NeonButton
                    title="Back"
                    onPress={() => navigation.goBack()}
                    variant="secondary"
                    size="sm"
                    style={styles.backBtn}
                />
            </Animated.View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content: { paddingHorizontal: Spacing.lg },
    balanceStrip: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Spacing.md,
        marginBottom: -Spacing.xs,
        paddingHorizontal: Spacing.xs,
    },
    balanceRight: { alignItems: 'flex-end' },
    balanceUsd: { marginTop: 1 },
    section: { marginTop: Spacing.md },
    sectionLabel: { letterSpacing: 1.5, marginBottom: Spacing.xs },
    input: {
        color: Colors.textPrimary,
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        paddingVertical: Spacing.sm,
        marginVertical: Spacing.sm,
    },
    optionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, gap: Spacing.sm },
    optionBtn: { flex: 1 },
    optionBtnActive: { backgroundColor: Colors.bgSelected },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
    previewRowBorder: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    startBtn: { marginTop: Spacing.lg },
    topUpBtn: { marginTop: Spacing.sm + 4 },
    backBtn: { marginTop: Spacing.sm + 4 },
    diffGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, gap: Spacing.sm },
    diffBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        borderRadius: 14,
        paddingVertical: Spacing.sm + 2,
        paddingHorizontal: Spacing.xs,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    diffBtnActive: { backgroundColor: Colors.bgSelected, borderColor: 'rgba(255,255,255,0.15)' },
});
