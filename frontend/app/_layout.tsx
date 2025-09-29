import { Stack } from "expo-router";

export default function RootLayout() {
  return (
      <Stack>
          <Stack.Screen name="index" options={{headerShown: false}}/>
          <Stack.Screen name="(tabs)" options={{headerShown: false}}/>

          <Stack.Screen name="(auth)/login" options={{ headerShown: false }}/>

          <Stack.Screen name="products/[id]/camera" options={{ headerShown: false }}/>
          <Stack.Screen name="products/[id]/category_selection" options={{ title: "Select Category" }}/>
          <Stack.Screen name="products/[id]/brand_selection" options={{ title: "Select Brand" }}/>
      </Stack>
  );
}
