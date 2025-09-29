import {useRouter} from "expo-router";
import {useEffect, useState} from "react";
import {View} from "react-native";
import {Button, Text, TextInput} from "react-native-paper";
import {login, getToken} from "@/services/api/authentication";


export default function Login() {
    // Hooks
    const router = useRouter();

    // States
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    // Effects
    useEffect(() => {
        getToken().then((token) => {
            if (!token) {return;}

            const params = {authenticated: "true"};
            router.replace({pathname: "/", params: params});
        });
    }, []);

    // Callbacks
    const attemptLogin = () => {
        login(username, password).then((success) => {
            if (success) {
                const params = {authenticated: "true"};
                router.replace({pathname: "/", params: params});
            } else {
                alert("Login failed. Please check your credentials.");
            }
        });
    }

    // Render
    return (
        <View style={{ flex: 1,  alignItems: "center", padding: 20, paddingTop: 100, gap: 20 }} >
            <Text
                variant="headlineMedium">
                Reverse Engineering Lab
            </Text>
            <TextInput
                style={{ width: "100%" }}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter your username"
            />
            <TextInput
                style={{ width: "100%" }}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Enter your password"
            />
            <Button
                mode="contained"
                style={{ width: "100%", padding: 5 }}
                onPress={attemptLogin}
            >
                Login
            </Button>
        </View>
    );
}

