import { Stack } from "expo-router";
import { DialogProvider } from "@/components/common/DialogProvider";
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {MD3LightTheme, MD3DarkTheme, PaperProvider, adaptNavigationTheme} from 'react-native-paper';
import {ThemeProvider, DefaultTheme as RNLight, DarkTheme as RNDark} from "@react-navigation/native";


import lightTheme from '../assets/themes/light'
import darkTheme from '../assets/themes/dark'
import {useColorScheme} from "react-native";


export default function RootLayout() {
    return (
      <Providers>
          <Stack>
              <Stack.Screen name="index" options={{headerShown: false}}/>
              <Stack.Screen name="(tabs)" options={{title: "ReLab."}}/>

              <Stack.Screen name="(auth)/login" options={{ headerShown: false }}/>
              <Stack.Screen name="(auth)/new_account" options={{ headerShown: false }}/>

              <Stack.Screen name="products/[id]/camera" options={{ headerShown: false }}/>
              <Stack.Screen name="products/[id]/category_selection" options={{ title: "Select Category" }}/>
              <Stack.Screen name="products/[id]/brand_selection" options={{ title: "Select Brand" }}/>
          </Stack>
      </Providers>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
    const colorScheme = useColorScheme();

    const theme =
        colorScheme === 'light'
            ? { ...MD3LightTheme, colors: lightTheme.colors}
            : { ...MD3DarkTheme, colors: darkTheme.colors}
    ;

    const { LightTheme, DarkTheme } = adaptNavigationTheme({
        reactNavigationLight: RNLight,
        reactNavigationDark: RNDark,
        materialLight: theme,
        materialDark: theme
    });
    console.log(LightTheme)
    console.log(DarkTheme)

    return (
        // <PaperProvider theme={theme}>
        //     <ThemeProvider value={colorScheme === "light" ? LightTheme : DarkTheme}>
                <KeyboardProvider>
                    <DialogProvider>
                        {children}
                    </DialogProvider>
                </KeyboardProvider>
        //     </ThemeProvider>
        // </PaperProvider>
    );
}