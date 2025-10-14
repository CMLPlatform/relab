import { Stack } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { MD3LightTheme, MD3DarkTheme, PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import { ThemeProvider, DefaultTheme as RNLight, DarkTheme as RNDark } from '@react-navigation/native';

import { useColorScheme } from 'react-native';
import { setBackgroundColorAsync } from 'expo-system-ui';
import lightTheme from '../assets/themes/light';
import darkTheme from '../assets/themes/dark';
import { DialogProvider } from '@/components/common/DialogProvider';

setBackgroundColorAsync('black');

export default function RootLayout() {
  return (
    <Providers>
      <Stack
      // screenOptions={{
      //     animation: "slide_from_right",
      //     contentStyle: { backgroundColor: 'black'}
      // }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="(tabs)"
          options={{
            title: 'ReLab.',
            headerTitleStyle: {
              fontWeight: 'bold',
              fontSize: 34,
              color: lightTheme.colors.onPrimary,
            },
            headerStyle: {
              backgroundColor: lightTheme.colors.primary,
            },
          }}
        />

        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/new_account" options={{ headerShown: false }} />

        <Stack.Screen name="products/[id]/camera" options={{ headerShown: false }} />
        <Stack.Screen name="products/[id]/category_selection" options={{ title: 'Select Category' }} />
        <Stack.Screen name="products/[id]/brand_selection" options={{ title: 'Select Brand' }} />
      </Stack>
    </Providers>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();

  const theme =
    colorScheme === 'light'
      ? { ...MD3LightTheme, colors: lightTheme.colors }
      : { ...MD3DarkTheme, colors: darkTheme.colors };
  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: RNLight,
    reactNavigationDark: RNDark,
    materialLight: theme,
    materialDark: theme,
  });

  return (
    <PaperProvider theme={theme}>
      <ThemeProvider value={colorScheme === 'light' ? LightTheme : DarkTheme}>
        <KeyboardProvider>
          <DialogProvider>{children}</DialogProvider>
        </KeyboardProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}
