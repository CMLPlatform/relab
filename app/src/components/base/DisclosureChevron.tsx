import { type ComponentProps, useEffect } from 'react';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from './Icon';

const TURN = { duration: 150, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };

/** A right chevron that turns to point down while its section is open. */
export function DisclosureChevron({
  expanded,
  size,
  color,
}: {
  expanded: boolean;
  size: ComponentProps<typeof Icon>['size'];
  color: string;
}) {
  const turn = useSharedValue(expanded ? 90 : 0);
  useEffect(() => {
    turn.value = withTiming(expanded ? 90 : 0, TURN);
  }, [expanded, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  return (
    <Animated.View style={style}>
      <Icon name="chevron-right" size={size} color={color} />
    </Animated.View>
  );
}
