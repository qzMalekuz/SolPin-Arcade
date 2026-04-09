import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    StatusBar,
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
import { useAppModal } from '../components/AppModal';
import { useInGameWalletStore, WalletTx } from '../store/inGameWalletStore';
import { useWalletStore } from '../store/walletStore';
import { getConnection } from '../solana/connection';
import { getSolPrice } from '../solana/price';
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

const FALLBACK_MIN_TOPUP_SOL = 0.1;
const FALLBACK_MIN_WITHDRAW_SOL = 0.5;

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
    const { alert: showAlert, show: showModal } = useAppModal();
    const {
        hydrate, hydrated, fetchSolPrice, solPrice,
        getBalanceSol, transactions, pendingTopUp,
        setPendingTopUp, clearPendingTopUp, topUp, requestWithdrawal,
    } = useInGameWalletStore();
    const { publicKey, session, connected } = useWalletStore();

    const [tab, setTab] = useState<'balance' | 'history'>('balance');
    const [topUpSol, setTopUpSol] = useState('');
    const [topUpInput, setTopUpInput] = useState('');
    const [withdrawSol, setWithdrawSol] = useState('');
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
    const minTopUpSol = FALLBACK_MIN_TOPUP_SOL;
    const minWithdrawSol = FALLBACK_MIN_WITHDRAW_SOL;

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
            showAlert('Top-Up Failed', phantomError);
            return;
        }

        const result = parseSignTransactionResponse(url);
        if (!result?.transaction) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            showAlert('Top-Up Failed', 'Could not verify the signed transaction from Phantom.');
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
                showAlert(
                    'Top-Up Successful',
                    `+${pending.amountSol.toFixed(4)} SOL ($${pending.amountUsd.toFixed(2)}) added to your in-game wallet.`,
                );
            }
        } catch (err: any) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            showAlert('Top-Up Failed', err?.message ?? 'Could not send the signed transaction to Solana.');
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
            showAlert('Wallet Required', 'Connect your Phantom wallet first.');
            return;
        }

        const solVal = parseFloat(topUpSol);
        const minSol = minTopUpSol;
        if (isNaN(solVal) || solVal < minSol) {
            showAlert('Minimum Top-Up', `Minimum top-up is ${minSol.toFixed(1)} SOL.`);
            return;
        }

        const amountSol = solVal;

        setLoadingTopUp(true);
        try {
            await hydratePhantomSession();
            if (!hasPhantomSession()) {
                setLoadingTopUp(false);
                showAlert('Reconnect Required', 'Your Phantom session expired. Reconnect your wallet.');
                navigation.navigate('Wallet');
                return;
            }

            const amountUsd = solPrice > 0 ? amountSol * solPrice : 0;
            const tx = await buildTopUpTransaction(publicKey, amountSol);
            const signUrl = buildSignTransactionUrl(tx, session, 'onTopUp');
            setPendingTopUp(amountSol, amountUsd);

            topUpTimeoutRef.current = setTimeout(() => {
                setLoadingTopUp(false);
                clearPendingTopUp();
                showAlert('Timeout', 'Phantom did not respond in time. Please try again.');
            }, 60000);

            await openPhantomLink(signUrl);
        } catch (err: any) {
            setLoadingTopUp(false);
            clearPendingTopUp();
            showAlert('Top-Up Failed', err?.message ?? 'Something went wrong.');
        }
    }, [
        connected, publicKey, session, topUpSol, solPrice, minTopUpSol,
        navigation, setPendingTopUp, clearPendingTopUp,
    ]);

    const handleWithdraw = useCallback(() => {
        if (!connected) {
            showAlert('Wallet Required', 'Connect your Phantom wallet to withdraw.');
            return;
        }

        const solVal = parseFloat(withdrawSol);
        const minSol = minWithdrawSol;
        if (isNaN(solVal) || solVal < minSol) {
            showAlert('Minimum Withdrawal', `Minimum withdrawal is ${minSol.toFixed(1)} SOL.`);
            return;
        }

        const amountSol = solVal;
        if (amountSol > balanceSol) {
            showAlert('Insufficient Balance', 'Your in-game wallet does not have enough SOL.');
            return;
        }

        const amountUsd = solPrice > 0 ? amountSol * solPrice : 0;
        showModal({
            title: 'Confirm Withdrawal',
            message: `Withdraw ${amountSol.toFixed(4)} SOL to your Phantom wallet?\n\nProcessing may take a few minutes.`,
            type: 'warning',
            buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Withdraw',
                    style: 'default',
                    onPress: () => {
                        const ok = requestWithdrawal(amountSol, amountUsd);
                        if (ok) {
                            setWithdrawSol('');
                            setWithdrawInput('');
                            showAlert('Withdrawal Queued', 'Your withdrawal has been queued and will be sent to your Phantom wallet shortly.');
                        } else {
                            showAlert('Failed', 'Could not process withdrawal. Check your balance.');
                        }
                    },
                },
            ],
        });
    }, [connected, withdrawSol, solPrice, minWithdrawSol, balanceSol, requestWithdrawal]);

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
                                Min {(minTopUpSol).toFixed(1)} SOL · Funds transfer from Phantom to game wallet
                            </GlowText>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={topUpInput}
                                    onChangeText={(t) => {
                                        setTopUpInput(t);
                                        const v = parseFloat(t);
                                        if (!isNaN(v)) setTopUpSol(t);
                                    }}
                                    onBlur={() => {
                                        const v = parseFloat(topUpInput);
                                        if (!isNaN(v)) {
                                            setTopUpSol(v.toString());
                                            setTopUpInput(v.toString());
                                        }
                                    }}
                                    keyboardType="decimal-pad"
                                    placeholder={(minTopUpSol).toFixed(1)}
                                    placeholderTextColor={Colors.textMuted}
                                />
                                <GlowText color={Colors.textSecondary} size="body" glow={0} style={styles.currencySign}>SOL</GlowText>
                            </View>
                            {solPrice > 0 && topUpSol !== '' && !isNaN(parseFloat(topUpSol)) && (
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    ≈ ${(parseFloat(topUpSol) * solPrice).toFixed(2)} USD
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
                                Min {(minWithdrawSol).toFixed(1)} SOL · Sent to your connected Phantom wallet
                            </GlowText>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={withdrawInput}
                                    onChangeText={(t) => {
                                        setWithdrawInput(t);
                                        const v = parseFloat(t);
                                        if (!isNaN(v)) setWithdrawSol(t);
                                    }}
                                    onBlur={() => {
                                        const v = parseFloat(withdrawInput);
                                        if (!isNaN(v)) {
                                            setWithdrawSol(v.toString());
                                            setWithdrawInput(v.toString());
                                        }
                                    }}
                                    keyboardType="decimal-pad"
                                    placeholder={(minWithdrawSol).toFixed(1)}
                                    placeholderTextColor={Colors.textMuted}
                                />
                                <GlowText color={Colors.textSecondary} size="body" glow={0} style={styles.currencySign}>SOL</GlowText>
                            </View>
                            {solPrice > 0 && withdrawSol !== '' && !isNaN(parseFloat(withdrawSol)) && (
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    ≈ ${(parseFloat(withdrawSol) * solPrice).toFixed(2)} USD
                                </GlowText>
                            )}
                            {(
                                <GlowText color={Colors.textMuted} size="xs" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Available: {balanceSol.toFixed(4)} SOL
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
    currencySign: { marginLeft: Spacing.xs, paddingBottom: Spacing.xs },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        paddingVertical: Spacing.sm,
    },
    actionBtn: { marginTop: Spacing.lg },
    divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: -Spacing.xs },
});
