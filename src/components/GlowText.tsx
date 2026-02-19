import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { Colors, FontSizes } from '../theme';

interface GlowTextProps {
    children: React.ReactNode;
    color?: string;
    size?: keyof typeof FontSizes;
    style?: TextStyle;
    align?: 'left' | 'center' | 'right';
    weight?: TextStyle['fontWeight'];
}

export const GlowText: React.FC<GlowTextProps> = ({
    children,
    color = Colors.neonBlue,
    size = 'md',
    style,
    align = 'left',
    weight = '700',
}) => (
    <Text
        style={[
            styles.base,
            {
                color,
                fontSize: FontSizes[size],
                textAlign: align,
                fontWeight: weight,
                textShadowColor: color,
            },
            style,
        ]}
    >
        {children}
    </Text>
);

const styles = StyleSheet.create({
    base: {
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
        letterSpacing: 0.8,
    },
});
