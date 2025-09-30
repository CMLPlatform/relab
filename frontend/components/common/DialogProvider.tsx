import React, { createContext, useContext, useState, ReactNode } from "react";
import { Text, TextInput, Button } from "react-native-paper";
import {View, StyleSheet, Modal, Pressable} from "react-native";

type DialogButton = {
    text: string;
    onPress?: (value?: string) => void;
};

type DialogOptions = {
    title?: string;
    message?: string;
    buttons?: DialogButton[];
    input?: boolean; // if true, show a text field
    defaultValue?: string;
    placeholder?: string;
};

type DialogContextType = {
    alert: (
        title: string,
        message?: string,
        buttons?: DialogButton[],
        options?: Omit<DialogOptions, "title" | "message" | "buttons">
    ) => void,
    input: (
        title: string,
        placeholder?: string,
        buttons?: DialogButton[],
        options?: Omit<DialogOptions, "title" | "placeholder" | "buttons">
    ) => void,
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog(){
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useDialog must be used within DialogProvider");
    return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
    // States
    const [options, setOptions] = useState<DialogOptions | null>(null);

    // Context functions
    const alert: DialogContextType["alert"] = (
        title,
        message,
        buttons,
        extraOptions
    ) => {
        setOptions({ title, message, buttons, ...extraOptions });
    };

    const input: DialogContextType["input"] = (
        title,
        placeholder,
        buttons,
        extraOptions
    ) => {
        setOptions({ title, placeholder, buttons, input: true, ...extraOptions });
    };

    // Callbacks
    const clear = () => {
        setOptions(null);
    }

    // Render
    return (
        <DialogContext.Provider value={{ alert, input }}>
            {children}

            <Modal
                visible={!!options}
                transparent
                onRequestClose={clear}
            >
                <Pressable style={styles.backdrop} onPress={clear}>
                    <Dialog options={options} onDismiss={clear}/>
                </Pressable>
            </Modal>
        </DialogContext.Provider>
    );
}


function Dialog({options, onDismiss}: { options: DialogOptions | null, onDismiss?: () => void }) {
    // States
    const [inputValue, setInputValue] = useState("");

    // Callbacks
    const handleClose = (btn?: DialogButton) => {
        if (btn?.onPress) {
            btn.onPress(options?.input ? inputValue : undefined);
        }
        setInputValue("");
        onDismiss?.()
    }

    // Render
    return (
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
            {options?.title && (
                <Text style={styles.title}>{options.title}</Text>
            )}
            {options?.message && (
                <Text style={styles.message}>{options.message}</Text>
            )}

            {options?.input && (
                <TextInput
                    value={inputValue}
                    onChangeText={setInputValue}
                    onSubmitEditing={() => handleClose(options?.buttons ? options.buttons[options.buttons.length - 1] : undefined)}
                    placeholder={options.placeholder}
                    autoFocus
                />
            )}

            <View style={styles.buttonRow}>
                {(options?.buttons || [{ text: "OK" }]).map((btn, idx) => (
                    <Button
                        key={idx}
                        onPress={() => handleClose(btn)}
                        style={styles.button}
                    >
                        {btn.text}
                    </Button>
                ))}
            </View>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
    },
    container: {
        zIndex: 10,
        backgroundColor: "white",
        borderRadius: 12,
        padding: 20,
        paddingBottom: 5,
        width: "80%",
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 18,
    },
    message: {
        fontSize: 15,
        color: "#555",
        marginBottom: 12,
    },
    buttonRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginLeft: 8,
    },
    buttonText: {
        fontSize: 16,
        color: "#007AFF",
        fontWeight: "500",
    },
});
