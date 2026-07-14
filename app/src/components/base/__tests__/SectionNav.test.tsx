import { fireEvent, render, screen } from '@testing-library/react-native';
import { SectionNav } from '@/components/base/SectionNav';

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'components', label: 'Components' },
] as const;

test('fires onPress with the section key', () => {
  const onPress = jest.fn();
  render(
    <SectionNav
      sections={[...sections]}
      activeKey="overview"
      onPress={onPress}
      orientation="chips"
    />,
  );
  fireEvent.press(screen.getByText('Components'));
  expect(onPress).toHaveBeenCalledWith('components');
});

test('marks the active item for accessibility', () => {
  render(
    <SectionNav
      sections={[...sections]}
      activeKey="components"
      onPress={jest.fn()}
      orientation="outline"
    />,
  );
  expect(screen.getByText('Components').parent).toBeTruthy();
  expect(screen.getByLabelText('Components, current section')).toBeOnTheScreen();
});
