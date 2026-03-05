import React, { useCallback, useEffect, useRef } from 'react';
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
import { Keypair } from '@solana/web3.js';

import { Colors, Spacing, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useWalletStore } from '../store/walletStore';
import {
    buildConnectUrl,
    parseConnectResponse,
    buildDisconnectUrl,
    openPhantomLink,
    truncateAddress,
} from '../solana/phantom';
import {
    isMWAAvailable,
    mwaAuthorize,
    mwaReauthorize,
    mwaDeauthorize,
} from '../solana/mwa';
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
    const {
        publicKey,
        connected,
        balance,
        session,
        authToken,
        walletName,
        setPublicKey,
        setConnected,
        setBalance,
        setSession,
        setAuthToken,
        setWalletName,
        refreshBalance,
        disconnect,
    } = useWalletStore();

    const headerAnim = useFadeInDown(100);
    const cardAnim = useFadeInDown(250);
    const actionsAnim = useFadeInDown(400);
    const footerAnim = useFadeInDown(550);

    // ------------------------------------------------------------------
    // Auto-reauthorize via MWA on mount (if auth token exists)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (isMWAAvailable() && authToken && !connected) {
            mwaReauthorize(authToken)
                .then((result) => {
                    setPublicKey(result.publicKey);
                    setAuthToken(result.authToken);
                    setWalletName(result.walletName);
                    setSession('mwa');
                    setConnected(true);
                    setTimeout(() => refreshBalance(), 1000);
                })
                .catch(() => {
                    // Auth token expired, clear it
                    setAuthToken(null);
                });
        }
    }, []);

    // ------------------------------------------------------------------
    // Phantom deep-link callback handler (fallback)
    // ------------------------------------------------------------------
    useEffect(() => {
        const handleInitialUrl = async () => {
            const initialUrl = await Linking.getInitialURL();
            if (initialUrl && initialUrl.includes('onConnect')) {
                handleConnectRedirect(initialUrl);
            }
        };
        handleInitialUrl();

        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (url.includes('onConnect')) {
                handleConnectRedirect(url);
            } else if (url.includes('onDisconnect')) {
                disconnect();
            }
        });

        return () => subscription.remove();
    }, []);

    const handleConnectRedirect = useCallback(
        (url: string) => {
            const result = parseConnectResponse(url);
            if (result) {
                setPublicKey(result.publicKey);
                setSession(result.session);
                setConnected(true);
                setTimeout(() => refreshBalance(), 1500);
            } else {
                Alert.alert('Connection Failed', 'Could not connect to Phantom wallet. Please try again.');
            }
        },
        [setPublicKey, setSession, setConnected, refreshBalance],
    );

    // ------------------------------------------------------------------
    // MWA Connect (primary on Android)
    // ------------------------------------------------------------------
    const handleMWAConnect = useCallback(async () => {
        try {
            const result = await mwaAuthorize();
            setPublicKey(result.publicKey);
            setAuthToken(result.authToken);
            setWalletName(result.walletName);
            setSession('mwa');
            setConnected(true);
            setTimeout(() => refreshBalance(), 1000);
        } catch (err: any) {
            Alert.alert(
                'MWA Connection Failed',
                err.message || 'Could not connect via Mobile Wallet Adapter. Try deep link instead.',
            );
        }
    }, [setPublicKey, setAuthToken, setWalletName, setSession, setConnected, refreshBalance]);

    // ------------------------------------------------------------------
    // Phantom deep-link connect (fallback / iOS)
    // ------------------------------------------------------------------
    const handlePhantomConnect = useCallback(async () => {
        try {
            const url = buildConnectUrl();
            await openPhantomLink(url);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to open Phantom');
        }
    }, []);

    // ------------------------------------------------------------------
    // Disconnect
    // ------------------------------------------------------------------
    const handleDisconnect = useCallback(async () => {
        if (authToken && session === 'mwa') {
            try { await mwaDeauthorize(authToken); } catch { }
        }
        if (session && session !== 'mwa' && session !== 'demo-session') {
            try {
                const url = buildDisconnectUrl(session);
                await openPhantomLink(url);
            } catch { }
        }
        disconnect();
    }, [session, authToken, disconnect]);

    // ------------------------------------------------------------------
    // Demo mode
    // ------------------------------------------------------------------
    const handleDemoConnect = useCallback(() => {
        const demoKeypair = Keypair.generate();
        setPublicKey(demoKeypair.publicKey);
        setSession('demo-session');
        setConnected(true);
        setBalance(5.0);
        Alert.alert('Demo Mode', 'Connected with a random demo wallet (5 SOL).\nThis is for testing the game only — no real transactions.');
    }, [setPublicKey, setSession, setConnected, setBalance]);

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
                        </>
                    ) : (
                        <GlowText color={Colors.textSecondary} size="body" align="center" glow={0}>
                            Connect your Solana wallet to play
                        </GlowText>
                    )}
                </NeonCard>
            </Animated.View>

            <Animated.View style={[styles.actions, actionsAnim]}>
                {connected ? (
                    <>
                        <NeonButton title="Play" onPress={() => navigation.navigate('Setup')} variant="primary" size="lg" />
                        <NeonButton title="Leaderboard" onPress={() => navigation.navigate('Leaderboard')} variant="secondary" size="md" />
                        <NeonButton title="Disconnect" onPress={handleDisconnect} variant="danger" size="sm" />
                    </>
                ) : (
                    <>
                        {showMWA && (
                            <NeonButton title="Connect Wallet (MWA)" onPress={handleMWAConnect} variant="primary" size="lg" />
                        )}
                        <NeonButton
                            title={showMWA ? 'Connect via Deep Link' : 'Connect Phantom'}
                            onPress={handlePhantomConnect}
                            variant={showMWA ? 'secondary' : 'primary'}
                            size={showMWA ? 'md' : 'lg'}
                        />
                        <NeonButton title="Demo Mode (No Wallet)" onPress={handleDemoConnect} variant="secondary" size="md" />
                    </>
                )}
            </Animated.View>

            <Animated.View style={footerAnim}>
                <GlowText color={Colors.textMuted} size="xs" align="center" glow={0} style={styles.footer}>
                    Skill-based arcade staking • Devnet • MWA 2.0
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
    actions: { gap: Spacing.sm + 4 },
    footer: { marginTop: Spacing.xl },
});
