import React from 'react';
import { Text as NativeText, TextProps, StyleSheet, useColorScheme } from 'react-native';
import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';


export const Text: React.FC<TextProps> = ({style, children, ...props}) => {
    const cs = useColorScheme() || 'light';

    return (
        <NativeText style={[styles.base, styles[cs], style]} {...props}>
            {children}
        </NativeText>
    );
};

const styles = StyleSheet.create({
    base: {
        fontFamily: 'System',
    },
    light: {
        color: LightTheme.colors.onSurface,
    },
    dark: {
        color: DarkTheme.colors.onSurface,
    }
});