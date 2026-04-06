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
import { useGameStore } from '../store/gameStore';
import {
    buildConnectUrl,
    parseConnectResponse,
    buildDisconnectUrl,
    getPhantomErrorMessage,
    getPhantomSignatureFromUrl,
    openPhantomLink,
    truncateAddress,
    clearPhantomSession,
} from '../solana/phantom';
import {
    isMWAAvailable,
    mwaAuthorize,
    mwaReauthorize,
    mwaDeauthorize,
} from '../solana/mwa';
import { getSolanaNetworkLabel } from '../solana/connection';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

const useFadeInDown = (delay: number = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: Animations.smooth, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, tension: 200, friction: 18, useNativeDriver: true }),
            ]).start();
        }, delay);
        return () => clearTimeout(timer);
    }, []);

    return { opacity, transform: [{ translateY }] };
};

export const WalletScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { duration, setStatus, setTimeRemaining, setTxSignature } = useGameStore();
    const {
        publicKey,
        connected,
        balance,
        session,
        authToken,
        walletName,
        network,
        connectionStatus,
        lastError,
        beginConnection,
        completeConnection,
        failConnection,
        beginDisconnect,
        setAuthToken,
        refreshBalance,
        disconnect,
    } = useWalletStore();
    const phantomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [pendingConnector, setPendingConnector] = useState<'mwa' | 'phantom' | null>(null);

    const headerAnim = useFadeInDown(100);
    const cardAnim = useFadeInDown(250);
    const actionsAnim = useFadeInDown(400);
    const footerAnim = useFadeInDown(550);
    const networkLabel = getSolanaNetworkLabel(network);
    const isBusy = connectionStatus === 'connecting' || connectionStatus === 'disconnecting';

    const clearPendingPhantomTimeout = useCallback(() => {
        if (phantomTimeoutRef.current) {
            clearTimeout(phantomTimeoutRef.current);
            phantomTimeoutRef.current = null;
        }
    }, []);

    // ------------------------------------------------------------------
    // Auto-reauthorize via MWA on mount (if auth token exists)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (isMWAAvailable() && authToken && !connected) {
            beginConnection();
            setPendingConnector('mwa');
            mwaReauthorize(authToken)
                .then((result) => {
                    setPendingConnector(null);
                    completeConnection({
                        publicKey: result.publicKey,
                        authToken: result.authToken,
                        walletName: result.walletName,
                        session: 'mwa',
                        walletProvider: 'mwa',
                    });
                    setTimeout(() => refreshBalance(), 1000);
                })
                .catch((error: Error) => {
                    setPendingConnector(null);
                    failConnection(error.message);
                    setAuthToken(null);
                });
        }
    }, [authToken, beginConnection, completeConnection, connected, failConnection, refreshBalance, setAuthToken]);

    const handleConnectRedirect = useCallback(
        (url: string) => {
            clearPendingPhantomTimeout();
            const phantomError = getPhantomErrorMessage(
                url,
                'Could not connect to Phantom wallet. Please try again.',
            );

            if (phantomError) {
                setPendingConnector(null);
                failConnection(phantomError);
                Alert.alert('Connection Failed', phantomError);
                return;
            }

            const result = parseConnectResponse(url);
            if (result) {
                setPendingConnector(null);
                completeConnection({
                    publicKey: result.publicKey,
                    session: result.session,
                    walletName: 'Phantom',
                    walletProvider: 'phantom',
                });
                setTimeout(() => refreshBalance(), 1500);
            } else {
                const message = 'Could not verify the wallet address returned by Phantom.';
                setPendingConnector(null);
                failConnection(message);
                Alert.alert('Connection Failed', message);
            }
        },
        [clearPendingPhantomTimeout, completeConnection, failConnection, refreshBalance],
    );

    // ------------------------------------------------------------------
    // Phantom deep-link callback handler (fallback)
    // ------------------------------------------------------------------
    useEffect(() => {
        const handleInitialUrl = async () => {
            const initialUrl = await Linking.getInitialURL();
            if (!initialUrl) {
                return;
            }

            if (initialUrl.includes('onConnect')) {
                handleConnectRedirect(initialUrl);
                return;
            }

            if (initialUrl.includes('onSignAndSend')) {
                const phantomError = getPhantomErrorMessage(
                    initialUrl,
                    'The wallet returned an invalid transaction response.',
                );

                if (phantomError) {
                    Alert.alert('Transaction Failed', phantomError);
                    return;
                }

                const signature = getPhantomSignatureFromUrl(initialUrl);
                if (!signature) {
                    Alert.alert(
                        'Transaction Failed',
                        'Could not verify the wallet signature. Please reconnect and try again.',
                    );
                    return;
                }

                setTxSignature(signature);
                setTimeRemaining(duration);
                setStatus('playing');
                navigation.replace('Game');
            }
        };
        handleInitialUrl();

        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (url.includes('onConnect')) {
                handleConnectRedirect(url);
            } else if (url.includes('onSignAndSend')) {
                const phantomError = getPhantomErrorMessage(
                    url,
                    'The wallet returned an invalid transaction response.',
                );

                if (phantomError) {
                    Alert.alert('Transaction Failed', phantomError);
                    return;
                }

                const signature = getPhantomSignatureFromUrl(url);
                if (!signature) {
                    Alert.alert(
                        'Transaction Failed',
                        'Could not verify the wallet signature. Please reconnect and try again.',
                    );
                    return;
                }

                setTxSignature(signature);
                setTimeRemaining(duration);
                setStatus('playing');
                navigation.replace('Game');
            } else if (url.includes('onDisconnect')) {
                clearPendingPhantomTimeout();
                setPendingConnector(null);
                clearPhantomSession();
                disconnect();
            }
        });

        return () => {
            clearPendingPhantomTimeout();
            subscription.remove();
        };
    }, [clearPendingPhantomTimeout, disconnect, duration, handleConnectRedirect, navigation, setStatus, setTimeRemaining, setTxSignature]);

    // ------------------------------------------------------------------
    // MWA Connect (primary on Android)
    // ------------------------------------------------------------------
    const handleMWAConnect = useCallback(async () => {
        if (isBusy) return;

        beginConnection();
        setPendingConnector('mwa');
        try {
            const result = await mwaAuthorize();
            setPendingConnector(null);
            completeConnection({
                publicKey: result.publicKey,
                authToken: result.authToken,
                walletName: result.walletName,
                session: 'mwa',
                walletProvider: 'mwa',
            });
            setTimeout(() => refreshBalance(), 1000);
        } catch (err: any) {
            setPendingConnector(null);
            failConnection(err.message || 'Could not connect via Mobile Wallet Adapter.');
            Alert.alert(
                'MWA Connection Failed',
                err.message || 'Could not connect via Mobile Wallet Adapter.',
            );
        }
    }, [beginConnection, completeConnection, failConnection, isBusy, refreshBalance]);

    // ------------------------------------------------------------------
    // Phantom deep-link connect (fallback / iOS)
    // ------------------------------------------------------------------
    const handlePhantomConnect = useCallback(async () => {
        if (isBusy) return;

        beginConnection();
        setPendingConnector('phantom');
        try {
            const url = buildConnectUrl();
            clearPendingPhantomTimeout();
            phantomTimeoutRef.current = setTimeout(() => {
                const message = 'Phantom did not return to the app in time. Please try again.';
                setPendingConnector(null);
                failConnection(message);
                Alert.alert('Connection Timed Out', message);
            }, 45000);
            await openPhantomLink(url);
        } catch (err: any) {
            clearPendingPhantomTimeout();
            setPendingConnector(null);
            const message = err.message || 'Failed to open Phantom.';
            failConnection(message);
            Alert.alert('Connection Failed', message);
        }
    }, [beginConnection, clearPendingPhantomTimeout, failConnection, isBusy]);

    // ------------------------------------------------------------------
    // Disconnect
    // ------------------------------------------------------------------
    const handleDisconnect = useCallback(async () => {
        if (isBusy) return;

        beginDisconnect();
        if (authToken && session === 'mwa') {
            try {
                await mwaDeauthorize(authToken);
            } catch (error: any) {
                setPendingConnector(null);
                failConnection(error.message || 'Wallet disconnection could not be completed.');
                Alert.alert('Disconnect Failed', error.message || 'Wallet disconnection could not be completed.');
                return;
            }
        }

        if (session && session !== 'mwa') {
            try {
                const url = buildDisconnectUrl(session);
                await openPhantomLink(url);
            } catch {
                // Phantom handles disconnect in-app; local state is still cleared below.
            }
        }

        setPendingConnector(null);
        clearPhantomSession();
        disconnect();
    }, [authToken, beginDisconnect, disconnect, failConnection, isBusy, session]);

    const showMWA = isMWAAvailable();

    return (
        <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
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
                                ● CONNECTED{walletName ? ` via ${walletName}` : ''}
                            </GlowText>
                            <GlowText color={Colors.textPrimary} size="lg" align="center" weight="600" glow={0} style={styles.address}>
                                {truncateAddress(publicKey.toBase58(), 6)}
                            </GlowText>
                            <View style={styles.balanceRow}>
                                <GlowText color={Colors.textSecondary} size="body" glow={0}>Balance</GlowText>
                                <GlowText color={Colors.textPrimary} size="lg" weight="700" glow={0}>{`${balance.toFixed(4)} SOL`}</GlowText>
                            </View>
                            {session === 'mwa' && (
                                <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.mwaBadge}>
                                    MWA 2.0 • Solana Mobile Stack
                                </GlowText>
                            )}
                            <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.networkBadge}>
                                {networkLabel}
                            </GlowText>
                        </>
                    ) : (
                        <>
                            <GlowText color={Colors.textSecondary} size="body" align="center" glow={0}>
                                Connect your Solana wallet to play
                            </GlowText>
                            <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.networkBadge}>
                                Active network: {networkLabel}
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

            <Animated.View style={[styles.actions, actionsAnim]}>
                {connected ? (
                    <>
                        <NeonButton title="Play" onPress={() => navigation.navigate('Setup')} variant="primary" size="lg" disabled={isBusy} />
                        <NeonButton title="Leaderboard" onPress={() => navigation.navigate('Leaderboard')} variant="secondary" size="md" disabled={isBusy} />
                        <NeonButton title={connectionStatus === 'disconnecting' ? 'Disconnecting...' : 'Disconnect'} onPress={handleDisconnect} variant="danger" size="sm" loading={connectionStatus === 'disconnecting'} disabled={isBusy} />
                    </>
                ) : (
                    <>
                        {showMWA && (
                            <NeonButton title={pendingConnector === 'mwa' ? 'Connecting...' : 'Connect Wallet (MWA)'} onPress={handleMWAConnect} variant="primary" size="lg" loading={pendingConnector === 'mwa'} disabled={isBusy} />
                        )}
                        <NeonButton
                            title={pendingConnector === 'phantom' ? 'Connecting...' : showMWA ? 'Connect via Deep Link' : 'Connect Phantom'}
                            onPress={handlePhantomConnect}
                            variant={showMWA ? 'secondary' : 'primary'}
                            size={showMWA ? 'md' : 'lg'}
                            loading={pendingConnector === 'phantom'}
                            disabled={isBusy}
                        />
                    </>
                )}
            </Animated.View>

            <Animated.View style={footerAnim}>
                <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.footer}>
                    Skill-based arcade staking • {networkLabel} • MWA 2.0
                </GlowText>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
    header: { marginBottom: Spacing.xl },
    subtitle: { marginTop: -2, letterSpacing: 8 },
    card: { marginBottom: Spacing.lg },
    address: { marginTop: Spacing.sm },
    balanceRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
    },
    mwaBadge: { marginTop: Spacing.sm, letterSpacing: 1 },
    networkBadge: { marginTop: Spacing.sm, letterSpacing: 1 },
    errorText: { marginTop: Spacing.md, lineHeight: 18 },
    actions: { gap: Spacing.sm + 4 },
    footer: { marginTop: Spacing.xl },
});
