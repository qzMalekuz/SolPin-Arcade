import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    StatusBar,
    Alert,
    TextInput,
    Animated,
    Easing,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import { Colors, Spacing, FontSizes, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useInGameWalletStore, WalletTx } from '../store/inGameWalletStore';
import { useWalletStore } from '../store/walletStore';
import { getConnection } from '../solana/connection';
import { getSolPrice, usdToSol } from '../solana/price';
import { buildTopUpTransaction } from '../solana/transactions';
import {
    buildSignTransactionUrl,
    getPhantomErrorMessage,
    hasPhantomSession,
    hydratePhantomSession,
    openPhantomLink,
    parseSignTransactionResponse,
} from '../solana/phantom';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'InGameWallet'>;

const MIN_TOPUP_USD = 10;
const MIN_WITHDRAW_USD = 50;

const useFadeIn = (delay = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(14)).current;
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

const TX_ICONS: Record<string, string> = {
    TOP_UP: '↓',
    WIN: '+',
    LOSS: '−',
    WITHDRAWAL: '↑',
};

const TX_LABELS: Record<string, string> = {
    TOP_UP: 'Top-Up',
    WIN: 'Win',
    LOSS: 'Loss',
    WITHDRAWAL: 'Withdrawal',
};

const TX_COLOR: Record<string, string> = {
    TOP_UP: Colors.textPrimary,
    WIN: Colors.success,
    LOSS: Colors.danger,
    WITHDRAWAL: Colors.textSecondary,
};

const formatDate = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const TxRow: React.FC<{ tx: WalletTx }> = ({ tx }) => {
    const isCredit = tx.type === 'TOP_UP' || tx.type === 'WIN';
    const color = TX_COLOR[tx.type];
    return (
        <View style={txStyles.row}>
            <View style={txStyles.iconWrap}>
                <GlowText color={color} size="lg" weight="700" glow={0}>
                    {TX_ICONS[tx.type]}
                </GlowText>
            </View>
            <View style={txStyles.meta}>
                <GlowText color={Colors.textPrimary} size="body" weight="600" glow={0}>
                    {TX_LABELS[tx.type]}
                </GlowText>
                <GlowText color={Colors.textMuted} size="xs" glow={0}>
                    {formatDate(tx.timestamp)}
                    {tx.status === 'pending' ? '  •  Pending' : ''}
                </GlowText>
            </View>
            <View style={txStyles.amount}>
                <GlowText color={color} size="body" weight="700" glow={0}>
                    {isCredit ? '+' : '−'}{tx.amountSol.toFixed(4)} SOL
                </GlowText>
                <GlowText color={Colors.textMuted} size="xs" glow={0}>
                    ${tx.amountUsd.toFixed(2)}
                </GlowText>
            </View>
        </View>
    );
};

const txStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2 },
    iconWrap: { width: 32, alignItems: 'center' },
    meta: { flex: 1, marginLeft: Spacing.sm },
    amount: { alignItems: 'flex-end' },
});

