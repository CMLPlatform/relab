import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Searchbar } from '@/components/base/Searchbar';

describe('Searchbar', () => {
  it('reports text changes', () => {
    const onChangeText = jest.fn();
    render(<Searchbar value="" onChangeText={onChangeText} placeholder="Search products" />);
    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'drill');
    expect(onChangeText).toHaveBeenCalledWith('drill');
  });

  it('shows a clear button when there is a query, and clears it on press', () => {
    const onChangeText = jest.fn();
    render(<Searchbar value="drill" onChangeText={onChangeText} placeholder="Search" />);
    fireEvent.press(screen.getByLabelText('Clear search'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('omits the clear button when the query is empty', () => {
    render(<Searchbar value="" onChangeText={jest.fn()} placeholder="Search" />);
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('shows a loading spinner instead of the clear button while loading', () => {
    render(<Searchbar value="drill" onChangeText={jest.fn()} placeholder="Search" loading />);
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });
});
