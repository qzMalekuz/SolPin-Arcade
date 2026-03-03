import React, { useCallback, useRef } from 'react';
import {
    Pressable,
    Text,
    StyleSheet,
    ViewStyle,
    TextStyle,
    ActivityIndicator,
    Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, FontSizes, ButtonSizes } from '../theme';

interface NeonButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    loading?: boolean;
    style?: ViewStyle | (ViewStyle | undefined)[];
    textStyle?: TextStyle;
    size?: 'sm' | 'md' | 'lg';
    haptic?: boolean;
}

const VARIANT_COLORS = {
    primary: Colors.textPrimary,
    secondary: Colors.textSecondary,
    danger: Colors.danger,
};

export const NeonButton: React.FC<NeonButtonProps> = React.memo(({
    title,
    onPress,
    variant = 'primary',
    disabled = false,
    loading = false,
    style,
    textStyle,
    size = 'md',
    haptic = true,
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const color = VARIANT_COLORS[variant];
    const sizeConfig = ButtonSizes[size];

    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.97,
            tension: 300,
            friction: 15,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePressOut = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 300,
            friction: 15,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePress = useCallback(() => {
        if (haptic) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        }
        onPress();
    }, [onPress, haptic]);

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Pressable
                onPress={handlePress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={disabled || loading}
                style={[
                    styles.button,
                    {
                        height: sizeConfig.height,
                        paddingHorizontal: sizeConfig.paddingHorizontal,
                        borderColor: disabled ? Colors.border : Colors.borderLight,
                        opacity: disabled ? 0.4 : 1,
                    },
                    style,
                ]}
            >
                {loading ? (
                    <ActivityIndicator color={color} size="small" />
                ) : (
                    <Text
                        style={[
                            styles.text,
                            {
                                color,
                                fontSize: size === 'sm' ? FontSizes.sm : size === 'lg' ? FontSizes.md : FontSizes.body,
                            },
                            textStyle,
                        ]}
                    >
                        {title}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    );
});

NeonButton.displayName = 'NeonButton';

const styles = StyleSheet.create({
    button: {
        borderWidth: 1,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    text: {
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
});
