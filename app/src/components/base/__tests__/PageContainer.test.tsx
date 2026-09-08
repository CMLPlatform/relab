import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PageContainer } from '@/components/base/PageContainer';
import { queryAllHostsByProps } from '@/test-utils/index';

test('renders children', async () => {
  await render(
    <PageContainer>
      <Text>content</Text>
    </PageContainer>,
  );
  expect(screen.getByText('content')).toBeOnTheScreen();
});

test('fullBleed renders children without the width-constrained wrapper', async () => {
  await render(
    <PageContainer fullBleed>
      <Text>hero</Text>
    </PageContainer>,
  );
  expect(screen.getByText('hero')).toBeOnTheScreen();
  expect(screen.queryByTestId('page-container-constrained')).toBeNull();
});

test('phoneFullBleed keeps the constrained (centered, max-width) wrapper', async () => {
  // Distinct from fullBleed: it only drops the phone gutter, so it must still
  // render the width-constrained wrapper (desktop centering is preserved).
  await render(
    <PageContainer phoneFullBleed>
      <Text>list</Text>
    </PageContainer>,
  );
  expect(screen.getByText('list')).toBeOnTheScreen();
  expect(screen.getByTestId('page-container-constrained')).toBeOnTheScreen();
});

test('the constrained column is the main landmark; fullBleed is not', async () => {
  await render(
    <>
      <PageContainer fullBleed>
        <Text>hero</Text>
      </PageContainer>
      <PageContainer>
        <Text>body</Text>
      </PageContainer>
    </>,
  );
  // Exactly one main per screen, even when a fullBleed strip sits beside it.
  const mains = queryAllHostsByProps({ role: 'main' });
  expect(mains).toHaveLength(1);
  expect(mains[0]).toBe(screen.getByTestId('page-container-constrained'));
});
