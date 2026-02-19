import React, { useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

import { Colors, Spacing } from '../theme';
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
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

export const WalletScreen: React.FC<Props> = ({ navigation }) => {
    const {
        publicKey,
        connected,
        balance,
        session,
        setPublicKey,
        setConnected,
        setBalance,
        setSession,
        refreshBalance,
        disconnect,
    } = useWalletStore();

    // Listen for Phantom connect redirect
    useEffect(() => {
        // Handle initial URL (app opened via deep link)
        const handleInitialUrl = async () => {
            const initialUrl = await Linking.getInitialURL();
            if (initialUrl && initialUrl.includes('onConnect')) {
                handleConnectRedirect(initialUrl);
            }
        };
        handleInitialUrl();

        // Handle subsequent deep links
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
                Alert.alert(
                    'Connection Failed',
                    'Could not connect to Phantom wallet. Please try again.',
                );
            }
        },
        [setPublicKey, setSession, setConnected, refreshBalance],
    );

    const handleConnect = useCallback(async () => {
        try {
            const url = buildConnectUrl();
            console.log('[Phantom] Connect URL:', url);
            await openPhantomLink(url);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to open Phantom');
        }
    }, []);

    const handleDisconnect = useCallback(async () => {
        if (session) {
            try {
                const url = buildDisconnectUrl(session);
                await openPhantomLink(url);
            } catch { }
        }
        disconnect();
    }, [session, disconnect]);

    /**
     * Demo mode: generates a random keypair and simulates a connected wallet.
     * This lets you test the full game flow without needing Phantom.
     */
    const handleDemoConnect = useCallback(() => {
        const demoKeypair = Keypair.generate();
        setPublicKey(demoKeypair.publicKey);
        setSession('demo-session');
        setConnected(true);
        setBalance(5.0); // 5 SOL for demo
        Alert.alert(
            'Demo Mode',
            'Connected with a random demo wallet (5 SOL).\nThis is for testing the game only — no real transactions.',
        );
    }, [setPublicKey, setSession, setConnected, setBalance]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            {/* Title */}
            <GlowText
                color={Colors.neonPurple}
                size="hero"
                align="center"
                style={styles.title}
            >
                SolPin
            </GlowText>
            <GlowText
                color={Colors.neonBlue}
                size="xl"
                align="center"
                style={styles.subtitle}
            >
                ARCADE
            </GlowText>

            {/* Wallet Card */}
            <NeonCard
                glowColor={connected ? Colors.neonGreen : Colors.neonPurple}
                style={styles.card}
            >
                {connected && publicKey ? (
                    <>
                        <GlowText color={Colors.neonGreen} size="sm" align="center">
                            ● CONNECTED
                        </GlowText>
                        <GlowText
                            color={Colors.textPrimary}
                            size="lg"
                            align="center"
                            style={styles.address}
                        >
                            {truncateAddress(publicKey.toBase58(), 6)}
                        </GlowText>
                        <View style={styles.balanceRow}>
                            <GlowText color={Colors.textSecondary} size="body">
                                Balance
                            </GlowText>
                            <GlowText color={Colors.neonYellow} size="lg">
                                {`${balance.toFixed(4)} SOL`}
                            </GlowText>
                        </View>
                    </>
                ) : (
                    <GlowText
                        color={Colors.textSecondary}
                        size="body"
                        align="center"
                    >
                        Connect your Phantom wallet to play
                    </GlowText>
                )}
            </NeonCard>

            {/* Actions */}
            <View style={styles.actions}>
                {connected ? (
                    <>
                        <NeonButton
                            title="Play"
                            onPress={() => navigation.navigate('Setup')}
                            variant="primary"
                            size="lg"
                        />
                        <NeonButton
                            title="Leaderboard"
                            onPress={() => navigation.navigate('Leaderboard')}
                            variant="secondary"
                            size="md"
                        />
                        <NeonButton
                            title="Disconnect"
                            onPress={handleDisconnect}
                            variant="danger"
                            size="sm"
                        />
                    </>
                ) : (
                    <>
                        <NeonButton
                            title="Connect Phantom"
                            onPress={handleConnect}
                            variant="secondary"
                            size="lg"
                        />
                        <NeonButton
                            title="Demo Mode (No Wallet)"
                            onPress={handleDemoConnect}
                            variant="primary"
                            size="md"
                            style={styles.demoBtn}
                        />
                    </>
                )}
            </View>

            {/* Footer */}
            <GlowText
                color={Colors.textMuted}
                size="xs"
                align="center"
                style={styles.footer}
            >
                Skill-based arcade staking • Devnet
            </GlowText>
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
    title: {
        marginBottom: -4,
    },
    subtitle: {
        marginBottom: Spacing.xl,
        letterSpacing: 8,
    },
    card: {
        marginBottom: Spacing.xl,
    },
    address: {
        marginTop: Spacing.sm,
        fontFamily: 'monospace',
    },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    actions: {
        gap: Spacing.md,
    },
    demoBtn: {
        marginTop: 0,
    },
    footer: {
        marginTop: Spacing.xxl,
    },
});
