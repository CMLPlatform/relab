import { ConfigContext, ExpoConfig } from 'expo/config';

// Environment variable validation
function validateEnvVars() {
  const requiredVars = {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_MKDOCS_URL: process.env.EXPO_PUBLIC_MKDOCS_URL,
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    console.error('Please add these to your .env file:');
    missingVars.forEach((varName) => {
      console.error(`   ${varName}=your_value_here`);
    });
    console.error('');
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return requiredVars;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  // Validate environment variables at build time
  validateEnvVars();

  return {
    ...config,
    name: 'cml-relab-frontend',
    slug: 'cml-relab-frontend',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'cml-relab-frontend',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.cml.relabFrontend',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/maintenance.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
  };
};
