import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { ProfileAction } from '@/components/profile/shared';
import { renderWithProviders } from '@/test-utils/index';

describe('ProfileAction', () => {
  it('names the row after its title and subtitle together', async () => {
    await renderWithProviders(
      <ProfileAction title="Google" subtitle="Linked as a@b.c" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Google, Linked as a@b.c' })).toBeOnTheScreen();
  });

  it('uses the title alone when there is no subtitle', async () => {
    await renderWithProviders(<ProfileAction title="Log out" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeOnTheScreen();
  });
});
