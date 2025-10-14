import {useRouter} from "expo-router";
import {useState} from "react";
import {View} from "react-native";
import {Button, TextInput, Text, IconButton} from "react-native-paper";

import { register, login } from "@/services/api/authentication";



export default function NewAccount() {
    // Hooks
    const router = useRouter();

    // States
    const [section, setSection] = useState<"username" | "email" | "password">("username");

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // Functions
    const createAccount = async () => {
        const success = await register(username, email, password);
        if (!success) {
            alert("Account creation failed. Please try again.");
            return;
        }
        const loginSuccess = await login(email, password);
        if (!loginSuccess) {
            alert("Login failed. Please try logging in manually.");
            router.replace("/login");
            return;
        }
        router.navigate("/products");
    }

    // Render
    if (section === "username"){
        return (
            <View style={{ flex: 1, padding: 20}}>
                    <Text
                        style={{
                            marginTop: 80,
                            fontSize: 40,
                            marginLeft: 5,
                        }}
                    >
                        {"Welcome to"}
                    </Text>
                    <Text
                        style={{
                            fontSize: 80,
                            fontWeight: "bold",
                        }}
                    >
                        {"ReLab."}
                    </Text>
                    <Text
                        style={{
                            fontSize: 31,
                            marginTop: 80,
                            marginLeft: 5,
                            marginBottom: 40,
                        }}
                    >
                        {"Who are you?"}
                    </Text>

                    <View style={{flexDirection: "row"}}>
                        <TextInput
                            style={{flex: 1, marginRight: 10}}
                            mode={"outlined"}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder="Username"
                        />
                        <IconButton
                            icon="chevron-right"
                            size={30}
                            disabled={username.length === 0}
                            onPress={() => setSection("email")}
                        />
                    </View>
                    <Button
                        style={{position: "absolute", bottom: 20, right: 20}}
                        onPress={() => {router.dismissTo("/login")}}
                    >
                        I already have an account
                    </Button>
            </View>
        );
    }
    if (section === "email"){
        return (
            <View style={{ flex: 1, padding: 20}}>
                <Text
                    style={{
                        marginTop: 80,
                        fontSize: 40,
                        marginLeft: 5,
                    }}
                >
                    {"Hi"}
                </Text>
                <Text
                    style={{
                        fontSize: 80,
                        fontWeight: "bold",
                    }}
                >
                    {username + "."}
                </Text>
                <Text
                    style={{
                        fontSize: 31,
                        marginTop: 80,
                        marginLeft: 5,
                        marginBottom: 40,
                    }}
                >
                    {"How do we reach you?"}
                </Text>

                <View style={{flexDirection: "row"}}>
                    <TextInput
                        style={{flex: 1, marginRight: 10}}
                        mode={"outlined"}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="Email address"/>
                    <IconButton
                        icon="chevron-right"
                        size={30}
                        disabled={email.length === 0}
                        onPress={() => setSection("password")}
                    />
                </View>


                <Button
                    style={{position: "absolute", bottom: 20, right: 20}}
                    onPress={() => {router.dismissTo("/login")}}
                >
                    I already have an account
                </Button>
            </View>
        );
    }

    if (section === "password"){
        return (
            <View style={{ flex: 1, padding: 20}}>
                <Text
                    style={{
                        marginTop: 80,
                        fontSize: 40,
                        marginLeft: 5,
                    }}
                >
                    {"Finally,"}
                </Text>
                <Text
                    style={{
                        fontSize: 80,
                        fontWeight: "bold",
                    }}
                >
                    {username + "."}
                </Text>
                <Text
                    style={{
                        fontSize: 31,
                        marginTop: 80,
                        marginLeft: 5,
                        marginBottom: 40,
                    }}
                >
                    {"How will you log in?"}
                </Text>

                <View style={{flexDirection: "row"}}>
                    <TextInput
                        style={{flex: 1, marginRight: 10}}
                        mode={"outlined"}
                        value={password}
                        onChangeText={setPassword}
                        autoCapitalize="none"
                        secureTextEntry
                        placeholder="Password"
                    />
                    <IconButton
                        icon="chevron-right"
                        size={30}
                        disabled={password.length === 0}
                        onPress={createAccount}
                    />
                </View>


                <Button
                    style={{position: "absolute", bottom: 20, right: 20}}
                    onPress={() => {router.dismissTo("/login")}}
                >
                    I already have an account
                </Button>
            </View>
        );
    }
}

