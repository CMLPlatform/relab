import { Stack } from "expo-router";
import { DialogProvider } from "@/components/common/DialogProvider";
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {MD3LightTheme, MD3DarkTheme, PaperProvider, adaptNavigationTheme} from 'react-native-paper';
import {ThemeProvider, DarkTheme, DefaultTheme} from "@react-navigation/native";

import lightTheme from '../assets/themes/light'
import darkTheme from '../assets/themes/dark'
import {useColorScheme} from "react-native";




export default function RootLayout() {
    const colorScheme = useColorScheme();

    const theme =
        colorScheme === 'dark'
            ? { ...MD3LightTheme, colors: darkTheme.colors}
            : { ...MD3DarkTheme, colors: lightTheme.colors}
            ;

    const { LightTheme } = adaptNavigationTheme({
        reactNavigationLight: DefaultTheme,
        reactNavigationDark: DefaultTheme,
        materialLight: theme,
        materialDark: theme
    });

    return (
      <PaperProvider theme={theme}>
          <ThemeProvider value={LightTheme}>
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
          </ThemeProvider>
      </PaperProvider>
  );
}
