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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
    Colors,
    Spacing,
    FontSizes,
    Difficulty,
    Duration,
    DIFFICULTY_LABELS,
    DURATION_OPTIONS,
    Animations,
} from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useGameStore } from '../store/gameStore';
import { useWalletStore } from '../store/walletStore';
import { buildStakeTransaction } from '../solana/transactions';
import { generateGameSeed } from '../solana/anticheat';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

const useFadeInDown = (delay: number = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(16)).current;
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

export const SetupScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const {
        stakeAmount, duration, difficulty, multiplier,
        setStakeAmount, setDuration, setDifficulty, setStatus, setTimeRemaining,
    } = useGameStore();
    const { publicKey, balance, session } = useWalletStore();
    const [loading, setLoading] = useState(false);

    const estimatedPayout = useMemo(() => (stakeAmount * multiplier).toFixed(4), [stakeAmount, multiplier]);
    const canStart = stakeAmount > 0 && stakeAmount <= balance && publicKey !== null && !loading;

    const anim0 = useFadeInDown(50);
    const anim1 = useFadeInDown(50 + Animations.stagger);
    const anim2 = useFadeInDown(50 + Animations.stagger * 2);
    const anim3 = useFadeInDown(50 + Animations.stagger * 3);
    const anim4 = useFadeInDown(50 + Animations.stagger * 4);
    const anim5 = useFadeInDown(50 + Animations.stagger * 5);

    const handleStart = useCallback(async () => {
        if (!publicKey || !session) { Alert.alert('Error', 'Wallet not connected'); return; }
        if (stakeAmount > balance) { Alert.alert('Insufficient Balance', 'You do not have enough SOL.'); return; }
        setLoading(true);
        try {
            await buildStakeTransaction(publicKey, stakeAmount, duration, difficulty);
            await generateGameSeed();
            setTimeRemaining(duration);
            setStatus('playing');
            navigation.replace('Game');
        } catch (err: any) {
            Alert.alert('Transaction Failed', err.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }, [publicKey, session, stakeAmount, balance, duration, difficulty, navigation]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <Animated.View style={anim0}>
                <GlowText color={Colors.textPrimary} size="xl" align="center" weight="700" glow={0}>Game Setup</GlowText>
            </Animated.View>

            <Animated.View style={anim1}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>STAKE AMOUNT (SOL)</GlowText>
                    <TextInput
                        style={styles.input}
                        value={stakeAmount.toString()}
                        onChangeText={(text) => setStakeAmount(parseFloat(text) || 0)}
                        keyboardType="decimal-pad"
                        placeholderTextColor={Colors.textMuted}
                        placeholder="0.1"
                    />
                    <GlowText color={Colors.textMuted} size="xs" glow={0}>Available: {balance.toFixed(4)} SOL</GlowText>
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim2}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>TIME DURATION</GlowText>
                    <View style={styles.optionRow}>
                        {DURATION_OPTIONS.map((d) => (
                            <NeonButton key={d} title={`${d}s`} variant={duration === d ? 'primary' : 'secondary'} size="sm"
                                onPress={() => setDuration(d)}
                                style={[styles.optionBtn, duration === d ? styles.optionBtnActive : undefined]}
                            />
                        ))}
                    </View>
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim3}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>DIFFICULTY</GlowText>
                    <View style={styles.optionRow}>
                        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                            <NeonButton key={d} title={DIFFICULTY_LABELS[d]} variant={difficulty === d ? 'primary' : 'secondary'} size="sm"
                                onPress={() => setDifficulty(d)}
                                style={[styles.optionBtn, difficulty === d ? styles.optionBtnActive : undefined]}
                            />
                        ))}
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
                <NeonButton title={loading ? 'Staking...' : 'Start Game'} onPress={handleStart} disabled={!canStart} loading={loading} variant="primary" size="lg" style={styles.startBtn} />
                <NeonButton title="Back" onPress={() => navigation.goBack()} variant="secondary" size="sm" style={styles.backBtn} />
            </Animated.View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content: { paddingHorizontal: Spacing.lg },
    section: { marginTop: Spacing.md },
    sectionLabel: { letterSpacing: 1.5, marginBottom: Spacing.xs },
    input: { color: Colors.textPrimary, fontSize: FontSizes.xxl, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm, marginVertical: Spacing.sm },
    optionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, gap: Spacing.sm },
    optionBtn: { flex: 1 },
    optionBtnActive: { backgroundColor: Colors.bgSelected },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
    previewRowBorder: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    startBtn: { marginTop: Spacing.lg },
    backBtn: { marginTop: Spacing.sm + 4 },
});
