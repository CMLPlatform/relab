import React from 'react';
import { TextInput as NativeTextInput, TextInputProps, StyleSheet, useColorScheme } from 'react-native';
import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';


export const TextInput: React.FC<TextInputProps> = ({style, children,  ...props}) => {
    const cs = useColorScheme() || 'light';

    return (
        <NativeTextInput style={[styles.base, styles[cs], style]} {...props}>{children}</NativeTextInput>
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