import { useFocusEffect, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AmountStepper } from '@/components/base/AmountStepper';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { DocsLink } from '@/components/base/DocsLink';
import { PageContainer } from '@/components/base/PageContainer';
import { PageHeaderRow } from '@/components/base/PageHeaderRow';
import { Input } from '@/components/base/ui/input';
import CPVCard from '@/components/product/CPVCard';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { DATA_COLLECTION_DOCS_PATH } from '@/config';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import { useCaptureScreen } from '@/features/products/useCaptureScreen';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { PRODUCT_NAME_MAX_LENGTH } from '@/services/api/validation/productSchema';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { typeRowLabels } from '@/types/Product';

type CaptureScreenProps = {
  // Not `role`: that is a live RN-Web prop that would leak an invalid ARIA role.
  entityRole: 'product' | 'component';
  parentID?: number;
  parentRole?: 'product' | 'component';
};

/** Type row: the ProductType.tsx round-trip driven by a typeID/onChange pair (a draft has no [id] route). */
function CaptureTypeRow({
  typeID,
  onTypeChange,
  entityRole,
}: {
  typeID: number | undefined;
  onTypeChange: (typeID: number) => void;
  entityRole: 'product' | 'component';
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CPVCategory | null>(null);

  useFocusEffect(
    useCallback(() => {
      const pendingTypeId = takePendingTypeSelection();
      if (pendingTypeId !== null) onTypeChange(pendingTypeId);
    }, [onTypeChange]),
  );

  useEffect(() => {
    let isMounted = true;
    loadCPV()
      .then((cpv) => {
        if (!isMounted) return;
        // Never fall back to cpv.root: its {name: "undefined"} placeholder
        // renders as a red "Category undefined" card.
        setSelectedType(cpv[String(typeID ?? 'root')] ?? null);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [typeID]);

  const labels = typeRowLabels(entityRole);
  const goToCategorySelection = useCallback(() => router.push('/category-selection'), [router]);

  return (
    <View>
      <AppText variant="eyebrow">{labels.title}</AppText>
      {typeID === undefined ? (
        <AppButton
          variant="outline"
          className="w-full"
          accessibilityLabel={labels.choose}
          onPress={goToCategorySelection}
        >
          {labels.choose}
        </AppButton>
      ) : selectedType ? (
        <CPVCard CPV={selectedType} onPress={goToCategorySelection} />
      ) : null}
    </View>
  );
}

/** Capture-first creation screen for the product and component "new" routes. */
export function CaptureScreen({ entityRole: role, parentID, parentRole }: CaptureScreenProps) {
  const {
    name,
    setName,
    typeID,
    setTypeID,
    amount,
    setAmount,
    setImages,
    canCreate,
    isCreating,
    isPaused,
    draftProduct,
    parentName,
    goBack,
    handleCreate,
    handleCreateAndAddAnother,
  } = useCaptureScreen({ role, parentID, parentRole });
  const { isLg } = useBreakpoint();

  const submitOnEnter = useCallback(() => {
    if (canCreate) void handleCreate();
  }, [canCreate, handleCreate]);

  // Offline: the mutation is paused, not loading; no spinner.
  const isQueued = isCreating && isPaused;

  const nameInputRef = useRef<TextInput>(null);
  const onCreateAndAddAnother = useCallback(async () => {
    // Only refocus Name when the form was reset.
    const didReset = await handleCreateAndAddAnother();
    if (didReset) nameInputRef.current?.focus();
  }, [handleCreateAndAddAnother]);

  return (
    <>
      <Head>
        <title>{`${role === 'component' ? 'New component' : 'New product'} · Relab`}</title>
      </Head>
      <KeyboardAwareScrollView
        testID="capture-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
      >
        <PageContainer>
          {/* The stack header is hidden behind TopNav at lg; the title + back live in-page there. */}
          {isLg ? (
            <PageHeaderRow
              title={role === 'component' ? 'New component' : 'New product'}
              onBack={goBack}
            />
          ) : null}
          <ProductImageGallery product={draftProduct} editMode onImagesChange={setImages} />
          <View className="gap-4">
            {/* Context line first: which record this part belongs to. */}
            {role === 'component' && parentName ? (
              <AppText variant="caption" className="text-muted-foreground">
                Component of: {parentName}
              </AppText>
            ) : null}
            <View>
              <AppText variant="eyebrow">Name</AppText>
              <Input
                ref={nameInputRef}
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={PRODUCT_NAME_MAX_LENGTH}
                placeholder={role === 'component' ? 'e.g. Battery pack' : 'e.g. Cordless drill'}
                accessibilityLabel="Name"
                onSubmitEditing={submitOnEnter}
              />
            </View>

            <CaptureTypeRow typeID={typeID} onTypeChange={setTypeID} entityRole={role} />

            {/* A first-time contributor decides here what to record; the guide
                answers that, so it is one tap away rather than in Account. */}
            <DocsLink
              path={DATA_COLLECTION_DOCS_PATH}
              accessibilityLabel="Read the data collection guide"
              className="self-start py-1"
            >
              What to record, and how much
            </DocsLink>

            {role === 'component' ? (
              <AmountStepper value={amount} onChange={setAmount} label="How many of these" />
            ) : null}

            <View className="flex-row gap-3">
              <AppButton
                variant="primary"
                disabled={!canCreate}
                loading={isCreating && !isPaused}
                onPress={handleCreate}
              >
                {isQueued
                  ? QUEUED_OFFLINE_LABEL
                  : role === 'component'
                    ? 'Create component'
                    : 'Create product'}
              </AppButton>
              <AppButton
                variant="outline"
                disabled={!canCreate}
                loading={isCreating && !isPaused}
                onPress={onCreateAndAddAnother}
              >
                {isQueued ? QUEUED_OFFLINE_LABEL : 'Create & add another'}
              </AppButton>
            </View>
          </View>
        </PageContainer>
      </KeyboardAwareScrollView>
    </>
  );
}
