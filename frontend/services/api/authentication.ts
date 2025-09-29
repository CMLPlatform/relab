import AsyncStorage from "@react-native-async-storage/async-storage";

const baseUrl = "https://api.cml-relab.org"
let token: string | undefined;

export async function login(
    username: string,
    password: string
): Promise<boolean> {
    const url = new URL(baseUrl + "/auth/bearer/login");
    const headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}

    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);

    const response = await fetch(url, {method: "POST", headers: headers, body: body.toString()});
    const data = await response.json();

    if (!response.ok) { return false; }

    await AsyncStorage.setItem("username", username);
    await AsyncStorage.setItem("password", password);

    token = data.access_token;
    return true;
}

export async function getToken(): Promise<string | undefined> {
    if (token) {return token;}

    const username = await AsyncStorage.getItem("username");
    const password = await AsyncStorage.getItem("password");
    if (!username || !password) {return undefined;}

    const success = await login(username, password);
    if (!success) {return undefined;}

    return token;
}

