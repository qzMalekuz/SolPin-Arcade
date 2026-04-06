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
import * as Linking from 'expo-linking';

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
import { useWalletStore } from '../store/walletStore';
import { buildStakeTransaction } from '../solana/transactions';
import { generateGameSeed } from '../solana/anticheat';
import {
    buildSignAndSendUrl,
    getPhantomErrorMessage,
    hasPhantomSession,
    hydratePhantomSession,
    openPhantomLink,
    parseSignAndSendResponse,
} from '../solana/phantom';
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
        setTxSignature,
    } = useGameStore();
    const { publicKey, balance, session } = useWalletStore();
    const [loading, setLoading] = useState(false);
    const phantomSigningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const estimatedPayout = useMemo(
        () => (stakeAmount * multiplier).toFixed(4),
        [stakeAmount, multiplier],
    );
    const canStart = stakeAmount > 0 && stakeAmount <= balance && publicKey !== null && !loading;

    const anim0 = useFadeInDown(50);
    const anim1 = useFadeInDown(50 + Animations.stagger);
    const anim2 = useFadeInDown(50 + Animations.stagger * 2);
    const anim3 = useFadeInDown(50 + Animations.stagger * 3);
    const anim4 = useFadeInDown(50 + Animations.stagger * 4);
    const anim5 = useFadeInDown(50 + Animations.stagger * 5);

    const clearPhantomSigningTimeout = useCallback(() => {
        if (phantomSigningTimeoutRef.current) {
            clearTimeout(phantomSigningTimeoutRef.current);
            phantomSigningTimeoutRef.current = null;
        }
    }, []);

    const handlePhantomSignRedirect = useCallback((url: string) => {
        if (!url.includes('onSignAndSend')) {
            return;
        }

        clearPhantomSigningTimeout();
        const phantomError = getPhantomErrorMessage(
            url,
            'Phantom could not complete the transaction request.',
        );

        if (phantomError) {
            setLoading(false);
            Alert.alert('Transaction Failed', phantomError);
            return;
        }

        const result = parseSignAndSendResponse(url);
        if (!result?.signature) {
            setLoading(false);
            Alert.alert(
                'Transaction Failed',
                'The transaction response from Phantom could not be verified.',
            );
            return;
        }

        setTxSignature(result.signature);
        setTimeRemaining(duration);
        setStatus('playing');
        setLoading(false);
        navigation.replace('Game');
    }, [clearPhantomSigningTimeout, duration, navigation, setStatus, setTimeRemaining, setTxSignature]);

    useEffect(() => {
        const handleInitialUrl = async () => {
            await hydratePhantomSession();
            const initialUrl = await Linking.getInitialURL();
            if (initialUrl) {
                handlePhantomSignRedirect(initialUrl);
            }
        };

        handleInitialUrl();

        const subscription = Linking.addEventListener('url', ({ url }) => {
            handlePhantomSignRedirect(url);
        });

        return () => {
            clearPhantomSigningTimeout();
            subscription.remove();
        };
    }, [clearPhantomSigningTimeout, handlePhantomSignRedirect]);

    const handleStart = useCallback(async () => {
        if (!publicKey || !session) {
            Alert.alert('Wallet Required', 'Connect Phantom before starting a game.');
            return;
        }

        if (stakeAmount > balance) {
            Alert.alert('Insufficient Balance', 'You do not have enough SOL.');
            return;
        }

        setLoading(true);

        try {
            await generateGameSeed();
            await hydratePhantomSession();

            if (!hasPhantomSession()) {
                setLoading(false);
                Alert.alert(
                    'Reconnect Required',
                    'Your Phantom session expired. Reconnect your wallet and try again.',
                );
                navigation.navigate('Wallet');
                return;
            }

            const transaction = await buildStakeTransaction(
                publicKey,
                stakeAmount,
                duration,
                difficulty,
            );

            const signUrl = buildSignAndSendUrl(transaction, session);
            clearPhantomSigningTimeout();
            phantomSigningTimeoutRef.current = setTimeout(() => {
                setLoading(false);
                Alert.alert(
                    'Wallet Timeout',
                    'Phantom did not return to the app in time. Please try again.',
                );
            }, 60000);

            await openPhantomLink(signUrl);
        } catch (error: any) {
            clearPhantomSigningTimeout();
            setLoading(false);
            Alert.alert(
                'Transaction Failed',
                error?.message || 'Something went wrong while opening Phantom.',
            );
        }
    }, [
        balance,
        clearPhantomSigningTimeout,
        difficulty,
        duration,
        navigation,
        publicKey,
        session,
        stakeAmount,
    ]);

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

            <Animated.View style={anim1}>
                <NeonCard style={styles.section}>
                    <GlowText color={Colors.textSecondary} size="sm" glow={0} style={styles.sectionLabel}>
                        STAKE AMOUNT (SOL)
                    </GlowText>
                    <TextInput
                        style={styles.input}
                        value={stakeAmount.toString()}
                        onChangeText={(text) => setStakeAmount(parseFloat(text) || 0)}
                        keyboardType="decimal-pad"
                        placeholderTextColor={Colors.textMuted}
                        placeholder="0.1"
                    />
                    <GlowText color={Colors.textMuted} size="xs" glow={0}>
                        Available: {balance.toFixed(4)} SOL
                    </GlowText>
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
                                    <GlowText
                                        color={selected ? Colors.textPrimary : Colors.textMuted}
                                        size="xs"
                                        glow={0}
                                        align="center"
                                    >
                                        {item.stars}
                                    </GlowText>
                                    <GlowText
                                        color={selected ? Colors.textPrimary : Colors.textSecondary}
                                        size="body"
                                        weight="700"
                                        glow={0}
                                        align="center"
                                    >
                                        {DIFFICULTY_LABELS[item.key]}
                                    </GlowText>
                                    <GlowText
                                        color={selected ? Colors.textSecondary : Colors.textMuted}
                                        size="xs"
                                        glow={0}
                                        align="center"
                                    >
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
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>
                            Multiplier
                        </GlowText>
                        <GlowText color={Colors.textPrimary} size="xl" weight="700" glow={0}>
                            {multiplier.toFixed(1)}x
                        </GlowText>
                    </View>
                    <View style={[styles.previewRow, styles.previewRowBorder]}>
                        <GlowText color={Colors.textSecondary} size="body" glow={0}>
                            Estimated Payout
                        </GlowText>
                        <GlowText color={Colors.success} size="xl" weight="700" glow={0}>
                            {estimatedPayout} SOL
                        </GlowText>
                    </View>
                </NeonCard>
            </Animated.View>

            <Animated.View style={anim5}>
                <NeonButton
                    title={loading ? 'Opening Phantom...' : 'Start Game'}
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
            </Animated.View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content: { paddingHorizontal: Spacing.lg },
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
