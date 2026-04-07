import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Alert,
    Animated,
    Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import { Colors, Spacing, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
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
import { useNetworkStore, type SupportedSolanaCluster } from '../store/networkStore';
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
    const { duration, setStatus, setTimeRemaining, setTxSignature, setTutorialMode } = useGameStore();
    const { hydrate, hydrated, getBalanceSol, fetchSolPrice, solPrice } = useInGameWalletStore();
    const {
        cluster,
        hydrated: networkHydrated,
        hydrate: hydrateNetwork,
        setCluster,
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

    useEffect(() => {
        if (!hydrated) void hydrate();
        if (!networkHydrated) void hydrateNetwork();
        void fetchSolPrice();
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
            Alert.alert('Connection Failed', phantomError);
            return;
        }

        const result = await parseConnectResponse(url);
        clearConnectTimeout();
        setPendingAction(null);

        if (!result) {
            const message = 'Could not verify the Phantom connection response.';
            failConnection(message);
            Alert.alert('Connection Failed', message);
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
    }, [cluster, disconnect, networkHydrated, refreshBalance, restoreConnection]);

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
                    Alert.alert('Transaction Failed', phantomError);
                    return;
                }

                const signature = getPhantomSignatureFromUrl(initialUrl);
                if (!signature) {
                    Alert.alert('Transaction Failed', 'Could not verify the Phantom transaction signature.');
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
                    Alert.alert('Transaction Failed', phantomError);
                    return;
                }

                const signature = getPhantomSignatureFromUrl(url);
                if (!signature) {
                    Alert.alert('Transaction Failed', 'Could not verify the Phantom transaction signature.');
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
                Alert.alert('Connection Timed Out', 'Phantom did not return to the app in time. Please try again.');
            }, 60000);
            await openPhantomLink(url);
        } catch (error: any) {
            clearConnectTimeout();
            setPendingAction(null);
            const message = error?.message || 'Could not open Phantom.';
            failConnection(message);
            Alert.alert('Connection Failed', message);
        }
    }, [beginConnection, clearConnectTimeout, failConnection, isBusy]);

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

    const handleTutorial = useCallback(() => {
        setTutorialMode(true);
        setTimeRemaining(60);
        setStatus('playing');
        navigation.navigate('Game');
    }, [navigation, setStatus, setTimeRemaining, setTutorialMode]);

    const handleClusterChange = useCallback(async (nextCluster: SupportedSolanaCluster) => {
        if (nextCluster === cluster || isBusy) {
            return;
        }

        clearConnectTimeout();
        setPendingAction(null);

        if (connected) {
            await clearPhantomSession();
            disconnect();
        }

        await setCluster(nextCluster);
    }, [clearConnectTimeout, cluster, connected, disconnect, isBusy, setCluster]);

    return (
        <View
            style={[
                styles.container,
                { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
            ]}
        >
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <Animated.View style={[styles.header, headerAnim]}>
                <GlowText color={Colors.textPrimary} size="hero" align="center" weight="700" glow={1}>
                    SolPin
                </GlowText>
                <GlowText color={Colors.textSecondary} size="xl" align="center" weight="600" glow={0} style={styles.subtitle}>
                    ARCADE
                </GlowText>
            </Animated.View>

            <Animated.View style={cardAnim}>
                <NeonCard style={styles.card}>
                    {connected && publicKey ? (
                        <>
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
                            <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.networkBadge}>
                                {getSolanaNetworkLabel()}
                            </GlowText>
                        </>
                    ) : (
                        <>
                            <GlowText color={Colors.textSecondary} size="body" align="center" glow={0}>
                                Connect Phantom on Solana {cluster === 'devnet' ? 'devnet' : 'mainnet'} to play.
                            </GlowText>
                            <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.networkBadge}>
                                Network: {getSolanaNetworkLabel()}
                            </GlowText>
                            {lastError ? (
                                <GlowText color={Colors.danger} size="xs" align="center" glow={0} style={styles.errorText}>
                                    {lastError}
                                </GlowText>
                            ) : null}
                        </>
                    )}
                </NeonCard>
            </Animated.View>

            <Animated.View style={cardAnim}>
                <NeonCard style={styles.networkCard}>
                    <GlowText color={Colors.textSecondary} size="xs" weight="600" glow={0} style={styles.networkTitle}>
                        TRANSACTION NETWORK
                    </GlowText>
                    <View style={styles.networkToggleRow}>
                        {(['devnet', 'mainnet-beta'] as const).map((option) => {
                            const selected = cluster === option;
                            return (
                                <NeonButton
                                    key={option}
                                    title={option === 'devnet' ? 'Devnet' : 'Mainnet'}
                                    onPress={() => void handleClusterChange(option)}
                                    variant={selected ? 'primary' : 'secondary'}
                                    size="sm"
                                    disabled={isBusy}
                                    style={styles.networkToggleBtn}
                                />
                            );
                        })}
                    </View>
                    <GlowText color={Colors.textMuted} size="xs" align="center" glow={0}>
                        Devnet is recommended for transaction testing. Changing network clears the current Phantom session.
                    </GlowText>
                </NeonCard>
            </Animated.View>

            {connected && (
                <Animated.View style={cardAnim}>
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
                                    <GlowText color={Colors.textMuted} size="xs" glow={0}>
                                        ≈ ${(getBalanceSol() * solPrice).toFixed(2)} USD
                                    </GlowText>
                                )}
                            </View>
                            <NeonButton
                                title="Manage"
                                onPress={() => navigation.navigate('InGameWallet')}
                                variant="secondary"
                                size="sm"
                                disabled={isBusy}
                            />
                        </View>
                    </NeonCard>
                </Animated.View>
            )}

            <Animated.View style={[styles.actions, actionsAnim]}>
                {connected ? (
                    <>
                        <NeonButton
                            title="Play"
                            onPress={() => navigation.navigate('Setup')}
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
                        />
                        <NeonButton
                            title={pendingAction === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
                            onPress={handleDisconnect}
                            variant="danger"
                            size="sm"
                            loading={pendingAction === 'disconnect'}
                            disabled={isBusy}
                        />
                    </>
                ) : (
                    <NeonButton
                        title={pendingAction === 'connect' ? 'Opening Phantom...' : 'Connect Wallet'}
                        onPress={handleConnect}
                        variant="primary"
                        size="lg"
                        loading={pendingAction === 'connect'}
                        disabled={isBusy}
                    />
                )}
                {!connected && (
                    <NeonButton
                        title="Tutorial Mode"
                        onPress={handleTutorial}
                        variant="secondary"
                        size="sm"
                        style={styles.tutorialBtn}
                    />
                )}
            </Animated.View>

            <Animated.View style={footerAnim}>
                <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.footer}>
                    Skill-based arcade staking • {getSolanaNetworkLabel()} • Phantom Mobile
                </GlowText>
            </Animated.View>
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
    header: { marginBottom: Spacing.xl },
    subtitle: { marginTop: -2, letterSpacing: 8 },
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
    networkBadge: { marginTop: Spacing.sm, letterSpacing: 1 },
    networkCard: { marginBottom: Spacing.md, gap: Spacing.sm },
    networkTitle: { textAlign: 'center', letterSpacing: 1.2 },
    networkToggleRow: { flexDirection: 'row', gap: Spacing.sm },
    networkToggleBtn: { flex: 1 },
    errorText: { marginTop: Spacing.md, lineHeight: 18 },
    actions: { gap: Spacing.sm + 4 },
    tutorialBtn: { marginTop: Spacing.xs },
    footer: { marginTop: Spacing.xl },
    igwCard: { marginBottom: Spacing.md, marginTop: Spacing.sm },
    igwRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    igwLabel: { letterSpacing: 1.5, marginBottom: 2 },
});
