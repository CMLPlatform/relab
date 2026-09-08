import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import {
  ProfileAppearanceSection,
  ProfileVisibilitySection,
} from '@/components/profile/Preferences';
import { mockUser, renderWithProviders } from '@/test-utils/index';

// react-native-web drops accessibilityState, so `aria-checked` has to be spelled
// out alongside it or the web build ships radios with no state and no name.
describe('preferences radios', () => {
  it('exposes checked state and a radiogroup on the theme options', async () => {
    await renderWithProviders(
      <ProfileAppearanceSection themeMode="dark" onSetThemeMode={jest.fn()} />,
    );

    expect(screen.getByLabelText('Theme').props.accessibilityRole).toBe('radiogroup');
    // React Native folds `aria-checked` into accessibilityState; the web build's
    // aria-checked attribute is asserted by the axe scan in e2e/accessibility.spec.ts.
    expect(screen.getByLabelText('Dark theme').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByLabelText('Light theme').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('names the visibility options and marks the active one', async () => {
    await renderWithProviders(
      <ProfileVisibilitySection
        profile={mockUser({ preferences: { profile_visibility: 'community' } })}
        visibilitySaving={false}
        onChangeVisibility={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Profile visibility').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByLabelText('Community').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByLabelText('Public').props.accessibilityState).toMatchObject({
      checked: false,
    });
    expect(screen.getByLabelText('Private').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });
});
