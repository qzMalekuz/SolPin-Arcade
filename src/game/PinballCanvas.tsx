// ===================================================================
// PinballCanvas — renders the pinball table using React Native Views.
// Uses absolute positioning for all game elements.
// Alternative to Skia for maximum Expo Go compatibility.
// ===================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    cancelAnimation,
    runOnJS,
} from 'react-native-reanimated';

import { PinballEngine, EngineState } from './engine';
import {
    TABLE_W,
    TABLE_H,
    WALLS,
    BUMPERS,
    FLIPPERS,
} from './table';
import { Colors } from '../theme';

interface PinballCanvasProps {
    engine: PinballEngine;
    width: number;
    height: number;
}

export const PinballCanvas: React.FC<PinballCanvasProps> = ({
    engine,
    width,
    height,
}) => {
    const scaleX = width / TABLE_W;
    const scaleY = height / TABLE_H;
    const sc = Math.min(scaleX, scaleY);
    const offsetX = (width - TABLE_W * sc) / 2;
    const offsetY = (height - TABLE_H * sc) / 2;

    // Ball position — updated every frame
    const [ballPos, setBallPos] = useState({ x: 200, y: 500 });
    const [flipperAngles, setFlipperAngles] = useState([0, 0]);
    const [activeBumpers, setActiveBumpers] = useState<Set<string>>(new Set());

    useEffect(() => {
        engine.onStateUpdate((state: EngineState) => {
            setBallPos({ x: state.ball.pos.x, y: state.ball.pos.y });
            setFlipperAngles(state.flippers.map((f) => f.angle));
            setActiveBumpers(new Set(state.activeBumpers));
        });
    }, [engine]);

    const tx = (x: number) => offsetX + x * sc;
    const ty = (y: number) => offsetY + y * sc;
    const ts = (s: number) => s * sc;

    return (
        <View style={[styles.container, { width, height }]}>
            {/* Background */}
            <View style={[styles.tableBackground, { width, height }]} />

            {/* Table border glow */}
            <View
                style={[
                    styles.tableBorder,
                    {
                        left: tx(15),
                        top: ty(15),
                        width: ts(TABLE_W - 30),
                        height: ts(TABLE_H - 30),
                    },
                ]}
            />

            {/* Walls */}
            {WALLS.map((wall, i) => {
                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);

                return (
                    <View
                        key={`wall-${i}`}
                        style={[
                            styles.wall,
                            {
                                left: tx(wall.p1.x),
                                top: ty(wall.p1.y),
                                width: ts(len),
                                transform: [{ rotate: `${angle}rad` }],
                                transformOrigin: 'left center',
                            },
                        ]}
                    />
                );
            })}

            {/* Bumpers */}
            {BUMPERS.map((bumper) => {
                const isActive = activeBumpers.has(bumper.id);
                return (
                    <View
                        key={bumper.id}
                        style={[
                            styles.bumper,
                            {
                                left: tx(bumper.pos.x - bumper.radius),
                                top: ty(bumper.pos.y - bumper.radius),
                                width: ts(bumper.radius * 2),
                                height: ts(bumper.radius * 2),
                                borderRadius: ts(bumper.radius),
                                backgroundColor: isActive ? bumper.color : 'rgba(0,0,0,0.6)',
                                borderColor: bumper.color,
                                shadowColor: bumper.color,
                                shadowOpacity: isActive ? 1 : 0.4,
                                shadowRadius: isActive ? 20 : 8,
                            },
                        ]}
                    />
                );
            })}

            {/* Flippers */}
            {FLIPPERS.map((flipperDef, i) => {
                const angle = flipperAngles[i] ?? flipperDef.restAngle;
                return (
                    <View
                        key={`flipper-${i}`}
                        style={[
                            styles.flipper,
                            {
                                left: tx(flipperDef.pivot.x),
                                top: ty(flipperDef.pivot.y),
                                width: ts(flipperDef.length),
                                transform: [{ rotate: `${angle}rad` }],
                                transformOrigin: 'left center',
                            },
                        ]}
                    />
                );
            })}

            {/* Ball */}
            {engine.state.ball.active && (
                <View
                    style={[
                        styles.ball,
                        {
                            left: tx(ballPos.x - engine.state.config.ballRadius),
                            top: ty(ballPos.y - engine.state.config.ballRadius),
                            width: ts(engine.state.config.ballRadius * 2),
                            height: ts(engine.state.config.ballRadius * 2),
                            borderRadius: ts(engine.state.config.ballRadius),
                        },
                    ]}
                />
            )}

            {/* Drain zone indicator */}
            <View
                style={[
                    styles.drainZone,
                    {
                        left: tx(100),
                        top: ty(TABLE_H - 15),
                        width: ts(TABLE_W - 200),
                    },
                ]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        overflow: 'hidden',
    },
    tableBackground: {
        position: 'absolute',
        backgroundColor: '#050510',
    },
    tableBorder: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: Colors.neonPurple,
        borderRadius: 12,
        shadowColor: Colors.neonPurple,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 15,
        elevation: 4,
    },
    wall: {
        position: 'absolute',
        height: 3,
        backgroundColor: Colors.neonBlue,
        shadowColor: Colors.neonBlue,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 2,
    },
    bumper: {
        position: 'absolute',
        borderWidth: 2,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    flipper: {
        position: 'absolute',
        height: 10,
        backgroundColor: Colors.neonYellow,
        borderRadius: 5,
        shadowColor: Colors.neonYellow,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        elevation: 3,
    },
    ball: {
        position: 'absolute',
        backgroundColor: '#ffffff',
        shadowColor: '#ffffff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 5,
        borderWidth: 1,
        borderColor: Colors.neonBlue,
    },
    drainZone: {
        position: 'absolute',
        height: 3,
        backgroundColor: Colors.danger,
        shadowColor: Colors.danger,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 2,
    },
});
