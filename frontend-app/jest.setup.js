// jest.setup.js - Jest configuration for Expo/React Native testing

// Polyfill structuredClone for older Node versions or environments
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };
}

// Mock Expo's import meta registry
global.__ExpoImportMetaRegistry = {
  register: jest.fn(),
};

// Suppress console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  usePathname: jest.fn(() => '/'),
  useSegments: jest.fn(() => []),
  Link: 'Link',
  Redirect: 'Redirect',
  Stack: 'Stack',
  Tabs: 'Tabs',
}));

// Mock expo modules
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
  ImageBackground: 'ImageBackground',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock('expo-camera', () => ({
  Camera: 'Camera',
  CameraType: {},
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native/Libraries/Components/View/View');
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn(),
    Directions: {},
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// Mock validator
jest.mock('validator', () => ({
  isEmail: jest.fn((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  isURL: jest.fn(() => true),
  isNumeric: jest.fn((value) => !isNaN(parseFloat(value)) && isFinite(value)),
}));

// Mock react-native-paper
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TextInput: RNTextInput } = require('react-native');

  return {
    Provider: ({ children }) => children,
    DefaultTheme: {},
    DarkTheme: {},
    useTheme: () => ({
      colors: {
        primary: '#6200ee',
        background: '#ffffff',
        surface: '#ffffff',
        error: '#b00020',
        text: '#000000',
        onSurface: '#000000',
        disabled: 'rgba(0, 0, 0, 0.26)',
        placeholder: 'rgba(0, 0, 0, 0.54)',
        backdrop: 'rgba(0, 0, 0, 0.5)',
        notification: '#f50057',
        primaryContainer: '#f0e6ff',
        secondaryContainer: '#e8e8e8',
        onPrimary: '#ffffff',
        onPrimaryContainer: '#21005e',
        onErrorContainer: '#410e0b',
        errorContainer: '#f9dedc',
        surfaceVariant: '#e7e0ec',
      },
    }),
    Button: ({ children, onPress, ...props }) =>
      React.createElement(View, { onPress, testID: 'button', ...props },
        React.createElement(Text, {}, children)),
    TextInput: (props) => React.createElement(RNTextInput, props),
    Card: ({ children, ...props }) => React.createElement(View, props, children),
    'Card.Content': ({ children, ...props }) => React.createElement(View, props, children),
    ActivityIndicator: (props) => React.createElement(View, { testID: 'activity-indicator', ...props }),
    AnimatedFAB: ({ label, onPress, ...props }) =>
      React.createElement(View, { onPress, testID: 'animated-fab', ...props },
        React.createElement(Text, {}, label)),
    Searchbar: (props) => React.createElement(RNTextInput, props),
    SegmentedButtons: ({ buttons, value, onValueChange, ...props }) =>
      React.createElement(View, props,
        buttons.map((btn) =>
          React.createElement(View, {
            key: btn.value,
            onPress: () => onValueChange(btn.value),
            testID: `segmented-button-${btn.value}`
          }, React.createElement(Text, {}, btn.label))
        )
      ),
    IconButton: ({ icon, onPress, ...props }) =>
      React.createElement(View, { onPress, testID: `icon-button-${icon}`, ...props }),
    Icon: ({ source, ...props }) => React.createElement(Text, props, source),
  };
});

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
  MaterialIcons: 'MaterialIcons',
  FontAwesome: 'FontAwesome',
  Ionicons: 'Ionicons',
}));

// Set test environment
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
