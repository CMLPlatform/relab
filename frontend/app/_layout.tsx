import { Stack } from "expo-router";
import { DialogProvider } from "@/components/common/DialogProvider";
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
    MD3LightTheme as DefaultTheme,
    PaperProvider, useTheme,
} from 'react-native-paper';

import customTheme from '../assets/themes/light'

const theme = {
    ...DefaultTheme,
    ...customTheme,
    colors: {
        ...DefaultTheme.colors,
        ...customTheme.colors,
    },
    roundness: 1,
};


export default function RootLayout() {
  return (
      <PaperProvider theme={theme}>
          <KeyboardProvider>
              <DialogProvider>

                  <Stack>
                      <Stack.Screen name="index" options={{headerShown: false}}/>
                      <Stack.Screen name="(tabs)" options={{title: "ReLab."}}/>

                      <Stack.Screen name="(auth)/login" options={{ headerShown: false }}/>

                      <Stack.Screen name="products/[id]/camera" options={{ headerShown: false }}/>
                      <Stack.Screen name="products/[id]/category_selection" options={{ title: "Select Category" }}/>
                      <Stack.Screen name="products/[id]/brand_selection" options={{ title: "Select Brand" }}/>
                  </Stack>
              </DialogProvider>
          </KeyboardProvider>
      </PaperProvider>
  );
}
