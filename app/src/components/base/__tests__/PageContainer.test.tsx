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

test('phoneFullBleed keeps the constrained (centered, max-width) wrapper', () => {
  // Distinct from fullBleed: it only drops the phone gutter, so it must still
  // render the width-constrained wrapper (desktop centering is preserved).
  render(
    <PageContainer phoneFullBleed>
      <Text>list</Text>
    </PageContainer>,
  );
  expect(screen.getByText('list')).toBeOnTheScreen();
  expect(screen.getByTestId('page-container-constrained')).toBeOnTheScreen();
});
