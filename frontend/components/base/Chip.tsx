import {StyleSheet, Pressable, PressableProps, useColorScheme} from "react-native";
import React from "react";
import LightTheme from "@/assets/themes/light";
import DarkTheme from "@/assets/themes/dark";

import {Text} from "@/components/base";

interface Props extends PressableProps {
    children?: string,
    title?: string,
}


export const Chip: React.FC<Props> = ({style, children, title, ...props}) => {
    const cs = useColorScheme() || 'light';

    const finalStyle = StyleSheet.flatten([
        styles.base,
        styles[cs],
        style
    ]);

    const finalTextStyle = StyleSheet.flatten([
        styles.baseText,
        cs === "light" ? styles["lightText"] : styles["darkText"],
    ]);

    return (
        <Pressable style={finalStyle} {...props}>
            { title && (<Text style={styles.baseText}>
                {title}
            </Text>)}
            <Text style={finalTextStyle}>
                {children}
            </Text>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    base: {
        borderRadius: 5,
        flexDirection: 'row',
        boxShadow: '3px 3px 3px rgba(0, 0, 0, 0.2)',
    },
    light: {
        backgroundColor: LightTheme.colors.primaryContainer,
    },
    dark: {
        backgroundColor: DarkTheme.colors.primaryContainer,
    },
    baseText: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 5,
        textAlign: 'center',
        fontWeight: '500',
        fontSize: 15,
    },
    lightText: {
        backgroundColor: LightTheme.colors.primary,
        color: LightTheme.colors.onPrimary,
    },
    darkText: {
        backgroundColor: DarkTheme.colors.primary,
        color: DarkTheme.colors.onPrimary,
    },
});