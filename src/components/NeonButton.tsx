import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ViewStyle,
    TextStyle,
    ActivityIndicator,
} from 'react-native';
import { Colors, BorderRadius, FontSizes, Spacing } from '../theme';

interface NeonButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    loading?: boolean;
    style?: ViewStyle | ViewStyle[];
    textStyle?: TextStyle;
    size?: 'sm' | 'md' | 'lg';
}

const VARIANT_COLORS = {
    primary: Colors.neonBlue,
    secondary: Colors.neonPurple,
    danger: Colors.danger,
};

export const NeonButton: React.FC<NeonButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    disabled = false,
    loading = false,
    style,
    textStyle,
    size = 'md',
}) => {
    const color = VARIANT_COLORS[variant];
    const sizeStyles = SIZE_MAP[size];

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.7}
            style={[
                styles.button,
                sizeStyles.button,
                {
                    borderColor: color,
                    shadowColor: color,
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
                        sizeStyles.text,
                        { color, textShadowColor: color },
                        textStyle,
                    ]}
                >
                    {title}
                </Text>
            )}
        </TouchableOpacity>
    );
};

const SIZE_MAP = {
    sm: StyleSheet.create({
        button: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md },
        text: { fontSize: FontSizes.sm },
    }),
    md: StyleSheet.create({
        button: { paddingVertical: Spacing.sm + 4, paddingHorizontal: Spacing.lg },
        text: { fontSize: FontSizes.md },
    }),
    lg: StyleSheet.create({
        button: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
        text: { fontSize: FontSizes.lg },
    }),
};

const styles = StyleSheet.create({
    button: {
        borderWidth: 1.5,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
        elevation: 8,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    text: {
        fontWeight: '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
});
