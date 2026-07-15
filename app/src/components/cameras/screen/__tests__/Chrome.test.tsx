import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CamerasFab } from '@/components/cameras/screen/Chrome';

describe('CamerasFab', () => {
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<CamerasFab visible onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Add camera'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', () => {
    render(<CamerasFab visible={false} onPress={jest.fn()} />);
    expect(screen.queryByLabelText('Add camera')).toBeNull();
  });
});
