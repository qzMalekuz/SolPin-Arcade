import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { Colors, FontSizes } from '../theme';

interface GlowTextProps {
    children: React.ReactNode;
    color?: string;
    size?: keyof typeof FontSizes;
    style?: TextStyle | TextStyle[];
    align?: 'left' | 'center' | 'right';
    weight?: TextStyle['fontWeight'];
    /** Controls glow intensity: 0 = none, 1 = subtle, 2 = soft (default) */
    glow?: 0 | 1 | 2;
}

const GLOW_RADIUS = [0, 2, 4];

export const GlowText: React.FC<GlowTextProps> = React.memo(({
    children,
    color = Colors.textPrimary,
    size = 'md',
    style,
    align = 'left',
    weight = '600',
    glow = 2,
}) => (
    <Text
        style={[
            styles.base,
            {
                color,
                fontSize: FontSizes[size],
                textAlign: align,
                fontWeight: weight,
                textShadowColor: glow > 0 ? color : 'transparent',
                textShadowRadius: GLOW_RADIUS[glow],
            },
            style,
        ]}
    >
        {children}
    </Text>
));

GlowText.displayName = 'GlowText';

const styles = StyleSheet.create({
    base: {
        textShadowOffset: { width: 0, height: 0 },
        letterSpacing: 0.5,
    },
});
