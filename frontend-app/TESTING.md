# Testing Documentation

This document provides information about the testing setup for the ReLab frontend-app.

## Testing Stack

- **Jest**: JavaScript testing framework
- **jest-expo**: Expo-specific Jest preset
- **@testing-library/react-native**: Testing utilities for React Native components
- **@testing-library/jest-native**: Additional matchers for React Native (deprecated, but still functional)
- **react-test-renderer**: React renderer for testing

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Structure

Tests are organized alongside the code they test in `__tests__` directories:

```
src/
├── components/
│   ├── base/
│   │   ├── __tests__/
│   │   │   ├── Text.test.tsx
│   │   │   ├── Chip.test.tsx
│   │   │   └── LocalizedFloatInput.test.tsx
│   │   ├── Text.tsx
│   │   ├── Chip.tsx
│   │   └── LocalizedFloatInput.tsx
│   ├── common/
│   │   ├── __tests__/
│   │   │   ├── ProductCard.test.tsx
│   │   │   └── CPVCard.test.tsx
│   │   └── ...
│   └── product/
│       ├── __tests__/
│       │   ├── ProductDescription.test.tsx
│       │   └── ProductTags.test.tsx
│       └── ...
├── services/
│   └── api/
│       ├── __tests__/
│       │   └── authentication.test.ts
│       └── validation/
│           └── __tests__/
│               └── product.test.ts
└── app/
    ├── (auth)/
    │   └── __tests__/
    │       └── login.test.tsx
    └── (tabs)/
        └── __tests__/
            └── products.test.tsx
```

## Test Coverage

The test suite covers:

### Base Components
- **Text**: Theme-aware text component
- **Chip**: Interactive chip component with error states
- **LocalizedFloatInput**: Localized number input with validation

### Common Components
- **ProductCard**: Product list item with navigation
- **CPVCard**: CPV category card component

### Product Components
- **ProductDescription**: Editable product description
- **ProductTags**: Brand and model tags with edit functionality

### Services
- **authentication**: Login, logout, token management, user fetching
- **validation/product**: Product name and data validation

### Pages
- **login**: Authentication page with form validation
- **products**: Product list with filtering and search

## Mocking Strategy

### External Dependencies

The following are mocked in `jest.setup.js`:

- `@react-native-async-storage/async-storage`
- `expo-router`
- `expo-linear-gradient`
- `expo-image`
- `expo-haptics`
- `expo-camera`
- `expo-image-picker`
- `expo-image-manipulator`
- `react-native-reanimated`
- `react-native-gesture-handler`
- `react-native-safe-area-context`
- `validator`

### Test-Specific Mocks

Individual tests may mock:
- API calls using `global.fetch`
- Component-specific dependencies
- Router and dialog providers

## Writing Tests

### Example: Component Test

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    const { getByText } = render(<MyComponent />);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('should handle press events', () => {
    const onPress = jest.fn();
    const { getByText } = render(<MyComponent onPress={onPress} />);

    fireEvent.press(getByText('Button'));
    expect(onPress).toHaveBeenCalled();
  });
});
```

### Example: Service Test

```tsx
import { myService } from '../myService';

// Mock fetch
global.fetch = jest.fn();

describe('myService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch data successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    const result = await myService();
    expect(result).toEqual({ data: 'test' });
  });
});
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Clear Assertions**: Use descriptive test names and clear assertions
3. **Mock External Dependencies**: Mock API calls, navigation, and other external dependencies
4. **Clean Up**: Use `beforeEach` and `afterEach` to reset state
5. **Test User Behavior**: Focus on testing what users see and do, not implementation details
6. **Coverage Goals**: Aim for at least 80% code coverage for critical paths

## Troubleshooting

### Common Issues

1. **Module not found errors**: Ensure the module is mocked in `jest.setup.js`
2. **Async timing issues**: Use `waitFor` from `@testing-library/react-native`
3. **Mock not working**: Check mock is defined before the import
4. **Reanimated errors**: Make sure `react-native-reanimated/mock` is properly configured

### Debug Tests

To debug a specific test:

```bash
# Run a specific test file
npm test -- ProductCard.test.tsx

# Run in watch mode for a specific file
npm run test:watch -- ProductCard.test.tsx

# Run with verbose output
npm test -- --verbose
```

## CI/CD Integration

Tests should be run as part of the CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test

- name: Upload coverage
  run: npm run test:coverage
```

## Future Improvements

- [ ] Add snapshot testing for complex UI components
- [ ] Add integration tests for complete user flows
- [ ] Add visual regression testing
- [ ] Increase test coverage to 90%
- [ ] Add performance testing for critical paths
