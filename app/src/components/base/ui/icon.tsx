import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { styled } from 'nativewind';
import * as React from 'react';
import { TextClassContext } from '@/components/base/ui/text';
import { cn } from '@/utils/cn';

type IconProps = LucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

// nativewind 5 (react-native-css) replaced cssInterop's in-place registration with
// `styled`, which wraps the component instead of mutating it. Same className -> style
// -> size-prop mapping as the original RNR template, adapted to the new call shape.
const StyledIconImpl = styled(IconImpl, {
  className: {
    target: 'style',
    // @ts-expect-error nativewind 5's stricter dot-path inference can't resolve
    // LucideProps['style'] as a mappable object here; the mapping is functionally
    // identical to the original cssInterop config and correct at runtime.
    nativeStyleToProp: {
      height: 'size',
      width: 'size',
    },
  },
});

/**
 * A wrapper component for Lucide icons with Nativewind `className` support via `cssInterop`.
 *
 * This component allows you to render any Lucide icon while applying utility classes
 * using `nativewind`. It avoids the need to wrap or configure each icon individually.
 *
 * @component
 * @example
 * ```tsx
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/registry/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 * ```
 *
 * @param {LucideIcon} as - The Lucide icon component to render.
 * @param {string} className - Utility classes to style the icon using Nativewind.
 * @param {number} size - Icon size (defaults to 14).
 * @param {...LucideProps} ...props - Additional Lucide icon props passed to the "as" icon.
 */
function Icon({ as: IconComponent, className, size = 14, ...props }: IconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <StyledIconImpl
      as={IconComponent}
      className={cn('text-foreground', textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };
