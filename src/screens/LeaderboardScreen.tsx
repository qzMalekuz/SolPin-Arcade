import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, StatusBar, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Spacing, BorderRadius, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Leaderboard'>;

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

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

const AnimatedRow: React.FC<{ index: number; children: React.ReactNode; isTop3: boolean }> = ({ index, children, isTop3 }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(12)).current;

    useEffect(() => {
        const t = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, tension: 200, friction: 18, useNativeDriver: true }),
            ]).start();
        }, 100 + index * Animations.stagger);
        return () => clearTimeout(t);
    }, []);

    return (
        <Animated.View style={[styles.row, isTop3 && styles.rowHighlight, { opacity, transform: [{ translateY }] }]}>
            {children}
        </Animated.View>
    );
};

export const LeaderboardScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();

    const titleOpacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(titleOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, []);

    const renderItem = useCallback(({ item, index }: { item: (typeof MOCK_LEADERBOARD)[number]; index: number }) => {
        const isTop3 = item.rank <= 3;
        return (
            <AnimatedRow index={index} isTop3={isTop3}>
                <View style={styles.rankCol}>
                    <GlowText color={isTop3 ? Colors.textPrimary : Colors.textMuted} size={isTop3 ? 'lg' : 'body'} weight="700" align="center" glow={0}>
                        {isTop3 ? RANK_MEDALS[item.rank - 1] : `#${item.rank}`}
                    </GlowText>
                </View>
                <View style={styles.infoCol}>
                    <GlowText color={Colors.textPrimary} size="body" weight="600" glow={0}>{item.wallet}</GlowText>
                    <GlowText color={Colors.textMuted} size="xs" glow={0}>{item.duration} • {item.score.toLocaleString()} pts</GlowText>
                </View>
                <View style={styles.rewardCol}>
                    <GlowText color={Colors.success} size="body" weight="700" align="right" glow={0}>+{item.reward.toFixed(2)}</GlowText>
                    <GlowText color={Colors.textMuted} size="xs" align="right" glow={0}>SOL</GlowText>
                </View>
            </AnimatedRow>
        );
    }, []);

    return (
        <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.md }]}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <Animated.View style={{ opacity: titleOpacity }}>
                <GlowText color={Colors.textPrimary} size="xl" align="center" weight="700" glow={0} style={styles.title}>
                    🏆  Leaderboard
                </GlowText>
            </Animated.View>

            <NeonCard style={styles.card}>
                <View style={styles.header}>
                    <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.rankCol}>RANK</GlowText>
                    <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.infoCol}>PLAYER</GlowText>
                    <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.rewardCol} align="right">REWARD</GlowText>
                </View>
                <FlatList
                    data={MOCK_LEADERBOARD}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.rank.toString()}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
            </NeonCard>

            <NeonButton title="Back" onPress={() => navigation.goBack()} variant="secondary" size="md" style={styles.backBtn} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: Spacing.lg },
    title: { marginBottom: Spacing.lg },
    card: { flex: 1, marginBottom: Spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.xs, borderRadius: BorderRadius.sm },
    rowHighlight: { backgroundColor: Colors.bgSubtle },
    rankCol: { width: 50 },
    infoCol: { flex: 1, paddingHorizontal: Spacing.sm },
    rewardCol: { width: 70 },
    separator: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.xs },
    backBtn: { marginBottom: Spacing.md },
});
