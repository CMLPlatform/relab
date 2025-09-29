import { Stack } from "expo-router";

export default function RootLayout() {
  return (
      <Stack>
        <Stack.Screen name="(tabs)" options={{headerShown: false}}/>
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }}/>
      </Stack>
  );
}
