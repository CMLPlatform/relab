// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

// Environment variable validation at build time
function validateEnvVars() {
  const requiredVars = {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_MKDOCS_URL: process.env.EXPO_PUBLIC_MKDOCS_URL,
    EXPO_PUBLIC_APP_URL: process.env.EXPO_PUBLIC_APP_URL,
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

  console.log('✅ All required environment variables are present');
  return requiredVars;
}

// Validate environment variables during build
validateEnvVars();

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// config.resolver.sourceExts.push('mjs');

module.exports = config;
