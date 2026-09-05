import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { GoLiveDialog } from '@/components/cameras/GoLiveDialog';
import { renderWithProviders } from '@/test-utils/index';

const baseProps = {
  visible: true,
  cameraName: 'Bench Cam',
  title: '',
  privacy: 'private' as const,
  loading: false,
  onDismiss: jest.fn(),
  onChangeTitle: jest.fn(),
  onChangePrivacy: jest.fn(),
  onStart: jest.fn(),
  secondaryLabel: 'Cancel',
  onSecondary: jest.fn(),
};

describe('GoLiveDialog — visibility toggle group', () => {
  it('renders all three visibility options', () => {
    renderWithProviders(<GoLiveDialog {...baseProps} />);
    expect(screen.getByText('Private')).toBeOnTheScreen();
    expect(screen.getByText('Unlisted')).toBeOnTheScreen();
    expect(screen.getByText('Public')).toBeOnTheScreen();
  });

  it('reports the newly selected visibility', () => {
    const onChangePrivacy = jest.fn();
    renderWithProviders(<GoLiveDialog {...baseProps} onChangePrivacy={onChangePrivacy} />);
    fireEvent.press(screen.getByText('Unlisted'));
    expect(onChangePrivacy).toHaveBeenCalledWith('unlisted');
  });

  it('keeps the current selection when pressing the already-active option', () => {
    const onChangePrivacy = jest.fn();
    renderWithProviders(
      <GoLiveDialog {...baseProps} privacy="private" onChangePrivacy={onChangePrivacy} />,
    );
    fireEvent.press(screen.getByText('Private'));
    expect(onChangePrivacy).not.toHaveBeenCalled();
  });
});
