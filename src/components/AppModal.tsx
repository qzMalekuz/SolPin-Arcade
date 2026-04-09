import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
    Modal,
    View,
    StyleSheet,
    Pressable,
    Animated,
    Easing,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes } from '../theme';
import { GlowText } from './GlowText';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModalButton {
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
}

interface ModalOptions {
    title: string;
    message?: string;
    buttons?: ModalButton[];
    /** 'info' | 'success' | 'error' | 'warning' */
    type?: 'info' | 'success' | 'error' | 'warning';
}

interface ModalContextValue {
    show: (options: ModalOptions) => void;
    alert: (title: string, message?: string, buttons?: ModalButton[]) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ModalContext = createContext<ModalContextValue | null>(null);

// ─── Accent colours per type ─────────────────────────────────────────────────

const TYPE_COLOR: Record<NonNullable<ModalOptions['type']>, string> = {
    info:    Colors.textSecondary,
    success: '#6ee7b7',
    error:   '#f87171',
    warning: '#fbbf24',
};

const TYPE_ICON: Record<NonNullable<ModalOptions['type']>, string> = {
    info:    'ℹ',
    success: '✓',
    error:   '✕',
    warning: '⚠',
};

// ─── Provider ────────────────────────────────────────────────────────────────

export const AppModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [visible, setVisible] = useState(false);
    const [options, setOptions] = useState<ModalOptions>({ title: '' });

    const scaleAnim = useRef(new Animated.Value(0.88)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    const show = useCallback((opts: ModalOptions) => {
        setOptions(opts);
        setVisible(true);
        scaleAnim.setValue(0.88);
        opacityAnim.setValue(0);
        Animated.parallel([
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 280,
                friction: 18,
                useNativeDriver: true,
            }),
        ]).start();
    }, [opacityAnim, scaleAnim]);

    const alert = useCallback(
        (title: string, message?: string, buttons?: ModalButton[]) => {
            // Infer type from title keywords
            const lower = title.toLowerCase();
            const type: ModalOptions['type'] =
                lower.includes('success') || lower.includes('successful') ? 'success'
                : lower.includes('fail') || lower.includes('error') || lower.includes('invalid') ? 'error'
                : lower.includes('timeout') || lower.includes('timed') || lower.includes('warn') || lower.includes('minimum') || lower.includes('insufficient') ? 'warning'
                : 'info';
            show({ title, message, buttons, type });
        },
        [show],
    );

    const dismiss = useCallback((btn?: ModalButton) => {
        Animated.parallel([
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 160,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 0.9,
                duration: 160,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setVisible(false);
            btn?.onPress?.();
        });
    }, [opacityAnim, scaleAnim]);

    const type = options.type ?? 'info';
    const accent = TYPE_COLOR[type];
    const icon = TYPE_ICON[type];

    const buttons: ModalButton[] = options.buttons?.length
        ? options.buttons
        : [{ text: 'OK', style: 'default' }];

    return (
        <ModalContext.Provider value={{ show, alert }}>
            {children}
            <Modal
                transparent
                visible={visible}
                animationType="none"
                statusBarTranslucent
                onRequestClose={() => dismiss()}
            >
                <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
                    <Animated.View style={[styles.sheet, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
                        {/* Icon badge */}
                        <View style={[styles.iconBadge, { borderColor: accent + '55', backgroundColor: accent + '18' }]}>
                            <GlowText color={accent} size="xl" weight="700" align="center" glow={0}>
                                {icon}
                            </GlowText>
                        </View>

                        {/* Title */}
                        <GlowText color={Colors.textPrimary} size="lg" weight="700" align="center" glow={0} style={styles.title}>
                            {options.title}
                        </GlowText>

                        {/* Message */}
                        {options.message ? (
                            <GlowText color={Colors.textSecondary} size="body" align="center" glow={0} style={styles.message}>
                                {options.message}
                            </GlowText>
                        ) : null}

                        {/* Divider */}
                        <View style={[styles.divider, { backgroundColor: accent + '33' }]} />

                        {/* Buttons */}
                        <View style={[styles.btnRow, buttons.length === 1 && styles.btnRowSingle]}>
                            {buttons.map((btn, i) => {
                                const isDestructive = btn.style === 'destructive';
                                const isCancel = btn.style === 'cancel';
                                const btnColor = isDestructive ? '#f87171' : isCancel ? Colors.textMuted : accent;
                                return (
                                    <React.Fragment key={i}>
                                        {i > 0 && <View style={styles.btnDivider} />}
                                        <Pressable
                                            style={({ pressed }) => [
                                                styles.btn,
                                                buttons.length === 1 && styles.btnFull,
                                                pressed && { backgroundColor: btnColor + '18' },
                                            ]}
                                            onPress={() => dismiss(btn)}
                                        >
                                            <GlowText
                                                color={btnColor}
                                                size="body"
                                                weight={isCancel ? '400' : '700'}
                                                align="center"
                                                glow={0}
                                                style={{ letterSpacing: 0.4 }}
                                            >
                                                {btn.text}
                                            </GlowText>
                                        </Pressable>
                                    </React.Fragment>
                                );
                            })}
                        </View>
                    </Animated.View>
                </Animated.View>
            </Modal>
        </ModalContext.Provider>
    );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAppModal = (): ModalContextValue => {
    const ctx = useContext(ModalContext);
    if (!ctx) throw new Error('useAppModal must be used inside AppModalProvider');
    return ctx;
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.72)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    sheet: {
        width: '100%',
        backgroundColor: Colors.bgElevated,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        paddingTop: Spacing.xl,
        paddingHorizontal: Spacing.xl,
        paddingBottom: 0,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
        elevation: 16,
    },
    iconBadge: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    title: {
        marginBottom: Spacing.sm,
    },
    message: {
        lineHeight: 22,
        marginBottom: Spacing.lg,
    },
    divider: {
        height: 1,
        width: '120%',
        marginBottom: 0,
    },
    btnRow: {
        flexDirection: 'row',
        width: '120%',
    },
    btnRowSingle: {
        justifyContent: 'center',
    },
    btn: {
        flex: 1,
        paddingVertical: Spacing.md + 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 0,
    },
    btnFull: {
        borderBottomLeftRadius: BorderRadius.xl,
        borderBottomRightRadius: BorderRadius.xl,
    },
    btnDivider: {
        width: 1,
        backgroundColor: Colors.border,
    },
});
