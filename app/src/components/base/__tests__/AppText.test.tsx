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

test('default color comes from the text-foreground class', () => {
  render(<AppText>plain</AppText>);
  expect(screen.getByText('plain').props.className).toContain('text-foreground');
});

test('caller color classes win over the default (tailwind-merge)', () => {
  render(<AppText className="text-primary">tinted</AppText>);
  const className = screen.getByText('tinted').props.className;
  expect(className).toContain('text-primary');
  expect(className).not.toContain('text-foreground');
});
