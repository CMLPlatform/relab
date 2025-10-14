import AsyncStorage from "@react-native-async-storage/async-storage";
import { User } from "@/types/User";

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;
let token: string | undefined;
let user: User | undefined;

export async function login(username: string, password: string): Promise<string | undefined> {
  const url = new URL(baseUrl + '/auth/bearer/login');
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams({ username, password }).toString();

  try {
    const response = await fetch(url, { method: 'POST', headers, body });
    let data;
    try {
      data = await response.json();
    } catch (err: any) {
      throw new Error(err.message || 'Unable to parse server response.');
    }
    if (response.status === 400) {
      // NOTE: FastAPI-User implementation of the backend returns 400 on invalid login
      token = undefined;
      return undefined;
    }
    if (!response.ok) {
      // Throw error with HTTP status and message
      throw new Error(`HTTP ${response.status}: ${data?.detail || JSON.stringify(data) || 'Login failed.'}`);
    }
    await AsyncStorage.setItem('username', username);
    await AsyncStorage.setItem('password', password);
    token = data.access_token;
    return token;
  } catch (err: any) {
    console.error('[Login Fetch Error]:', err);
    throw new Error('Unable to reach server. Please try again later.');
  }
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

  try {
    const success = await login(username, password);
    if (!success) {
      return undefined;
    }
    return token;
  } catch (err) {
    console.error('[GetToken Error]:', err);
    return undefined;
  }
}

export async function getUser(): Promise<User | undefined> {
  try {
    if (user) {
      return user;
    }

    const url = new URL(baseUrl + '/users/me');
    const authToken = await getToken();
    if (!authToken) {
      return undefined;
    }

    const headers = { Authorization: `Bearer ${authToken}`, Accept: 'application/json' };
    const response = await fetch(url, { method: 'GET', headers });

    let data;
    try {
      data = await response.json();
    } catch (jsonErr) {
      console.error('[GetUser Fetch Error]: Unable to parse server response.', jsonErr);
      return undefined;
    }

    if (!response.ok) {
      console.error('[GetUser Fetch Error]:', data);
      return undefined;
    }

    user = {
        id: data.id,
        email: data.email,
        isActive: data.is_active,
        isSuperuser: data.is_superuser,
        isVerified: data.is_verified,
        username: data.username || "Username not defined",
    };

    return user;
  } catch (error) {
    console.error('[GetUser Fetch Error]:', error);
    return undefined;
  }
}

export async function register(
    username: string,
    email: string,
    password: string
): Promise<boolean> {
    const url = new URL(baseUrl + "/auth/register");
    const headers = {"Content-Type": "application/json", "Accept": "application/json"}

    const body = {
        username: username,
        email: email,
        password: password
    }

    const response = await fetch(url, {method: "POST", headers: headers, body: JSON.stringify(body)});
    return response.ok;
}

export async function verify(
    email: string,
): Promise<boolean> {
    const url = new URL(baseUrl + "/auth/request-verify-token");
    const headers = {"Content-Type": "application/json", "Accept": "application/json"}

    const body = {
        email: email,
    }

    const response = await fetch(url, {method: "POST", headers: headers, body: JSON.stringify(body)});
    return response.ok;
}
