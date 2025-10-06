import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

export default function RegisterScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          username: username || null,
        }),
        credentials: 'include',
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
      } else {
        const data = await response.json();
        let errorMessage = 'Registration failed';

        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (typeof data.detail === 'object') {
            if (data.detail.reason) {
              errorMessage = data.detail.reason;
            } else if (data.detail.code) {
              errorMessage = `Error code: ${data.detail.code}`;
            }
          }
        } else if (data.code && data.reason) {
          errorMessage = data.reason;
        }

        setError(errorMessage);
        console.error('Registration error:', data);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Register</Text>

          {!success ? (
            <>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                disabled={isLoading}
              />

              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                disabled={isLoading}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />

              <TextInput
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                disabled={isLoading}
              />

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleRegister}
                loading={isLoading}
                disabled={isLoading || !email || !password}
              >
                Register
              </Button>

              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <Button mode="text" onPress={() => router.push('/')}>
                  Homepage
                </Button>
                <Button mode="text" onPress={() => router.push('/login')}>
                  Back to Login
                </Button>
              </View>
            </>
          ) : (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <Text variant="bodyLarge" style={{ color: theme.colors.primary, textAlign: 'center' }}>
                Registration successful! Please check your email for verification.
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}
