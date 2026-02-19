import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../theme';

interface NeonCardProps {
    children: ReactNode;
    glowColor?: string;
    style?: ViewStyle;
}

export const NeonCard: React.FC<NeonCardProps> = ({
    children,
    glowColor = Colors.neonBlue,
    style,
}) => (
    <View
        style={[
            styles.card,
            {
                borderColor: glowColor,
                shadowColor: glowColor,
            },
            style,
        ]}
    >
        {children}
    </View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 6,
    },
});