export const InGameWalletScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const {
        hydrate, hydrated, fetchSolPrice, solPrice,
        getBalanceSol, transactions, pendingTopUp,
        setPendingTopUp, clearPendingTopUp, topUp, requestWithdrawal,
    } = useInGameWalletStore();
    const { publicKey, session, connected } = useWalletStore();

    const [tab, setTab] = useState<'balance' | 'history'>('balance');
    const [topUpUsd, setTopUpUsd] = useState('');
    const [topUpInput, setTopUpInput] = useState('');
    const [withdrawUsd, setWithdrawUsd] = useState('');
    const [withdrawInput, setWithdrawInput] = useState('');
    const [loadingTopUp, setLoadingTopUp] = useState(false);
    const [loadingPrice, setLoadingPrice] = useState(false);
    const topUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const anim0 = useFadeIn(60);
    const anim1 = useFadeIn(140);
    const anim2 = useFadeIn(220);
    const anim3 = useFadeIn(300);

    const balanceSol = getBalanceSol();
    const balanceUsd = solPrice > 0 ? balanceSol * solPrice : null;
    const minTopUpSol = solPrice > 0 ? usdToSol(MIN_TOPUP_USD, solPrice) : null;
    const minWithdrawSol = solPrice > 0 ? usdToSol(MIN_WITHDRAW_USD, solPrice) : null;

    useEffect(() => {
        if (!hydrated) void hydrate();
        setLoadingPrice(true);
        void fetchSolPrice().finally(() => setLoadingPrice(false));
    }, []);

    // Deep-link handler: Phantom returns here after signing top-up tx
    const handleTopUpRedirect = useCallback(async (url: string) => {
        if (!url.includes('onTopUp')) return;

        clearTimeout(topUpTimeoutRef.current ?? undefined);

        const phantomError = getPhantomErrorMessage(url, 'Top-up transaction failed.');
        if (phantomError) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            Alert.alert('Top-Up Failed', phantomError);
            return;
        }

        const result = parseSignTransactionResponse(url);
        if (!result?.transaction) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            Alert.alert('Top-Up Failed', 'Could not verify the signed transaction from Phantom.');
            return;
        }

        const pending = useInGameWalletStore.getState().pendingTopUp;
        if (!pending) {
            setLoadingTopUp(false);
            return;
        }

        try {
            const connection = getConnection();
            const rawTransaction = result.transaction.serialize();
            const signature = await connection.sendRawTransaction(rawTransaction, {
                preflightCommitment: 'confirmed',
            });

            await connection.confirmTransaction(signature, 'confirmed');

            const credited = await topUp(pending.amountSol, pending.amountUsd, signature);
            clearPendingTopUp();
            setLoadingTopUp(false);

            if (credited) {
                Alert.alert(
                    'Top-Up Successful',
                    `+${pending.amountSol.toFixed(4)} SOL ($${pending.amountUsd.toFixed(2)}) added to your in-game wallet.`,
                );
            }
        } catch (err: any) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            Alert.alert('Top-Up Failed', err?.message ?? 'Could not send the signed transaction to Solana.');
        }
    }, [clearPendingTopUp, topUp]);

    useEffect(() => {
        const sub = Linking.addEventListener('url', ({ url }) => {
            void handleTopUpRedirect(url);
        });

        const checkInitial = async () => {
            const url = await Linking.getInitialURL();
            if (url) void handleTopUpRedirect(url);
        };
        void checkInitial();

        return () => {
            sub.remove();
            clearTimeout(topUpTimeoutRef.current ?? undefined);
        };
    }, [handleTopUpRedirect]);

    const handleTopUp = useCallback(async () => {
        if (!connected || !publicKey || !session) {
            Alert.alert('Wallet Required', 'Connect your Phantom wallet first.');
            return;
        }

        const usdVal = parseFloat(topUpUsd);
        if (isNaN(usdVal) || usdVal < MIN_TOPUP_USD) {
            Alert.alert('Minimum Top-Up', `Minimum top-up is $${MIN_TOPUP_USD}.`);
            return;
        }
        if (solPrice <= 0) {
            Alert.alert('Price Unavailable', 'Could not fetch SOL price. Try again.');
            return;
        }

        const amountSol = usdToSol(usdVal, solPrice);

        setLoadingTopUp(true);
        try {
            await hydratePhantomSession();
            if (!hasPhantomSession()) {
                setLoadingTopUp(false);
                Alert.alert('Reconnect Required', 'Your Phantom session expired. Reconnect your wallet.');
                navigation.navigate('Wallet');
                return;
            }

            const tx = await buildTopUpTransaction(publicKey, amountSol);
            const signUrl = buildSignTransactionUrl(tx, session, 'onTopUp');
            setPendingTopUp(amountSol, usdVal);

            topUpTimeoutRef.current = setTimeout(() => {
                setLoadingTopUp(false);
                clearPendingTopUp();
                Alert.alert('Timeout', 'Phantom did not respond in time. Please try again.');
            }, 60000);

            await openPhantomLink(signUrl);
        } catch (err: any) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            Alert.alert('Top-Up Failed', err?.message ?? 'Something went wrong.');
        }
    }, [
        connected, publicKey, session, topUpUsd, solPrice,
        navigation, setPendingTopUp, clearPendingTopUp,
    ]);

    const handleWithdraw = useCallback(() => {
        if (!connected) {
            Alert.alert('Wallet Required', 'Connect your Phantom wallet to withdraw.');
            return;
        }

        const usdVal = parseFloat(withdrawUsd);
        if (isNaN(usdVal) || usdVal < MIN_WITHDRAW_USD) {
            Alert.alert('Minimum Withdrawal', `Minimum withdrawal is $${MIN_WITHDRAW_USD}.`);
            return;
        }
        if (solPrice <= 0) {
            Alert.alert('Price Unavailable', 'Could not fetch SOL price. Try again.');
            return;
        }

        const amountSol = usdToSol(usdVal, solPrice);
        if (amountSol > balanceSol) {
            Alert.alert('Insufficient Balance', 'Your in-game wallet does not have enough SOL.');
            return;
        }

        Alert.alert(
            'Confirm Withdrawal',
            `Withdraw ${amountSol.toFixed(4)} SOL ($${usdVal.toFixed(2)}) to your Phantom wallet?\n\nProcessing may take a few minutes.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Withdraw',
                    style: 'default',
                    onPress: () => {
                        const ok = requestWithdrawal(amountSol, usdVal);
                        if (ok) {
                            setWithdrawUsd('');
                            setWithdrawInput('');
                            Alert.alert('Withdrawal Queued', 'Your withdrawal has been queued and will be sent to your Phantom wallet shortly.');
                        } else {
                            Alert.alert('Failed', 'Could not process withdrawal. Check your balance.');
                        }
                    },
                },
            ],
        );
    }, [connected, withdrawUsd, solPrice, balanceSol, requestWithdrawal]);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            {/* Header */}
            <Animated.View style={[styles.header, anim0]}>
                <NeonButton
                    title="←"
                    onPress={() => navigation.goBack()}
                    variant="secondary"
                    size="sm"
                    style={styles.backBtn}
                />
                <GlowText color={Colors.textPrimary} size="xl" weight="700" glow={0}>
                    In-Game Wallet
                </GlowText>
                <View style={styles.headerSpacer} />
            </Animated.View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Balance card */}
                <Animated.View style={anim1}>
                    <NeonCard style={styles.balanceCard}>
                        <GlowText color={Colors.textSecondary} size="sm" weight="600" glow={0} style={styles.cardLabel}>
                            AVAILABLE BALANCE
                        </GlowText>
                        <GlowText color={Colors.textPrimary} size="hero" weight="700" glow={1} align="center" style={styles.balanceSol}>
                            {balanceSol.toFixed(4)} SOL
                        </GlowText>
                        {loadingPrice ? (
                            <ActivityIndicator color={Colors.textMuted} size="small" style={{ marginTop: Spacing.xs }} />
                        ) : (
                            <GlowText color={Colors.textSecondary} size="lg" align="center" glow={0}>
                                {balanceUsd !== null ? `≈ $${balanceUsd.toFixed(2)} USD` : '—'}
                            </GlowText>
                        )}
                        {solPrice > 0 && (
                            <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={{ marginTop: Spacing.xs }}>
                                1 SOL = ${solPrice.toFixed(2)}
                            </GlowText>
                        )}
                    </NeonCard>
                </Animated.View>

                {/* Tabs */}
                <Animated.View style={[styles.tabRow, anim2]}>
                    <NeonButton
                        title="Top-Up / Withdraw"
                        onPress={() => setTab('balance')}
                        variant={tab === 'balance' ? 'primary' : 'secondary'}
                        size="sm"
                        style={styles.tabBtn}
                    />
                    <NeonButton
                        title={`History (${transactions.length})`}
                        onPress={() => setTab('history')}
                        variant={tab === 'history' ? 'primary' : 'secondary'}
                        size="sm"
                        style={styles.tabBtn}
                    />
                </Animated.View>

                {tab === 'balance' && (
                    <Animated.View style={anim3}>
                        {/* Top-Up */}
                        <NeonCard style={styles.section}>
                            <GlowText color={Colors.textSecondary} size="sm" weight="600" glow={0} style={styles.sectionLabel}>
                                TOP-UP
                            </GlowText>
                            <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.hint}>
                                Minimum ${MIN_TOPUP_USD} · Funds transfer from Phantom to game wallet
                            </GlowText>
                            <View style={styles.inputRow}>
                                <GlowText color={Colors.textSecondary} size="body" glow={0} style={styles.currencySign}>$</GlowText>
                                <TextInput
                                    style={styles.input}
                                    value={topUpInput}
                                    onChangeText={(t) => {
                                        setTopUpInput(t);
                                        const v = parseFloat(t);
                                        if (!isNaN(v)) setTopUpUsd(t);
                                    }}
                                    onBlur={() => {
                                        const v = parseFloat(topUpInput);
                                        if (!isNaN(v)) {
                                            setTopUpUsd(v.toString());
                                            setTopUpInput(v.toString());
                                        }
                                    }}
                                    keyboardType="decimal-pad"
                                    placeholder="10.00"
                                    placeholderTextColor={Colors.textMuted}
                                />
                            </View>
                            {solPrice > 0 && topUpUsd !== '' && !isNaN(parseFloat(topUpUsd)) && (
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    ≈ {usdToSol(parseFloat(topUpUsd), solPrice).toFixed(4)} SOL
                                </GlowText>
                            )}
                            {minTopUpSol !== null && (
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Min: {minTopUpSol.toFixed(4)} SOL
                                </GlowText>
                            )}
                            <NeonButton
                                title={loadingTopUp ? 'Opening Phantom…' : 'Top-Up Wallet'}
                                onPress={handleTopUp}
                                variant="primary"
                                size="md"
                                loading={loadingTopUp}
                                disabled={loadingTopUp || !connected}
                                style={styles.actionBtn}
                            />
                            {!connected && (
                                <GlowText color={Colors.danger} size="xs" align="center" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Connect Phantom to top up
                                </GlowText>
                            )}
                        </NeonCard>

                        {/* Withdraw */}
                        <NeonCard style={styles.section}>
                            <GlowText color={Colors.textSecondary} size="sm" weight="600" glow={0} style={styles.sectionLabel}>
                                WITHDRAW
                            </GlowText>
                            <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.hint}>
                                Minimum ${MIN_WITHDRAW_USD} · Sent to your connected Phantom wallet
                            </GlowText>
                            <View style={styles.inputRow}>
                                <GlowText color={Colors.textSecondary} size="body" glow={0} style={styles.currencySign}>$</GlowText>
                                <TextInput
                                    style={styles.input}
                                    value={withdrawInput}
                                    onChangeText={(t) => {
                                        setWithdrawInput(t);
                                        const v = parseFloat(t);
                                        if (!isNaN(v)) setWithdrawUsd(t);
                                    }}
                                    onBlur={() => {
                                        const v = parseFloat(withdrawInput);
                                        if (!isNaN(v)) {
                                            setWithdrawUsd(v.toString());
                                            setWithdrawInput(v.toString());
                                        }
                                    }}
                                    keyboardType="decimal-pad"
                                    placeholder="50.00"
                                    placeholderTextColor={Colors.textMuted}
                                />
                            </View>
                            {solPrice > 0 && withdrawUsd !== '' && !isNaN(parseFloat(withdrawUsd)) && (
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    ≈ {usdToSol(parseFloat(withdrawUsd), solPrice).toFixed(4)} SOL
                                </GlowText>
                            )}
                            {minWithdrawSol !== null && (
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Min: {minWithdrawSol.toFixed(4)} SOL · Available: {balanceSol.toFixed(4)} SOL
                                </GlowText>
                            )}
                            <NeonButton
                                title="Withdraw to Phantom"
                                onPress={handleWithdraw}
                                variant="secondary"
                                size="md"
                                disabled={!connected || balanceSol <= 0}
                                style={styles.actionBtn}
                            />
                            {!connected && (
                                <GlowText color={Colors.danger} size="xs" align="center" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Connect Phantom to withdraw
                                </GlowText>
                            )}
                        </NeonCard>
                    </Animated.View>
                )}

                {tab === 'history' && (
                    <Animated.View style={anim3}>
                        <NeonCard style={styles.section}>
                            {transactions.length === 0 ? (
                                <GlowText color={Colors.textMuted} size="body" align="center" glow={0} style={{ paddingVertical: Spacing.lg }}>
                                    No transactions yet
                                </GlowText>
                            ) : (
                                transactions.map((tx, i) => (
                                    <View key={tx.id}>
                                        <TxRow tx={tx} />
                                        {i < transactions.length - 1 && <View style={styles.divider} />}
                                    </View>
                                ))
                            )}
                        </NeonCard>
                    </Animated.View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
    },
    backBtn: { minWidth: 44 },
    headerSpacer: { width: 44 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    balanceCard: { alignItems: 'center', paddingVertical: Spacing.xl },
    cardLabel: { letterSpacing: 1.5, marginBottom: Spacing.sm },
    balanceSol: { marginBottom: Spacing.xs },
    tabRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: Spacing.xs },
    tabBtn: { flex: 1 },
    section: { marginTop: Spacing.md },
    sectionLabel: { letterSpacing: 1.5, marginBottom: Spacing.xs },
    hint: { marginBottom: Spacing.sm, lineHeight: 16 },
    inputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.xs },
    currencySign: { marginRight: Spacing.xs, paddingBottom: Spacing.xs },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        paddingVertical: Spacing.sm,
    },
    actionBtn: { marginTop: Spacing.md },
    divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: -Spacing.xs },
});
