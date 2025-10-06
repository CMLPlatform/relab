import { Stack } from "expo-router";
import { DialogProvider } from "@/components/common/DialogProvider";
import { KeyboardProvider } from 'react-native-keyboard-controller';

export default function RootLayout() {
  return (
      <KeyboardProvider>
          <DialogProvider>
              <Stack>
                  <Stack.Screen name="index" options={{headerShown: false}}/>
                  <Stack.Screen name="(tabs)" options={{headerShown: false}}/>

                  <Stack.Screen name="(auth)/login" options={{ headerShown: false }}/>

                  <Stack.Screen name="products/[id]/camera" options={{ headerShown: false }}/>
                  <Stack.Screen name="products/[id]/category_selection" options={{ title: "Select Category" }}/>
                  <Stack.Screen name="products/[id]/brand_selection" options={{ title: "Select Brand" }}/>
              </Stack>
          </DialogProvider>
      </KeyboardProvider>
  );
}
