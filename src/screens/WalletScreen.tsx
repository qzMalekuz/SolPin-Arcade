import React, { useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import { Colors, Spacing, FontSizes } from '../theme';
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
        const subscription = Linking.addEventListener('url', async ({ url }) => {
            if (url.includes('onConnect')) {
                const result = parseConnectResponse(url);
                if (result) {
                    setPublicKey(result.publicKey);
                    setSession(result.session);
                    setConnected(true);
                    // Refresh balance after connecting
                    setTimeout(() => refreshBalance(), 1000);
                } else {
                    Alert.alert('Connection Failed', 'Could not connect to Phantom wallet.');
                }
            }
        });

        return () => subscription.remove();
    }, []);

    const handleConnect = useCallback(async () => {
        try {
            const url = buildConnectUrl();
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

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            {/* Title */}
            <GlowText color={Colors.neonPurple} size="hero" align="center" style={styles.title}>
                SolPin
            </GlowText>
            <GlowText color={Colors.neonBlue} size="xl" align="center" style={styles.subtitle}>
                ARCADE
            </GlowText>

            {/* Wallet Card */}
            <NeonCard glowColor={connected ? Colors.neonGreen : Colors.neonPurple} style={styles.card}>
                {connected && publicKey ? (
                    <>
                        <GlowText color={Colors.neonGreen} size="sm" align="center">
                            ● CONNECTED
                        </GlowText>
                        <GlowText color={Colors.textPrimary} size="lg" align="center" style={styles.address}>
                            {truncateAddress(publicKey.toBase58(), 6)}
                        </GlowText>
                        <View style={styles.balanceRow}>
                            <GlowText color={Colors.textSecondary} size="body">
                                Balance
                            </GlowText>
                            <GlowText color={Colors.neonYellow} size="lg">
                                {balance.toFixed(4)} SOL
                            </GlowText>
                        </View>
                    </>
                ) : (
                    <GlowText color={Colors.textSecondary} size="body" align="center">
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
                            style={styles.secondaryBtn}
                        />
                        <NeonButton
                            title="Disconnect"
                            onPress={handleDisconnect}
                            variant="danger"
                            size="sm"
                            style={styles.secondaryBtn}
                        />
                    </>
                ) : (
                    <NeonButton
                        title="Connect Phantom"
                        onPress={handleConnect}
                        variant="secondary"
                        size="lg"
                    />
                )}
            </View>

            {/* Footer */}
            <GlowText color={Colors.textMuted} size="xs" align="center" style={styles.footer}>
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
    secondaryBtn: {
        marginTop: 0,
    },
    footer: {
        marginTop: Spacing.xxl,
    },
});
