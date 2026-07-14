import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PageContainer } from '@/components/base/PageContainer';

test('renders children', () => {
  render(
    <PageContainer>
      <Text>content</Text>
    </PageContainer>,
  );
  expect(screen.getByText('content')).toBeOnTheScreen();
});

test('fullBleed renders children without the width-constrained wrapper', () => {
  render(
    <PageContainer fullBleed>
      <Text>hero</Text>
    </PageContainer>,
  );
  expect(screen.getByText('hero')).toBeOnTheScreen();
  expect(screen.queryByTestId('page-container-constrained')).toBeNull();
});
