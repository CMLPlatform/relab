import AsyncStorage from "@react-native-async-storage/async-storage";
import { User } from "@/types/User";

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;
let token: string | undefined;
let user: User | undefined;

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

export async function logout(): Promise<void> {
    token = undefined;
    user = undefined;
    await AsyncStorage.removeItem("username");
    await AsyncStorage.removeItem("password");
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

export async function getUser(): Promise<User | undefined> {
    if (user) {return user;}

    const url = new URL(baseUrl + "/users/me");
    const authToken = await getToken();
    if (!authToken) { return undefined; }

    const headers = {"Authorization": `Bearer ${authToken}`, "Accept": "application/json"}

    const response = await fetch(url, {method: "GET", headers: headers});
    if (!response.ok) { return undefined; }

    const data = await response.json();

    user = {
        id: data.id,
        email: data.email,
        isActive: data.is_active,
        isSuperuser: data.is_superuser,
        username: data.username || "Username not defined",
    };

    return user;
}
