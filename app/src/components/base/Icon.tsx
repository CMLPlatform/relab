import {
  ArrowDownUp,
  ArrowLeft,
  Calendar,
  Camera,
  CameraOff,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  CircleUserRound,
  Clock,
  EthernetPort,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Image,
  ImagePlus,
  Images,
  Info,
  Link,
  Lock,
  type LucideIcon,
  MailCheck,
  Minus,
  Package,
  PackageX,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shapes,
  Tag,
  Trash2,
  User,
  UserX,
  VideoOff,
  Weight,
  X,
} from 'lucide-react-native';
import { Path, Svg } from 'react-native-svg';

type BrandGlyphProps = { size?: number; color?: string; strokeWidth?: number };

/** Turns a single-path brand SVG's `d` data into a Lucide-shaped component. */
function createBrandGlyph(d: string) {
  // strokeWidth is accepted-and-ignored: brand marks are filled, not
  // stroked, but the wrapper's call signature stays uniform across glyphs.
  return function BrandGlyph({ size = 24, color = 'currentColor' }: BrandGlyphProps) {
    return (
      <Svg viewBox="0 0 24 24" width={size} height={size}>
        <Path d={d} fill={color} />
      </Svg>
    );
  };
}

// Source: assets/icons/brand/github.svg
const GITHUB_PATH =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

// Source: assets/icons/brand/google.svg
const GOOGLE_PATH =
  'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z';

// Source: assets/icons/brand/youtube.svg
const YOUTUBE_PATH =
  'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.9 12l-6.3 3.6Z';

const github = createBrandGlyph(GITHUB_PATH);
const google = createBrandGlyph(GOOGLE_PATH);
const youtube = createBrandGlyph(YOUTUBE_PATH);

// Curated MaterialCommunityIcons -> Lucide name map. Keys keep the legacy
// MCI-shaped `name` strings for historical call-site continuity, not
// because MCI is still in use. Brand marks (google, github, youtube) render
// vendored paths from assets/icons/brand/ via createBrandGlyph() above —
// filled, not stroked, unlike the Lucide glyphs (see assets/DESIGN.md).
const iconMap = {
  'access-point': RadioTower,
  account: User,
  'account-cancel-outline': UserX,
  'account-circle': CircleUserRound,
  'account-outline': User,
  'alert-circle-outline': CircleAlert,
  'arrow-left': ArrowLeft,
  calendar: Calendar,
  camera: Camera,
  'camera-burst': Images,
  'camera-off': CameraOff,
  'camera-wireless': Camera,
  check: Check,
  'check-bold': Check,
  'check-circle': CircleCheckBig,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'clock-outline': Clock,
  close: X,
  cog: Settings,
  'content-save': Save,
  delete: Trash2,
  earth: Globe,
  'email-check-outline': MailCheck,
  ethernet: EthernetPort,
  eye: Eye,
  'eye-off': EyeOff,
  github,
  google,
  'image-multiple': Images,
  'image-outline': Image,
  'image-plus': ImagePlus,
  'information-outline': Info,
  'link-variant': Link,
  lock: Lock,
  magnify: Search,
  minus: Minus,
  'open-in-new': ExternalLink,
  'package-variant-closed': Package,
  'package-variant-closed-remove': PackageX,
  pencil: Pencil,
  plus: Plus,
  refresh: RefreshCw,
  shape: Shapes,
  sort: ArrowDownUp,
  tag: Tag,
  'tag-outline': Tag,
  'video-off': VideoOff,
  'weight-kilogram': Weight,
  youtube,
} as const satisfies Record<string, LucideIcon | ReturnType<typeof createBrandGlyph>>;

export type IconName = keyof typeof iconMap;

const sizeMap = { sm: 16, md: 20, lg: 24 } as const;

type IconProps = {
  name: IconName;
  size?: keyof typeof sizeMap | number;
  color?: string;
  strokeWidth?: number;
};

/** Thin wrapper resolving a curated MCI-style name + size token to a Lucide glyph. */
export function Icon({ name, size = 'md', color, strokeWidth = 2 }: IconProps) {
  const Glyph = iconMap[name];
  // NOTE: name is a compile-time-enforced union, but guard the runtime
  // lookup anyway — non-TS callers (e.g. content driven by a string) can
  // still hand this an unmapped value.
  if (!Glyph) return null;
  const resolvedSize = typeof size === 'number' ? size : sizeMap[size];
  return <Glyph size={resolvedSize} color={color} strokeWidth={strokeWidth} />;
}
