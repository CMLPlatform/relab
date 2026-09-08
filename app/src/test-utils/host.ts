import { screen } from '@testing-library/react-native';

type HostElement = ReturnType<typeof screen.getByTestId>;

/**
 * Host-element lookups for the cases RNTL v14 removed.
 *
 * v14 renders host elements only, so the `UNSAFE_*ByType` / `UNSAFE_*ByProps`
 * queries that could return composite components are gone. Where a test asserts
 * on something with no accessible handle — an icon's stroke width, a list's
 * paging threshold — these query the rendered tree by host name instead. React
 * Native's host names are not the component names: a `FlatList` is
 * `RCTScrollView`, an `Svg` is `RNSVGSvgView`, a `View` and a `TextInput` keep
 * theirs.
 *
 * Prefer an accessible query (`getByRole`, `getByLabelText`, `getByText`) when
 * one exists; reach for these only when the assertion is about a prop the user
 * cannot see.
 */
function hosts(): HostElement[] {
  return screen.container.queryAll((el) => typeof el.type === 'string') as HostElement[];
}

/** Every host element rendered under the given host name. */
export function queryAllHostsByType(type: string): HostElement[] {
  return hosts().filter((el) => el.type === type);
}

/** The single host element with the given host name; throws if not exactly one. */
export function getHostByType(type: string): HostElement {
  const found = queryAllHostsByType(type);
  if (found.length !== 1) {
    throw new Error(`Expected exactly one <${type}> host element, found ${found.length}`);
  }
  return found[0] as HostElement;
}

/** The first host element carrying every one of `props`, or null. */
export function queryHostByProps(props: Record<string, unknown>): HostElement | null {
  const match = hosts().find((el) =>
    Object.entries(props).every(
      ([key, value]) => (el.props as Record<string, unknown>)[key] === value,
    ),
  );
  return match ?? null;
}

/** Every host element carrying all of `props`. */
export function queryAllHostsByProps(props: Record<string, unknown>): HostElement[] {
  return hosts().filter((el) =>
    Object.entries(props).every(
      ([key, value]) => (el.props as Record<string, unknown>)[key] === value,
    ),
  );
}
