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
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { useInGameWalletStore, WalletTx } from '../store/inGameWalletStore';
import { useWalletStore } from '../store/walletStore';
import { getSolPrice } from '../solana/price';
import {
    buildTopUpTransaction,
    sendSignedTransaction,
    verifyTopUpTransaction,
} from '../solana/transactions';
import { signTransactionWithMWA } from '../solana/mwa';
import { ensureAuthed } from '../api/backend';
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
// Matches the server default (MIN_WITHDRAWAL_LAMPORTS = 0.1 SOL) — a higher
// client value blocks withdrawals the server would accept.
const FALLBACK_MIN_WITHDRAW_SOL = 0.1;

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
        getBalanceSol, transactions, creditTopUp,
        requestWithdrawal, refreshIfAuthed,
    } = useInGameWalletStore();
    const { publicKey, session, connected, provider } = useWalletStore();

    const [tab, setTab] = useState<'balance' | 'history'>('balance');
    const [topUpSol, setTopUpSol] = useState('');
    const [topUpInput, setTopUpInput] = useState('');
    const [withdrawSol, setWithdrawSol] = useState('');
    const [withdrawInput, setWithdrawInput] = useState('');
    const [loadingTopUp, setLoadingTopUp] = useState(false);
    const [loadingWithdraw, setLoadingWithdraw] = useState(false);
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
        void refreshIfAuthed();
        setLoadingPrice(true);
        void fetchSolPrice().finally(() => setLoadingPrice(false));
    }, []);

    // Shared final step for both wallet flows: verify what was actually
    // signed, submit it on-chain, then have the server verify the same
    // transaction from the chain and credit the ledger. If the server is
    // unreachable the credit is queued and retried — never lost.
    const submitVerifiedTopUp = useCallback(async (
        signedTransaction: Transaction,
        payer: PublicKey,
    ): Promise<void> => {
        const lamports = verifyTopUpTransaction(signedTransaction, payer);
        const amountSol = lamports / LAMPORTS_PER_SOL;
        const signature = await sendSignedTransaction(signedTransaction);

        // Past this point the transfer is on the network: errors must say what
        // actually happened to the money, not a generic "failed".
        let outcome: 'credited' | 'duplicate' | 'queued';
        try {
            outcome = await creditTopUp(signature);
        } catch (err: any) {
            if (err?.code === 'tx_failed') {
                showAlert('Top-Up Failed', 'The transfer failed on-chain. No SOL was taken from your wallet (a small network fee may apply).');
            } else {
                showAlert(
                    'Top-Up Needs Attention',
                    `Your transfer was sent but could not be credited automatically.\n\nTX: ${signature.slice(0, 20)}...\n\nContact support with this transaction ID.`,
                );
            }
            return;
        }
        if (outcome === 'queued') {
            showAlert(
                'Top-Up Received',
                `Your ${amountSol.toFixed(4)} SOL payment was sent. Crediting is taking a little longer — it will complete automatically.`,
            );
        } else if (outcome === 'credited') {
            showAlert(
                'Top-Up Successful',
                `+${amountSol.toFixed(4)} SOL added to your in-game wallet.`,
            );
        }
    }, [creditTopUp]);

    // Deep-link handler: Phantom returns here after signing top-up tx
    const handleTopUpRedirect = useCallback(async (url: string) => {
        if (!url.includes('onTopUp')) return;

        clearTimeout(topUpTimeoutRef.current ?? undefined);

        // Cold start: the redirect can arrive before the Phantom session and
        // wallet store are hydrated — restore both before parsing the response.
        const restoredSession = await hydratePhantomSession();
        if (restoredSession && !useWalletStore.getState().publicKey) {
            useWalletStore.getState().restoreConnection({ ...restoredSession, provider: 'phantom' });
        }
        if (!useInGameWalletStore.getState().hydrated) {
            await useInGameWalletStore.getState().hydrate();
        }

        const phantomError = getPhantomErrorMessage(url, 'Top-up transaction failed.');
        if (phantomError) {
            setLoadingTopUp(false);
            showAlert('Top-Up Failed', phantomError);
            return;
        }

        const result = parseSignTransactionResponse(url);
        if (!result?.transaction) {
            setLoadingTopUp(false);
            showAlert('Top-Up Failed', 'Could not verify the signed transaction from Phantom.');
            return;
        }

        // The signed tx itself is verified against the payer below, so a
        // top-up signed before the app was killed and restarted still goes
        // through — no in-memory bookkeeping is required.
        const payer = useWalletStore.getState().publicKey;
        if (!payer) {
            setLoadingTopUp(false);
            showAlert(
                'Top-Up Interrupted',
                'Your wallet session could not be restored, so the signed transaction was not sent. No SOL left your wallet — reconnect and try again.',
            );
            return;
        }

        try {
            await submitVerifiedTopUp(result.transaction, payer);
            setLoadingTopUp(false);
        } catch (err: any) {
            setLoadingTopUp(false);
            showAlert('Top-Up Failed', err?.message ?? 'Could not send the signed transaction to Solana.');
        }
    }, [submitVerifiedTopUp]);

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
            showAlert('Wallet Required', 'Connect your wallet first.');
            return;
        }

        const solVal = parseFloat(topUpSol);
        const minSol = minTopUpSol;
        if (!Number.isFinite(solVal) || solVal < minSol) {
            showAlert('Minimum Top-Up', `Minimum top-up is ${minSol.toFixed(1)} SOL.`);
            return;
        }

        const amountSol = solVal;
        setLoadingTopUp(true);

        // Mobile Wallet Adapter (Seeker Seed Vault, Phantom/Solflare on Android):
        // sign in-process, no deeplink round-trip needed.
        if (provider === 'mwa') {
            try {
                const tx = await buildTopUpTransaction(publicKey, amountSol);
                const { signedTransaction, publicKey: signer } = await signTransactionWithMWA(tx);
                if (!signer.equals(publicKey)) {
                    throw new Error('The wallet returned a different account than the one connected. Reconnect your wallet and try again.');
                }
                await submitVerifiedTopUp(signedTransaction, publicKey);
            } catch (err: any) {
                showAlert('Top-Up Failed', err?.message ?? 'The wallet could not sign the transaction.');
            } finally {
                setLoadingTopUp(false);
            }
            return;
        }

        // Phantom deeplink flow (iOS)
        try {
            await hydratePhantomSession();
            if (!hasPhantomSession()) {
                setLoadingTopUp(false);
                showAlert('Reconnect Required', 'Your Phantom session expired. Reconnect your wallet.');
                navigation.navigate('Wallet');
                return;
            }

            const tx = await buildTopUpTransaction(publicKey, amountSol);
            const signUrl = buildSignTransactionUrl(tx, session, 'onTopUp');

            // Spinner reset only — deliberately does NOT invalidate the
            // round-trip: timers pause while backgrounded and fire on resume,
            // sometimes before the redirect arrives. A signed tx returning
            // after this must still be broadcast.
            topUpTimeoutRef.current = setTimeout(() => {
                setLoadingTopUp(false);
                showAlert(
                    'Still Waiting for Phantom',
                    'If you approved the transaction, it will be processed when you return to the app. Otherwise, try again.',
                );
            }, 120000);

            await openPhantomLink(signUrl);
        } catch (err: any) {
            setLoadingTopUp(false);
            showAlert('Top-Up Failed', err?.message ?? 'Something went wrong.');
        }
    }, [
        connected, publicKey, session, provider, topUpSol, minTopUpSol,
        navigation, submitVerifiedTopUp,
    ]);

    const handleWithdraw = useCallback(() => {
        if (!connected) {
            showAlert('Wallet Required', 'Connect your wallet to withdraw.');
            return;
        }

        const solVal = parseFloat(withdrawSol);
        const minSol = minWithdrawSol;
        if (!Number.isFinite(solVal) || solVal < minSol) {
            showAlert('Minimum Withdrawal', `Minimum withdrawal is ${minSol.toFixed(1)} SOL.`);
            return;
        }

        const amountSol = solVal;
        if (amountSol > balanceSol) {
            showAlert('Insufficient Balance', 'Your in-game wallet does not have enough SOL.');
            return;
        }

        showModal({
            title: 'Confirm Withdrawal',
            message: `Withdraw ${amountSol.toFixed(4)} SOL to your connected wallet?\n\nThe SOL is sent on-chain immediately.`,
            type: 'warning',
            buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Withdraw',
                    style: 'default',
                    onPress: () => {
                        void (async () => {
                            setLoadingWithdraw(true);
                            try {
                                // May prompt the wallet for a (free) ownership signature
                                await ensureAuthed();
                                const result = await requestWithdrawal(amountSol);
                                setWithdrawSol('');
                                setWithdrawInput('');
                                if (result.status === 'sent') {
                                    showAlert(
                                        'Withdrawal Sent',
                                        `${amountSol.toFixed(4)} SOL is on its way to your wallet.\n\nTX: ${result.signature?.slice(0, 20)}...`,
                                    );
                                } else {
                                    showAlert(
                                        'Withdrawal Processing',
                                        'The transfer was submitted. If it cannot complete on-chain, your balance is refunded automatically.',
                                    );
                                }
                            } catch (err: any) {
                                showAlert('Withdrawal Failed', err?.message ?? 'Could not process the withdrawal.');
                            } finally {
                                setLoadingWithdraw(false);
                            }
                        })();
                    },
                },
            ],
        });
    }, [connected, withdrawSol, minWithdrawSol, balanceSol, requestWithdrawal]);

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
                                title={loadingTopUp ? (provider === 'mwa' ? 'Confirm in wallet…' : 'Opening Phantom…') : 'Top-Up Wallet'}
                                onPress={handleTopUp}
                                variant="primary"
                                size="md"
                                loading={loadingTopUp}
                                disabled={loadingTopUp || !connected}
                                style={styles.actionBtn}
                            />
                            {!connected && (
                                <GlowText color={Colors.danger} size="xs" align="center" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Connect a wallet to top up
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
                                title={loadingWithdraw ? 'Sending…' : 'Withdraw to Wallet'}
                                onPress={handleWithdraw}
                                variant="secondary"
                                size="md"
                                loading={loadingWithdraw}
                                disabled={!connected || balanceSol <= 0 || loadingWithdraw}
                                style={styles.actionBtn}
                            />
                            {!connected && (
                                <GlowText color={Colors.danger} size="xs" align="center" glow={0} style={{ marginTop: Spacing.xs }}>
                                    Connect a wallet to withdraw
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
