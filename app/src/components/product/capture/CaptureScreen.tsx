import { useFocusEffect, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useId, useRef } from 'react';
import { type TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AmountStepper } from '@/components/base/AmountStepper';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { DocsLink } from '@/components/base/DocsLink';
import { PageContainer } from '@/components/base/PageContainer';
import { PageHeaderRow } from '@/components/base/PageHeaderRow';
import { Input } from '@/components/base/ui/input';
import CPVCard, { CpvTypeLoadError } from '@/components/product/CPVCard';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { DATA_COLLECTION_DOCS_PATH } from '@/config';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import { useCaptureScreen } from '@/features/products/useCaptureScreen';
import { useCpvType } from '@/features/products/useCpvType';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_MIN_LENGTH,
} from '@/services/api/validation/productSchema';
import { typeRowLabels } from '@/types/Product';
import { describedBy, requiredField } from '@/utils/a11y';

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
  const cpvType = useCpvType(typeID);

  useFocusEffect(
    useCallback(() => {
      const pendingTypeId = takePendingTypeSelection();
      if (pendingTypeId !== null) onTypeChange(pendingTypeId);
    }, [onTypeChange]),
  );

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
      ) : cpvType.status === 'ready' ? (
        <CPVCard CPV={cpvType.type} onPress={goToCategorySelection} />
      ) : cpvType.status === 'error' ? (
        <CpvTypeLoadError typeID={typeID} retry={cpvType.retry} />
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
  const nameHintId = useId();
  // The name is the only thing Create waits on, so say so while it is too short.
  const nameTooShort = name.trim().length < PRODUCT_NAME_MIN_LENGTH;
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
              {/* Name is the only field Create needs; everything else may stay empty. */}
              <AppText variant="label">
                Name{' '}
                <AppText variant="label" className="text-muted-foreground">
                  (required)
                </AppText>
              </AppText>
              <Input
                ref={nameInputRef}
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={PRODUCT_NAME_MAX_LENGTH}
                placeholder={role === 'component' ? 'e.g. Battery pack' : 'e.g. Cordless drill'}
                accessibilityLabel="Name"
                onSubmitEditing={submitOnEnter}
                {...requiredField()}
                {...describedBy(nameHintId, nameTooShort, { invalid: false })}
              />
              {/* Slot stays reserved so the form does not jump once the name is long enough. */}
              <AppText
                nativeID={nameHintId}
                variant="caption"
                className="mt-1 min-h-[18px] text-muted-foreground"
              >
                {nameTooShort ? `At least ${PRODUCT_NAME_MIN_LENGTH} characters` : ''}
              </AppText>
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

            <View className="flex-row flex-wrap gap-3">
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
