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

// Curated MaterialCommunityIcons -> Lucide name map. Keys match the existing
// MCI `name` strings used across the app so call sites migrate 1:1. Brand
// marks (google, github, youtube) have no Lucide glyph and intentionally
// stay off this map — see task-2-report.md.
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
} as const satisfies Record<string, LucideIcon>;

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
  // ponytail: name is a compile-time-enforced union, but guard the runtime
  // lookup anyway — non-TS callers (e.g. content driven by a string) can
  // still hand this an unmapped value.
  if (!Glyph) return null;
  const resolvedSize = typeof size === 'number' ? size : sizeMap[size];
  return <Glyph size={resolvedSize} color={color} strokeWidth={strokeWidth} />;
}
