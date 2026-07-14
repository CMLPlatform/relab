import { render, screen } from '@testing-library/react-native';
import { AppText } from '@/components/base/AppText';

test('renders body text by default', () => {
  render(<AppText>hello</AppText>);
  expect(screen.getByText('hello')).toBeOnTheScreen();
});

test('data variant uses tabular numerals styling', () => {
  render(<AppText variant="data">42 g</AppText>);
  const el = screen.getByText('42 g');
  expect(el.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ fontVariant: ['tabular-nums'] })]),
  );
});
