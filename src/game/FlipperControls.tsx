// ===================================================================
// Flipper controls — split-screen invisible touch zones.
// Left half of screen = left flipper, right half = right flipper.
// ===================================================================

import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { PinballEngine } from './engine';

interface FlipperControlsProps {
    engine: PinballEngine;
}

export const FlipperControls: React.FC<FlipperControlsProps> = ({ engine }) => {
    const handleLeftIn = useCallback(() => {
        engine.setFlipperActive('left', true);
    }, [engine]);

    const handleLeftOut = useCallback(() => {
        engine.setFlipperActive('left', false);
    }, [engine]);

    const handleRightIn = useCallback(() => {
        engine.setFlipperActive('right', true);
    }, [engine]);

    const handleRightOut = useCallback(() => {
        engine.setFlipperActive('right', false);
    }, [engine]);

    return (
        <View style={styles.container} pointerEvents="box-none">
            <Pressable
                style={styles.leftZone}
                onPressIn={handleLeftIn}
                onPressOut={handleLeftOut}
            >
                <View style={styles.indicator}>
                    <View style={[styles.arrow, styles.arrowLeft]} />
                </View>
            </Pressable>

            <Pressable
                style={styles.rightZone}
                onPressIn={handleRightIn}
                onPressOut={handleRightOut}
            >
                <View style={styles.indicator}>
                    <View style={[styles.arrow, styles.arrowRight]} />
                </View>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
    },
    leftZone: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 30,
    },
    rightZone: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 30,
    },
    indicator: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    arrow: {
        width: 0,
        height: 0,
        borderTopWidth: 10,
        borderBottomWidth: 10,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
    },
    arrowLeft: {
        borderRightWidth: 14,
        borderRightColor: 'rgba(255,255,255,0.15)',
    },
    arrowRight: {
        borderLeftWidth: 14,
        borderLeftColor: 'rgba(255,255,255,0.15)',
    },
});
