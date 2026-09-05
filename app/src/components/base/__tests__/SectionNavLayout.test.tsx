import { fireEvent, render, screen } from '@testing-library/react-native';
import { SectionNavLayout } from '@/components/base/SectionNavLayout';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

const sections = [
  { key: 'overview', label: 'Overview' },
  { key: 'components', label: 'Components' },
] as const;

afterEach(() => {
  restorePlatform();
});

test('fires onPressSection with the section key', () => {
  const onPressSection = jest.fn();
  render(
    <SectionNavLayout
      isLg={false}
      navSections={[...sections]}
      activeKey="overview"
      onPressSection={onPressSection}
    >
      {null}
    </SectionNavLayout>,
  );
  fireEvent.press(screen.getByText('Components'));
  expect(onPressSection).toHaveBeenCalledWith('components');
});

test('marks the active item for accessibility', () => {
  render(
    <SectionNavLayout
      isLg={true}
      navSections={[...sections]}
      activeKey="components"
      onPressSection={jest.fn()}
    >
      {null}
    </SectionNavLayout>,
  );
  expect(screen.getByText('Components').parent).toBeTruthy();
  expect(screen.getByLabelText('Components, current section')).toBeOnTheScreen();
});

test('has web hover, cursor, and focus-visible affordances', () => {
  mockPlatform('web');
  render(
    <SectionNavLayout
      isLg={false}
      navSections={[...sections]}
      activeKey="overview"
      onPressSection={jest.fn()}
    >
      {null}
    </SectionNavLayout>,
  );
  const className = screen.getByLabelText('Overview, current section').props.className;
  expect(className).toEqual(expect.stringContaining('cursor-pointer'));
  expect(className).toEqual(expect.stringContaining('hover:'));
  expect(className).toEqual(expect.stringContaining('focus-visible:'));
});
