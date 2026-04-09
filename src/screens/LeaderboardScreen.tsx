import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, StatusBar, Animated, Easing, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Spacing, BorderRadius, Animations } from '../theme';
import { NeonButton } from '../components/NeonButton';
import { NeonCard } from '../components/NeonCard';
import { GlowText } from '../components/GlowText';
import { useLeaderboardStore, type LeaderboardEntry } from '../store/leaderboardStore';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Leaderboard'>;

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
    const { entries, isLoading, lastUpdated, load } = useLeaderboardStore();

    // Load on mount and poll every 10s for updates
    useEffect(() => {
        void load();
        const interval = setInterval(() => { void load(); }, 10000);
        return () => clearInterval(interval);
    }, [load]);

    const titleOpacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(titleOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, []);

    const renderItem = useCallback(({ item, index }: { item: LeaderboardEntry; index: number }) => {
        const rank = index + 1;
        const isTop3 = rank <= 3;
        const label = `${item.duration}s ${item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1)}`;
        return (
            <AnimatedRow index={index} isTop3={isTop3}>
                <View style={styles.rankCol}>
                    <GlowText color={isTop3 ? Colors.textPrimary : Colors.textMuted} size={isTop3 ? 'lg' : 'body'} weight="700" align="center" glow={0}>
                        {isTop3 ? RANK_MEDALS[rank - 1] : `#${rank}`}
                    </GlowText>
                </View>
                <View style={styles.infoCol}>
                    <GlowText color={Colors.textPrimary} size="body" weight="600" glow={0}>{item.wallet}</GlowText>
                    <GlowText color={Colors.textMuted} size="xs" glow={0}>{label} • {item.score.toLocaleString()} pts</GlowText>
                </View>
                <View style={styles.rewardCol}>
                    <GlowText color={Colors.success} size="body" weight="700" align="right" glow={0}>+{item.reward.toFixed(2)}</GlowText>
                    <GlowText color={Colors.textMuted} size="xs" align="right" glow={0}>SOL</GlowText>
                </View>
            </AnimatedRow>
        );
    }, []);

    const updatedAt = lastUpdated
        ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;

    return (
        <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.md }]}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

            <Animated.View style={[styles.titleRow, { opacity: titleOpacity }]}>
                <GlowText color={Colors.textPrimary} size="xl" align="center" weight="700" glow={0} style={styles.title}>
                    🏆  Leaderboard
                </GlowText>
                {isLoading
                    ? <ActivityIndicator color={Colors.textMuted} size="small" style={styles.indicator} />
                    : updatedAt
                        ? <GlowText color={Colors.textMuted} size="xs" align="center" glow={0}>Updated {updatedAt}</GlowText>
                        : null
                }
            </Animated.View>

            <NeonCard style={styles.card}>
                {entries.length === 0 && !isLoading ? (
                    <View style={styles.empty}>
                        <GlowText color={Colors.textMuted} size="body" align="center" glow={0}>
                            No scores yet. Play a round to appear here!
                        </GlowText>
                    </View>
                ) : (
                    <>
                        <View style={styles.header}>
                            <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.rankCol}>RANK</GlowText>
                            <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.infoCol}>PLAYER</GlowText>
                            <GlowText color={Colors.textMuted} size="xs" glow={0} style={styles.rewardCol} align="right">REWARD</GlowText>
                        </View>
                        <FlatList
                            data={entries}
                            renderItem={renderItem}
                            keyExtractor={(item) => item.id}
                            showsVerticalScrollIndicator={false}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                        />
                    </>
                )}
            </NeonCard>

            <NeonButton title="Back" onPress={() => navigation.goBack()} variant="secondary" size="md" style={styles.backBtn} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: Spacing.lg },
    titleRow: { alignItems: 'center', marginBottom: Spacing.lg },
    title: { marginBottom: Spacing.xs },
    indicator: { marginTop: Spacing.xs },
    card: { flex: 1, marginBottom: Spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.xs, borderRadius: BorderRadius.sm },
    rowHighlight: { backgroundColor: Colors.bgSubtle },
    rankCol: { width: 50 },
    infoCol: { flex: 1, paddingHorizontal: Spacing.sm },
    rewardCol: { width: 70 },
    separator: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.xs },
    backBtn: { marginBottom: Spacing.md },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: Spacing.xxl },
});
