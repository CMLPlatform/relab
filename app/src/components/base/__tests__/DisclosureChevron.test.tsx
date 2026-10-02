import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DisclosureChevron } from '@/components/base/DisclosureChevron';

const turn = () => {
  const tree = screen.toJSON();
  if (!tree || Array.isArray(tree)) throw new Error('expected one root');
  return StyleSheet.flatten(tree.props.style).transform;
};

test('points right while collapsed and down while expanded', async () => {
  await render(<DisclosureChevron expanded={false} size={20} color="#000" />);
  expect(turn()).toEqual([{ rotate: '0deg' }]);

  await screen.rerender(<DisclosureChevron expanded size={20} color="#000" />);
  expect(turn()).toEqual([{ rotate: '90deg' }]);
});
