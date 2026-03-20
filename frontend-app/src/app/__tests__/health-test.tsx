import { render } from '@testing-library/react-native';
import HealthScreen from '../health';

describe('<HealthScreen />', () => {
  test('Text renders ok on health screen', () => {
    const { getByText } = render(<HealthScreen />);

    expect(getByText('ok')).toBeTruthy();
  });
});
