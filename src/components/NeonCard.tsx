import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing, Shadows } from '../theme';

interface NeonCardProps {
    children: ReactNode;
    glowColor?: string;
    style?: ViewStyle;
}

export const NeonCard: React.FC<NeonCardProps> = React.memo(({
    children,
    glowColor,
    style,
}) => (
    <View
        style={[
            styles.card,
            glowColor ? Shadows.glow(glowColor, 0.08) : null,
            style,
        ]}
    >
        {children}
    </View>
));

NeonCard.displayName = 'NeonCard';

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.card,
    },
});
