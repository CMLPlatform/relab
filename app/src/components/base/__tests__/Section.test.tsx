import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Section } from '@/components/base/Section';

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
