import React, { useEffect, useRef } from 'react';
import { Text, TextStyle, Animated, Easing } from 'react-native';
import { Colors, FontSizes } from '../theme';

interface AnimatedNumberProps {
    value: number;
    duration?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    color?: string;
    size?: keyof typeof FontSizes;
    weight?: TextStyle['fontWeight'];
    align?: 'left' | 'center' | 'right';
    style?: TextStyle;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = React.memo(({
    value,
    duration = 1200,
    decimals = 0,
    prefix = '',
    suffix = '',
    color = Colors.textPrimary,
    size = 'xl',
    weight = '700',
    align = 'left',
    style,
}) => {
    const animValue = useRef(new Animated.Value(0)).current;
    const [displayText, setDisplayText] = React.useState(
        `${prefix}${decimals > 0 ? (0).toFixed(decimals) : '0'}${suffix}`
    );

    useEffect(() => {
        animValue.setValue(0);
        const listener = animValue.addListener(({ value: v }) => {
            const formatted = decimals > 0
                ? v.toFixed(decimals)
                : Math.round(v).toLocaleString();
            setDisplayText(`${prefix}${formatted}${suffix}`);
        });

        Animated.timing(animValue, {
            toValue: value,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false, // text updates need JS driver
        }).start();

        return () => animValue.removeListener(listener);
    }, [value, duration, decimals, prefix, suffix]);

    return (
        <Text
            style={[
                {
                    color,
                    fontSize: FontSizes[size],
                    fontWeight: weight,
                    textAlign: align,
                    letterSpacing: 0.3,
                },
                style,
            ]}
        >
            {displayText}
        </Text>
    );
});

AnimatedNumber.displayName = 'AnimatedNumber';
