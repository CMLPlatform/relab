import type { ComponentProps } from 'react';
import type { DimensionValue, FlatListProps } from 'react-native';
import type FilterSelectionModal from '@/components/common/FilterSelectionModal';
import type { ProductFilter } from '@/hooks/useProductsScreen';
import type { Product } from '@/types/Product';

export type SortOption = {
  label: string;
  value: readonly string[];
};

export type CurrentUser = {
  isVerified?: boolean;
};

export type SelectionModalProps = ComponentProps<typeof FilterSelectionModal>;

export type ProductsWelcomeCardProps = {
  isAuthenticated: boolean;
  currentUser?: CurrentUser | null;
  visible: boolean | null;
  onDismiss: () => void;
  onSignIn: () => void;
  onGoToProfile: () => void;
};

export type ProductsSearchToolbarProps = {
  searchQuery: string;
  debouncedSearchQuery: string;
  isFetching: boolean;
  searchQueryURL: string;
  sortBy: string[];
  sortOptions: readonly SortOption[];
  sortMenuVisible: boolean;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSetSortMenuVisible: (visible: boolean) => void;
  onSortChange: (sort: readonly string[]) => void;
};

export type ProductsFilterBarProps = {
  isAuthenticated: boolean;
  filterMode: ProductFilter;
  activeDatePreset: number | null;
  activeBrands: string[];
  activeProductTypes: string[];
  dateMenuVisible: boolean;
  brandModalVisible: boolean;
  typeModalVisible: boolean;
  brandResults?: SelectionModalProps['items'];
  brandsLoading: boolean;
  typeResults?: SelectionModalProps['items'];
  typesLoading: boolean;
  brandSearch: string;
  typeSearch: string;
  onToggleMine: () => void;
  onClearMine: () => void;
  onSetDateMenuVisible: (visible: boolean) => void;
  onDateChange: (days?: string) => void;
  onSetBrandModalVisible: (visible: boolean) => void;
  onBrandSelectionChange: (values: string[]) => void;
  onSetBrandSearch: (value: string) => void;
  onClearBrands: () => void;
  onSetTypeModalVisible: (visible: boolean) => void;
  onTypeSelectionChange: (values: string[]) => void;
  onSetTypeSearch: (value: string) => void;
  onClearTypes: () => void;
};

export type ProductsErrorBannerProps = {
  error: unknown;
  onRetry: () => void;
};

export type ProductsListContentProps = {
  numColumns: number;
  productList: Product[];
  filterMode: ProductFilter;
  isFetching: boolean;
  isLoading: boolean;
  slowLoading: boolean;
  total: number;
  totalPages: number;
  hasMore: boolean;
  effectivePage: number;
  searchQuery: string;
  isAuthenticated: boolean;
  onScroll: FlatListProps<Product>['onScroll'];
  onRefresh: () => void;
  onSetPage: (page: number) => void;
};

export type ProductsHeaderFadeProps = {
  headerBottom: number;
  overlayColor: string;
};

export type ProductsFabProps = {
  extended: boolean;
  isAuthenticated: boolean;
  highlight: boolean;
  onPress: () => void;
};

export type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  setPage: (page: number) => void;
};

export type ProductCardCellProps = {
  numColumns: number;
  product: Product;
  showOwner: boolean;
};

export type ProductCardCellWidth = {
  width: DimensionValue;
};
