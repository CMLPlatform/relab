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

test('fires onPressSection with the section key', async () => {
  const onPressSection = jest.fn();
  await render(
    <SectionNavLayout
      isLg={false}
      navSections={[...sections]}
      activeKey="overview"
      onPressSection={onPressSection}
    >
      {null}
    </SectionNavLayout>,
  );
  await fireEvent.press(screen.getByText('Components'));
  expect(onPressSection).toHaveBeenCalledWith('components');
});

test('marks the active item for accessibility', async () => {
  await render(
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
  expect(screen.getByLabelText('Components').props['aria-current']).toBe('page');
  expect(screen.getByLabelText('Overview').props['aria-current']).toBeUndefined();
});

test('has web hover, cursor, and focus-visible affordances', async () => {
  mockPlatform('web');
  await render(
    <SectionNavLayout
      isLg={false}
      navSections={[...sections]}
      activeKey="overview"
      onPressSection={jest.fn()}
    >
      {null}
    </SectionNavLayout>,
  );
  const className = screen.getByLabelText('Overview').props.className;
  expect(className).toEqual(expect.stringContaining('cursor-pointer'));
  expect(className).toEqual(expect.stringContaining('hover:'));
  expect(className).toEqual(expect.stringContaining('focus-visible:'));
});

test('on web, a focused chip scrolls itself into view in the chip row', async () => {
  mockPlatform('web');
  await render(
    <SectionNavLayout
      isLg={false}
      navSections={[...sections]}
      activeKey="overview"
      onPressSection={jest.fn()}
    >
      {null}
    </SectionNavLayout>,
  );
  const scrollIntoView = jest.fn();
  await fireEvent(screen.getByLabelText('Components'), 'focus', {
    currentTarget: { scrollIntoView },
  });
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
});
