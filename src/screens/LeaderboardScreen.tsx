import React from 'react';
import { View, StyleSheet, FlatList, StatusBar } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Spacing, BorderRadius } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { truncateAddress } from '../solana/phantom';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Leaderboard'>;

// Mock leaderboard data — in production this would come from an on-chain
// or off-chain indexed leaderboard.
const MOCK_LEADERBOARD = [
    { rank: 1, wallet: '7xKX...qP9z', score: 128500, duration: '90s Hard', reward: 2.45 },
    { rank: 2, wallet: 'Dw4F...mK2t', score: 95200, duration: '90s Medium', reward: 1.80 },
    { rank: 3, wallet: 'Bx9L...nR7e', score: 87300, duration: '60s Hard', reward: 1.54 },
    { rank: 4, wallet: '3pYs...vJ8q', score: 72100, duration: '60s Medium', reward: 1.20 },
    { rank: 5, wallet: 'Hm6N...xT3w', score: 65800, duration: '90s Easy', reward: 0.95 },
    { rank: 6, wallet: 'KzR2...pL5a', score: 54200, duration: '60s Easy', reward: 0.78 },
    { rank: 7, wallet: 'QwE1...bN9d', score: 43100, duration: '30s Hard', reward: 0.62 },
    { rank: 8, wallet: 'Yt7G...cX4f', score: 38700, duration: '30s Medium', reward: 0.44 },
    { rank: 9, wallet: 'Nk5P...dS2h', score: 29900, duration: '30s Easy', reward: 0.28 },
    { rank: 10, wallet: 'Vj3M...eW8k', score: 21400, duration: '30s Easy', reward: 0.15 },
];

const RANK_COLORS = [Colors.neonYellow, Colors.textPrimary, Colors.neonOrange];

export const LeaderboardScreen: React.FC<Props> = ({ navigation }) => {
    const renderItem = ({
        item,
    }: {
        item: (typeof MOCK_LEADERBOARD)[number];
    }) => {
        const rankColor =
            item.rank <= 3 ? RANK_COLORS[item.rank - 1] : Colors.textMuted;

        return (
            <View style={styles.row}>
                <View style={styles.rankCol}>
                    <GlowText color={rankColor} size="lg" weight="700" align="center">
                        {item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : `#${item.rank}`}
                    </GlowText>
                </View>

                <View style={styles.infoCol}>
                    <GlowText color={Colors.textPrimary} size="body" weight="600">
                        {item.wallet}
                    </GlowText>
                    <GlowText color={Colors.textMuted} size="xs">
                        {item.duration} • Score: {item.score.toLocaleString()}
                    </GlowText>
                </View>

                <View style={styles.rewardCol}>
                    <GlowText color={Colors.neonGreen} size="body" weight="700" align="right">
                        +{item.reward.toFixed(2)}
                    </GlowText>
                    <GlowText color={Colors.textMuted} size="xs" align="right">
                        SOL
                    </GlowText>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <GlowText
                color={Colors.neonYellow}
                size="xl"
                align="center"
                style={styles.title}
            >
                🏆 Leaderboard
            </GlowText>

            <NeonCard glowColor={Colors.neonPurple} style={styles.card}>
                <View style={styles.header}>
                    <GlowText color={Colors.textMuted} size="xs" style={styles.rankCol}>
                        RANK
                    </GlowText>
                    <GlowText color={Colors.textMuted} size="xs" style={styles.infoCol}>
                        PLAYER
                    </GlowText>
                    <GlowText color={Colors.textMuted} size="xs" style={styles.rewardCol} align="right">
                        REWARD
                    </GlowText>
                </View>

                <FlatList
                    data={MOCK_LEADERBOARD}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.rank.toString()}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
            </NeonCard>

            <NeonButton
                title="Back"
                onPress={() => navigation.goBack()}
                variant="secondary"
                size="md"
                style={styles.backBtn}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xxl,
    },
    title: {
        marginBottom: Spacing.lg,
    },
    card: {
        flex: 1,
        marginBottom: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        marginBottom: Spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    rankCol: {
        width: 50,
    },
    infoCol: {
        flex: 1,
        paddingHorizontal: Spacing.sm,
    },
    rewardCol: {
        width: 70,
    },
    separator: {
        height: 1,
        backgroundColor: Colors.border,
    },
    backBtn: {
        marginBottom: Spacing.lg,
    },
});
