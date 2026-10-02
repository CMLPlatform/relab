import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
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
  expect(screen.getByLabelText('Components').props['aria-current']).toBe('location');
  expect(screen.getByLabelText('Overview').props['aria-current']).toBeUndefined();
  // aria-current has no native mapping; selected carries the cue to screen readers.
  expect(screen.getByRole('button', { name: 'Components', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Overview', selected: false })).toBeOnTheScreen();
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

test('scrolls the chip row when the active section changes', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo' as never);
  const props = { isLg: false, navSections: [...sections], onPressSection: jest.fn() };
  const { rerender } = await render(
    <SectionNavLayout {...props} activeKey="overview">
      {null}
    </SectionNavLayout>,
  );
  await fireEvent(screen.getByLabelText('Components'), 'layout', {
    nativeEvent: { layout: { x: 200, y: 0, width: 80, height: 44 } },
  });
  scrollTo.mockClear();
  await rerender(
    <SectionNavLayout {...props} activeKey="components">
      {null}
    </SectionNavLayout>,
  );
  expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ x: 176 }));
});

// Plain words: body in the desktop outline, caption in the phone chip row; never tracked.
test.each([
  [true, 16],
  [false, 13],
])('sets nav labels untracked (isLg=%s → %spx)', async (isLg, fontSize) => {
  await render(
    <SectionNavLayout
      isLg={isLg}
      navSections={[...sections]}
      activeKey="overview"
      onPressSection={jest.fn()}
    >
      {null}
    </SectionNavLayout>,
  );
  const label = screen.getByText('Overview');
  expect(label).toHaveStyle({ fontSize });
  expect(label).not.toHaveStyle({ letterSpacing: expect.any(Number) });
});
