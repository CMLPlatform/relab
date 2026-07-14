import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Section } from '@/components/base/Section';
import { SectionNavContext } from '@/components/base/SectionNavContext';

const child = <Text>section body</Text>;

test('renders title and children when not empty', () => {
  render(
    <Section title="Physical properties" sectionKey="physical">
      {child}
    </Section>,
  );
  expect(screen.getByText('Physical properties')).toBeOnTheScreen();
  expect(screen.getByText('section body')).toBeOnTheScreen();
});

test('view mode + empty renders nothing', () => {
  render(
    <Section title="Circularity" sectionKey="circularity" isEmpty>
      {child}
    </Section>,
  );
  expect(screen.queryByText('Circularity')).toBeNull();
  expect(screen.queryByText('section body')).toBeNull();
});

test('edit mode + empty shows the add row, expands in place on press', () => {
  render(
    <Section
      title="Circularity"
      sectionKey="circularity"
      isEmpty
      editMode
      addLabel="Add circularity notes"
    >
      {child}
    </Section>,
  );
  expect(screen.queryByText('section body')).toBeNull();
  fireEvent.press(screen.getByText('Add circularity notes'));
  expect(screen.getByText('section body')).toBeOnTheScreen();
});

test('unregisters from the nav registry when it collapses to empty in view mode', () => {
  const registerSection = jest.fn();
  const unregisterSection = jest.fn();
  const nav = {
    registerSection,
    unregisterSection,
    scrollTo: jest.fn(),
    activeKey: 'overview' as const,
  };

  const { rerender } = render(
    <SectionNavContext.Provider value={nav}>
      <Section title="Circularity" sectionKey="circularity">
        {child}
      </Section>
    </SectionNavContext.Provider>,
  );
  expect(screen.getByText('section body')).toBeOnTheScreen();
  expect(unregisterSection).not.toHaveBeenCalled();

  // Context identity churns on every scroll-spy tick (activeKey). A section
  // that stays visible must NOT be unregistered by that churn — onLayout never
  // re-fires, so an unregister here would permanently orphan the section.
  rerender(
    <SectionNavContext.Provider value={{ ...nav, activeKey: 'physical' as const }}>
      <Section title="Circularity" sectionKey="circularity">
        {child}
      </Section>
    </SectionNavContext.Provider>,
  );
  expect(unregisterSection).not.toHaveBeenCalled();

  rerender(
    <SectionNavContext.Provider value={nav}>
      <Section title="Circularity" sectionKey="circularity" isEmpty>
        {child}
      </Section>
    </SectionNavContext.Provider>,
  );

  expect(unregisterSection).toHaveBeenCalledWith('circularity');
});
