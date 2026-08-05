// Canonical home of SECTIONS/visibleSections — do not re-export from
// Content.tsx (react-refresh/only-export-components forbids mixing
// non-component exports into a file that also exports a component).
import type { ComponentProps, ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import type { SectionKey } from '@/components/base/SectionNavContext';
import ProductDescription from '@/components/product/ProductDescription';
import ProductVideo from '@/components/product/ProductVideo';
import { entityLabel, type Product } from '@/types/Product';
import ProductCircularityProperties from './ProductCircularityProperties';
import ProductComponents from './ProductComponents';
import ProductMetaData from './ProductMetaData';
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

// Emptiness context that can't be derived from `product` alone.
// NOTE: mediaStreamable approximates "has a live-media affordance" as
// go-live-eligible (owned + rpi camera) OR currently streaming — it doesn't
// know about e.g. future media integrations. Extend this bag if that grows.
export type SectionContext = {
  mediaStreamable: boolean;
};

export type SectionConfig = {
  key: SectionKey;
  label: string;
  addLabel?: string;
  /** Muted text after the Section title, e.g. a component count like "(3)". */
  titleSuffix?: (product: Product) => string | undefined;
  /** Info-tooltip text shown beside the Section title. */
  tooltip?: (product: Product) => string | undefined;
  isEmpty: (product: Product, ctx: SectionContext) => boolean;
  render: (props: SectionRenderProps) => ReactNode;
};

// Overview also renders the brand/model/type tags and the component amount
// chip (ProductTags/ProductType) — collapsing it on a bare description check
// hid those in view mode even when they had content (e.g. a tagged component
// with amountInParent > 1 but no description).
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

/**
 * Drives both the scroll order and the section nav (chips/outline). Order:
 * gallery → SpecHeader → these sections → Delete (all outside this config —
 * see Content.tsx's ProductPageContent).
 */
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
    // Task 5 refines this (BOM rows); never collapsed as empty for now.
    isEmpty: () => false,
    titleSuffix: (product) => `(${(product.components ?? []).length})`,
    tooltip: (product) => `Add components after saving the ${entityLabel(product)}.`,
    render: (props) => <ProductComponents product={props.product} editMode={props.editMode} />,
  },
  {
    key: 'physical',
    label: 'Physical properties',
    addLabel: 'Add physical properties',
    isEmpty: (product) => {
      const { weight, width, height, depth } = product.physicalProperties;
      return !(weight || width || height || depth);
    },
    tooltip: () => 'Must be greater than 0. Assume a bounding box for the dimensions.',
    render: (props) => (
      <ProductPhysicalProperties
        product={props.product}
        editMode={props.editMode}
        onChangePhysicalProperties={props.onChangePhysicalProperties}
      />
    ),
  },
  {
    key: 'circularity',
    label: 'Circularity',
    addLabel: 'Add circularity notes',
    isEmpty: (product) => !hasCircularityNotes(product),
    tooltip: () => 'Add optional recyclability, disassemblability, and remanufacturability notes.',
    render: (props) => (
      <ProductCircularityProperties
        product={props.product}
        editMode={props.editMode}
        onChangeCircularityProperties={props.onChangeCircularityProperties}
      />
    ),
  },
  {
    key: 'media',
    label: 'Media',
    addLabel: 'Add a video',
    isEmpty: (product, ctx) => (product.videos?.length ?? 0) === 0 && !ctx.mediaStreamable,
    render: (props) => (
      <ProductVideo
        product={props.product}
        editMode={props.editMode}
        onVideoChange={props.onVideoChange}
        onGoLivePress={props.onGoLivePress}
        goLiveTriggerRef={props.goLiveTriggerRef}
      />
    ),
  },
  {
    key: 'meta',
    label: 'Details',
    isEmpty: () => false,
    render: (props) => <ProductMetaData product={props.product} />,
  },
];

// Sections that don't apply at all to the current product/mode — distinct from
// "empty" (which still shows an add-row in edit mode): media is a
// product-only concept.
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
