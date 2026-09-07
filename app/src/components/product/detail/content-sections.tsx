// Do not re-export from Content.tsx (react-refresh/only-export-components).
import type { ComponentProps, ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import type { SectionKey } from '@/components/base/SectionNavContext';
import ProductDescription from '@/components/product/ProductDescription';
import ProductVideo from '@/components/product/ProductVideo';
import { entityLabel, type Product } from '@/types/Product';
import ProductCircularityProperties from './ProductCircularityProperties';
import ProductComponents from './ProductComponents';
import ProductFiles from './ProductFiles';
import ProductPhysicalProperties from './ProductPhysicalProperties';
import ProductTags from './ProductTags';
import ProductType from './ProductType';

export type SectionRenderProps = {
  product: Product;
  editMode: boolean;
  isProductComponent: boolean;
  onChangeDescription: ComponentProps<typeof ProductDescription>['onChangeDescription'];
  onBrandChange: ComponentProps<typeof ProductTags>['onBrandChange'];
  onModelChange: ComponentProps<typeof ProductTags>['onModelChange'];
  onAmountInParentChange: ComponentProps<typeof ProductTags>['onAmountChange'];
  onTypeChange: ComponentProps<typeof ProductType>['onTypeChange'];
  onChangePhysicalProperties: ComponentProps<
    typeof ProductPhysicalProperties
  >['onChangePhysicalProperties'];
  onChangeCircularityProperties: ComponentProps<
    typeof ProductCircularityProperties
  >['onChangeCircularityProperties'];
  onVideoChange: ComponentProps<typeof ProductVideo>['onVideoChange'];
  onGoLivePress: () => void;
  goLiveTriggerRef?: RefObject<View | null>;
};

// Emptiness context not derivable from `product` alone.
export type SectionContext = {
  mediaStreamable: boolean;
};

export type SectionConfig = {
  key: SectionKey;
  label: string;
  addLabel?: string;
  /** Muted text after the Section title, e.g. a component count like "(3)". */
  titleSuffix?: (product: Product) => string | undefined;
  /** Info-tooltip text shown beside the Section title. Return undefined for no tooltip. */
  tooltip?: (product: Product, editMode: boolean) => string | undefined;
  isEmpty: (product: Product, ctx: SectionContext) => boolean;
  render: (props: SectionRenderProps) => ReactNode;
};

// Overview also renders the tags and the amount chip; a bare description check
// would hide them.
function isOverviewEmpty(product: Product): boolean {
  const hasDescription = !!product.description?.trim();
  const hasBrand = !!product.brand?.trim();
  const hasModel = !!product.model?.trim();
  const hasType = product.productTypeID !== undefined || !!product.productTypeName;
  const hasAmount = product.role === 'component' && (product.amountInParent ?? 1) > 1;
  return !(hasDescription || hasBrand || hasModel || hasType || hasAmount);
}

function hasCircularityNotes(product: Product): boolean {
  const { recyclability, disassemblability, remanufacturability } = product.circularityProperties;
  return [recyclability, disassemblability, remanufacturability].some(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
}

/** Drives the scroll order and the section nav. Gallery, SpecHeader, footer and Delete live outside this config. */
export const SECTIONS: SectionConfig[] = [
  {
    key: 'overview',
    label: 'Overview',
    addLabel: 'Add a description',
    isEmpty: isOverviewEmpty,
    render: (props) => (
      <>
        <ProductDescription
          product={props.product}
          editMode={props.editMode}
          onChangeDescription={props.onChangeDescription}
        />
        <ProductTags
          product={props.product}
          editMode={props.editMode}
          onBrandChange={props.onBrandChange}
          onModelChange={props.onModelChange}
          onAmountChange={props.onAmountInParentChange}
          isComponent={props.isProductComponent}
        />
        <ProductType
          product={props.product}
          editMode={props.editMode}
          onTypeChange={props.onTypeChange}
        />
      </>
    ),
  },
  {
    key: 'components',
    label: 'Components',
    // Never collapsed as empty.
    isEmpty: () => false,
    titleSuffix: (product) => `(${(product.components ?? []).length})`,
    // Only while the record has no id; on the `?edit=1` route it is persisted.
    tooltip: (product) =>
      typeof product.id === 'number'
        ? undefined
        : `Add components after saving the ${entityLabel(product)}.`,
    render: (props) => <ProductComponents product={props.product} editMode={props.editMode} />,
  },
  {
    // Measurements and circularity notes share one section (six chips did not fit a phone).
    key: 'properties',
    label: 'Properties',
    addLabel: 'Add properties',
    isEmpty: (product) => {
      const { weight, width, height, depth } = product.physicalProperties;
      return !(weight || width || height || depth) && !hasCircularityNotes(product);
    },
    render: (props) => (
      <>
        <ProductPhysicalProperties
          product={props.product}
          editMode={props.editMode}
          onChangePhysicalProperties={props.onChangePhysicalProperties}
        />
        <ProductCircularityProperties
          product={props.product}
          editMode={props.editMode}
          onChangeCircularityProperties={props.onChangeCircularityProperties}
        />
      </>
    ),
  },
  {
    key: 'media',
    label: 'Media',
    addLabel: 'Add a video',
    isEmpty: (product, ctx) => (product.videos?.length ?? 0) === 0 && !ctx.mediaStreamable,
    render: (props) => (
      <>
        <ProductVideo
          product={props.product}
          editMode={props.editMode}
          onVideoChange={props.onVideoChange}
          onGoLivePress={props.onGoLivePress}
          goLiveTriggerRef={props.goLiveTriggerRef}
        />
        {/* Renders itself away for anyone below the lab tier, so it does not
            affect this section's emptiness for an ordinary contributor. */}
        <ProductFiles product={props.product} editMode={props.editMode} />
      </>
    ),
  },
];

// Sections that do not apply at all (unlike "empty", which still shows an add-row).
function passesGuard(section: SectionConfig, ctx: { isProductComponent: boolean }): boolean {
  if (section.key === 'media' && ctx.isProductComponent) return false;
  return true;
}

export function guardedSections(ctx: { isProductComponent: boolean }): SectionConfig[] {
  return SECTIONS.filter((section) => passesGuard(section, ctx));
}

/** The sections actually rendered right now — reused by the nav chips/outline. */
export function visibleSections(
  product: Product,
  ctx: SectionContext & { editMode: boolean; isProductComponent: boolean },
): { key: SectionKey; label: string }[] {
  return guardedSections(ctx)
    .filter((section) => ctx.editMode || !section.isEmpty(product, ctx))
    .map(({ key, label }) => ({ key, label }));
}
