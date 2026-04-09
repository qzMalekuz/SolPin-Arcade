import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Animated,
    Easing,
    Pressable,
    ActivityIndicator,
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import { Colors, Spacing, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useAppModal } from '../components/AppModal';
import { useWalletStore } from '../store/walletStore';
import { useInGameWalletStore } from '../store/inGameWalletStore';
import {
    buildConnectUrl,
    buildDisconnectUrl,
    clearPhantomSession,
    getPhantomErrorMessage,
    getPhantomSignatureFromUrl,
    hydratePhantomSession,
    openPhantomLink,
    parseConnectResponse,
    truncateAddress,
} from '../solana/phantom';
import { getSolanaNetworkLabel } from '../solana/connection';
import { useGameStore, type GameStatus } from '../store/gameStore';
import { useNetworkStore } from '../store/networkStore';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

const useFadeInDown = (delay = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

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

export const WalletScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { alert: showAlert } = useAppModal();
    const { duration, setStatus, setTimeRemaining, setTxSignature } = useGameStore();
    const { hydrate, hydrated, getBalanceSol, fetchSolPrice, solPrice } = useInGameWalletStore();
    const {
        hydrated: networkHydrated,
        hydrate: hydrateNetwork,
    } = useNetworkStore();
    const {
        publicKey,
        connected,
        balance,
        session,
        walletName,
        connectionStatus,
        lastError,
        beginConnection,
        restoreConnection,
        completeConnection,
        failConnection,
        beginDisconnect,
        refreshBalance,
        disconnect,
    } = useWalletStore();
    const [pendingAction, setPendingAction] = useState<'connect' | 'disconnect' | null>(null);
    const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const igwHighlight = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!hydrated) void hydrate();
        if (!networkHydrated) void hydrateNetwork();
        void fetchSolPrice();

        const priceInterval = setInterval(() => {
            void fetchSolPrice();
        }, 5000);

        return () => clearInterval(priceInterval);
    }, [fetchSolPrice, hydrate, hydrateNetwork, hydrated, networkHydrated]);

    const headerAnim = useFadeInDown(100);
    const cardAnim = useFadeInDown(250);
    const actionsAnim = useFadeInDown(400);
    const footerAnim = useFadeInDown(550);
    const isBusy = connectionStatus === 'connecting' || connectionStatus === 'disconnecting';

    const clearConnectTimeout = useCallback(() => {
        if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
        }
    }, []);

    const handlePhantomConnectRedirect = useCallback(async (url: string) => {
        const phantomError = getPhantomErrorMessage(
            url,
            'Could not connect to Phantom. Please try again.',
        );

        if (phantomError) {
            clearConnectTimeout();
            setPendingAction(null);
            failConnection(phantomError);
            showAlert('Connection Failed', phantomError);
            return;
        }

        const result = await parseConnectResponse(url);
        clearConnectTimeout();
        setPendingAction(null);

        if (!result) {
            const message = 'Could not verify the Phantom connection response.';
            failConnection(message);
            showAlert('Connection Failed', message);
            return;
        }

        completeConnection(result);
        setTimeout(() => {
            void refreshBalance();
        }, 700);
    }, [clearConnectTimeout, completeConnection, failConnection, refreshBalance]);

    useEffect(() => {
        if (!networkHydrated) {
            return;
        }

        hydratePhantomSession()
            .then((restoredSession) => {
                if (!restoredSession) {
                    disconnect();
                    return;
                }

                restoreConnection(restoredSession);
                setTimeout(() => {
                    void refreshBalance();
                }, 500);
            })
            .catch(() => {
                void clearPhantomSession();
            });
    }, [disconnect, networkHydrated, refreshBalance, restoreConnection]);

    useEffect(() => {
        const handleInitialUrl = async () => {
            await hydratePhantomSession();
            const initialUrl = await Linking.getInitialURL();
            if (!initialUrl) {
                return;
            }

            if (initialUrl.includes('onConnect')) {
                await handlePhantomConnectRedirect(initialUrl);
                return;
            }

            if (initialUrl.includes('onSignAndSend')) {
                const phantomError = getPhantomErrorMessage(
                    initialUrl,
                    'Phantom returned an invalid transaction response.',
                );

                if (phantomError) {
                    showAlert('Transaction Failed', phantomError);
                    return;
                }

                const signature = getPhantomSignatureFromUrl(initialUrl);
                if (!signature) {
                    showAlert('Transaction Failed', 'Could not verify the Phantom transaction signature.');
                    return;
                }

                setTxSignature(signature);
                setTimeRemaining(duration);
                setStatus('playing');
                navigation.replace('Game');
            }
        };

        void handleInitialUrl();

        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (url.includes('onConnect')) {
                void handlePhantomConnectRedirect(url);
                return;
            }

            if (url.includes('onSignAndSend')) {
                const phantomError = getPhantomErrorMessage(
                    url,
                    'Phantom returned an invalid transaction response.',
                );

                if (phantomError) {
                    showAlert('Transaction Failed', phantomError);
                    return;
                }

                const signature = getPhantomSignatureFromUrl(url);
                if (!signature) {
                    showAlert('Transaction Failed', 'Could not verify the Phantom transaction signature.');
                    return;
                }

                setTxSignature(signature);
                setTimeRemaining(duration);
                setStatus('playing');
                navigation.replace('Game');
                return;
            }

            if (url.includes('onDisconnect')) {
                clearConnectTimeout();
                setPendingAction(null);
                disconnect();
            }
        });

        return () => {
            clearConnectTimeout();
            subscription.remove();
        };
    }, [
        clearConnectTimeout,
        disconnect,
        duration,
        handlePhantomConnectRedirect,
        navigation,
        setStatus,
        setTimeRemaining,
        setTxSignature,
    ]);

    const handleConnect = useCallback(async () => {
        if (isBusy) {
            return;
        }

        beginConnection();
        setPendingAction('connect');

        try {
            const url = await buildConnectUrl();
            clearConnectTimeout();
            connectTimeoutRef.current = setTimeout(() => {
                setPendingAction(null);
                failConnection('Phantom did not return to the app in time. Please try again.');
                showAlert('Connection Timed Out', 'Phantom did not return to the app in time. Please try again.');
            }, 60000);
            await openPhantomLink(url);
        } catch (error: any) {
            clearConnectTimeout();
            setPendingAction(null);
            const message = error?.message || 'Could not open Phantom.';
            failConnection(message);
            showAlert('Connection Failed', message);
        }
    }, [beginConnection, clearConnectTimeout, failConnection, isBusy]);

    const MIN_STAKE = 0.001;

    const pulseIgwCard = useCallback(() => {
        igwHighlight.setValue(0);
        Animated.sequence([
            Animated.timing(igwHighlight, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(igwHighlight, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(igwHighlight, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(igwHighlight, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
    }, [igwHighlight]);

    const handlePlay = useCallback(() => {
        const igwBalance = getBalanceSol();
        if (igwBalance < MIN_STAKE) {
            const needed = (MIN_STAKE - igwBalance).toFixed(4);
            pulseIgwCard();
            showAlert(
                'Insufficient Balance',
                `You need at least ${MIN_STAKE} SOL in your in-game wallet to play.\n\nTop up ${needed} SOL to continue.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Top Up', onPress: () => navigation.navigate('InGameWallet') },
                ],
            );
            return;
        }
        navigation.navigate('Setup');
    }, [getBalanceSol, navigation, pulseIgwCard, showAlert]);

    const handleDisconnect = useCallback(async () => {
        if (!session || isBusy) {
            return;
        }

        beginDisconnect();
        setPendingAction('disconnect');

        try {
            const url = buildDisconnectUrl(session);
            await openPhantomLink(url);
        } catch {
            // Phantom may not return a callback for disconnect; clear local state anyway.
        } finally {
            setPendingAction(null);
            await clearPhantomSession();
            disconnect();
        }
    }, [beginDisconnect, disconnect, isBusy, session]);


    return (
        <View
            style={[
                styles.container,
                { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
            ]}
        >
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            {connected && (
                <Pressable
                    onPress={handleDisconnect}
                    disabled={isBusy}
                    style={[styles.disconnectBtn, { top: insets.top + Spacing.sm }]}
                >
                    {pendingAction === 'disconnect' ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <GlowText color="#ffffff" size="xs" weight="700" glow={0}>
                            Disconnect
                        </GlowText>
                    )}
                </Pressable>
            )}

            <View style={styles.spacer} />

            <Animated.View style={[styles.header, headerAnim]}>
                <Image
                    source={require('../../assets/splash-icon.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </Animated.View>

            {connected && publicKey && (
                <Animated.View style={cardAnim}>
                    <NeonCard style={styles.card}>
                        <GlowText color={Colors.success} size="sm" align="center" weight="600" glow={1}>
                            CONNECTED{walletName ? ` VIA ${walletName}` : ''}
                        </GlowText>
                        <GlowText color={Colors.textPrimary} size="lg" align="center" weight="600" glow={0} style={styles.address}>
                            {truncateAddress(publicKey.toBase58(), 6)}
                        </GlowText>
                        <View style={styles.balanceRow}>
                            <GlowText color={Colors.textSecondary} size="body" glow={0}>
                                Balance
                            </GlowText>
                            <GlowText color={Colors.textPrimary} size="lg" weight="700" glow={0}>
                                {`${balance.toFixed(4)} SOL`}
                            </GlowText>
                        </View>
                    </NeonCard>
                </Animated.View>
            )}

            {connected && (
                <Animated.View style={cardAnim}>
                    <Animated.View style={[styles.igwHighlightRing, { opacity: igwHighlight }]} pointerEvents="none" />
                    <NeonCard style={styles.igwCard}>
                        <View style={styles.igwRow}>
                            <View>
                                <GlowText color={Colors.textSecondary} size="xs" weight="600" glow={0} style={styles.igwLabel}>
                                    IN-GAME WALLET
                                </GlowText>
                                <GlowText color={Colors.textPrimary} size="xl" weight="700" glow={0}>
                                    {getBalanceSol().toFixed(4)} SOL
                                </GlowText>
                                {solPrice > 0 && (
                                    <>
                                        <GlowText color={Colors.textMuted} size="xs" glow={0}>
                                            ≈ ${(getBalanceSol() * solPrice).toFixed(2)} USD
                                        </GlowText>
                                        <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.solRate}>
                                            1 SOL = ${solPrice.toFixed(2)}
                                        </GlowText>
                                    </>
                                )}
                            </View>
                            <NeonButton
                                title="In-Game Wallet"
                                onPress={() => navigation.navigate('InGameWallet')}
                                variant="secondary"
                                size="sm"
                                disabled={isBusy}
                            />
                        </View>
                    </NeonCard>
                </Animated.View>
            )}

            {lastError && !connected ? (
                <GlowText color={Colors.danger} size="xs" align="center" glow={0} style={styles.errorText}>
                    {lastError}
                </GlowText>
            ) : null}

            <View style={styles.spacer} />

            <Animated.View style={[styles.actions, actionsAnim]}>
                {connected ? (
                    <>
                        <NeonButton
                            title="Play"
                            onPress={handlePlay}
                            variant="primary"
                            size="lg"
                            disabled={isBusy}
                        />
                        <NeonButton
                            title="Leaderboard"
                            onPress={() => navigation.navigate('Leaderboard')}
                            variant="secondary"
                            size="md"
                            disabled={isBusy}
                            style={styles.secondaryBtn}
                        />
                    </>
                ) : (
                    <>
                        <NeonButton
                            title={pendingAction === 'connect' ? 'Opening Phantom...' : 'Connect Wallet'}
                            onPress={handleConnect}
                            variant="primary"
                            size="lg"
                            loading={pendingAction === 'connect'}
                            disabled={isBusy}
                        />
                    </>
                )}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
        paddingHorizontal: Spacing.lg,
    },
    header: { marginBottom: Spacing.sm, alignItems: 'center', marginTop: Spacing.xl },
    logo: { width: 800, height: 400 },
    card: { marginBottom: Spacing.lg },
    address: { marginTop: Spacing.sm },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    errorText: { marginTop: Spacing.sm, lineHeight: 18 },
    spacer: { flex: 0.45 },
    actions: {},
    secondaryBtn: { marginTop: Spacing.md },
    disconnectLink: { marginTop: Spacing.md, paddingVertical: Spacing.sm, alignItems: 'center' },
    disconnectBtn: {
        position: 'absolute',
        right: Spacing.lg,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: 20,
        backgroundColor: '#7f0000',
        borderWidth: 1,
        borderColor: '#ff2222',
        shadowColor: '#ff0000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 6,
        zIndex: 100,
    },
    footer: { marginTop: Spacing.xl },
    igwCard: { marginBottom: Spacing.md, marginTop: Spacing.sm },
    igwRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    igwLabel: { letterSpacing: 1.5, marginBottom: 2 },
    solRate: { marginTop: 2 },
    igwHighlightRing: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: '#f87171',
        shadowColor: '#f87171',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 12,
        zIndex: 10,
    },
});
