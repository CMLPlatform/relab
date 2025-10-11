import React from 'react';
import {TextInput as NativeTextInput, TextInputProps, StyleSheet, useColorScheme} from 'react-native';
import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';

interface Props extends TextInputProps {
    errorOnEmpty?: boolean;
    ref?: React.Ref<NativeTextInput>
}


export function TextInput(
    { style, children, errorOnEmpty = false, ref, ...props }: Props,
) {
    const darkMode = useColorScheme() === "dark";
    const error = errorOnEmpty && (!props.value || props.value === "");

    return (
        <NativeTextInput
            ref={ref}
            style={[
                styles.input,
                error ? styles.inputError : null,
                darkMode && !error ? styles.inputDark : null,
                darkMode && error ? styles.inputErrorDark : null,
                style,
            ]}

            {...props}
        >{children}</NativeTextInput>
    );
}

const styles = StyleSheet.create({
    input: {
        fontFamily: 'System',
        color: LightTheme.colors.onSurface,
    },
    inputDark: {
        color: DarkTheme.colors.onSurface,
    },
    inputError: {
        backgroundColor: LightTheme.colors.errorContainer,
        color: LightTheme.colors.onErrorContainer,
    },
    inputErrorDark: {
        backgroundColor: DarkTheme.colors.errorContainer,
        color: DarkTheme.colors.onErrorContainer,
    },
});