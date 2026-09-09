import type { LucideIcon } from 'lucide-react-native';
// Per-icon deep imports: the package barrel drags all ~1800 glyphs (1.3 MB) into the web bundle.
import ArrowDownUp from 'lucide-react-native/icons/arrow-down-up';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Calendar from 'lucide-react-native/icons/calendar';
import Camera from 'lucide-react-native/icons/camera';
import CameraOff from 'lucide-react-native/icons/camera-off';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import Clock from 'lucide-react-native/icons/clock';
import Copy from 'lucide-react-native/icons/copy';
import EthernetPort from 'lucide-react-native/icons/ethernet-port';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Globe from 'lucide-react-native/icons/globe';
import Image from 'lucide-react-native/icons/image';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import Images from 'lucide-react-native/icons/images';
import Info from 'lucide-react-native/icons/info';
import Keyboard from 'lucide-react-native/icons/keyboard';
import Link from 'lucide-react-native/icons/link';
import Lock from 'lucide-react-native/icons/lock';
import MailCheck from 'lucide-react-native/icons/mail-check';
import Minus from 'lucide-react-native/icons/minus';
import Moon from 'lucide-react-native/icons/moon';
import Package from 'lucide-react-native/icons/package';
import PackageX from 'lucide-react-native/icons/package-x';
import Pencil from 'lucide-react-native/icons/pencil';
import Plus from 'lucide-react-native/icons/plus';
import Radio from 'lucide-react-native/icons/radio';
import RadioTower from 'lucide-react-native/icons/radio-tower';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Save from 'lucide-react-native/icons/save';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Shapes from 'lucide-react-native/icons/shapes';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Sun from 'lucide-react-native/icons/sun';
import SunMoon from 'lucide-react-native/icons/sun-moon';
import Tag from 'lucide-react-native/icons/tag';
import Trash2 from 'lucide-react-native/icons/trash-2';
import User from 'lucide-react-native/icons/user';
import UserX from 'lucide-react-native/icons/user-x';
import Users from 'lucide-react-native/icons/users';
import VideoOff from 'lucide-react-native/icons/video-off';
import Webcam from 'lucide-react-native/icons/webcam';
import Weight from 'lucide-react-native/icons/weight';
import X from 'lucide-react-native/icons/x';
import { Path, Svg } from 'react-native-svg';

type BrandGlyphProps = { size?: number; color?: string; strokeWidth?: number };

/** Turns a single-path brand SVG's `d` data into a Lucide-shaped component. */
function createBrandGlyph(d: string) {
  // strokeWidth is ignored: brand marks are filled, not stroked.
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

// Curated Lucide glyph set. Brand marks (google, github, youtube) render
// vendored paths from assets/icons/brand/ via createBrandGlyph(), filled,
// not stroked, unlike the Lucide glyphs (see assets/DESIGN.md).
const iconMap = {
  'arrow-down-up': ArrowDownUp,
  'arrow-left': ArrowLeft,
  calendar: Calendar,
  camera: Camera,
  'camera-off': CameraOff,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check-big': CircleCheckBig,
  'circle-user-round': CircleUserRound,
  clock: Clock,
  copy: Copy,
  'ethernet-port': EthernetPort,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  github,
  globe: Globe,
  google,
  image: Image,
  'image-plus': ImagePlus,
  images: Images,
  info: Info,
  keyboard: Keyboard,
  link: Link,
  lock: Lock,
  'mail-check': MailCheck,
  minus: Minus,
  moon: Moon,
  package: Package,
  'package-x': PackageX,
  pencil: Pencil,
  plus: Plus,
  radio: Radio,
  'radio-tower': RadioTower,
  'refresh-cw': RefreshCw,
  save: Save,
  search: Search,
  settings: Settings,
  shapes: Shapes,
  'sliders-horizontal': SlidersHorizontal,
  sun: Sun,
  'sun-moon': SunMoon,
  tag: Tag,
  'trash-2': Trash2,
  user: User,
  users: Users,
  'user-x': UserX,
  'video-off': VideoOff,
  webcam: Webcam,
  weight: Weight,
  x: X,
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
  // NOTE: runtime guard for string-driven callers that bypass the union.
  if (!Glyph) return null;
  const resolvedSize = typeof size === 'number' ? size : sizeMap[size];
  return <Glyph size={resolvedSize} color={color} strokeWidth={strokeWidth} />;
}
