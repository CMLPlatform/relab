import { useProductCreationStore } from '@/lib/stores/productCreationStore';
import { Screen } from '@/lib/ui/components/Screen';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Divider, Snackbar, Text, Tooltip } from 'react-native-paper';

export default function CreateProductReview() {
  const router = useRouter();
  const { formData, saveAsDraft, getTotalMaterialsPercentage } = useProductCreationStore();
  const [snackbarVisible, setSnackbarVisible] = React.useState(false);

  const handleSaveAsDraft = () => {
    saveAsDraft();
    setSnackbarVisible(true);
    // Optionally navigate back to products list
    setTimeout(() => {
      router.replace('/products');
    }, 2000);
  };

  const totalMaterialsPercentage = getTotalMaterialsPercentage();

  return (
    <Screen>
      <Stack.Screen name="review" options={{ title: 'Register New Product' }} />

      <Card>
        <Card.Content style={{ gap: 16 }}>
          <View>
            <Text variant="headlineMedium">Review & Submit</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: 4 }}>
              Step 4 of 4: Review your product information before submission
            </Text>
          </View>

          {/* Basic Information */}
          <Card style={{ backgroundColor: '#f8f9fa' }}>
            <Card.Content style={{ gap: 8 }}>
              <Text variant="titleMedium">Basic Information</Text>
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    Name:
                  </Text>
                  <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
                    {formData.name}
                  </Text>
                </View>
                {formData.brand && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                      Brand:
                    </Text>
                    <Text variant="bodyMedium">{formData.brand}</Text>
                  </View>
                )}
                {formData.model && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                      Model:
                    </Text>
                    <Text variant="bodyMedium">{formData.model}</Text>
                  </View>
                )}
                {formData.product_type && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                      Type:
                    </Text>
                    <Text variant="bodyMedium">{formData.product_type}</Text>
                  </View>
                )}
                {formData.description && (
                  <View style={{ marginTop: 8 }}>
                    <Text variant="bodyMedium" style={{ opacity: 0.7, marginBottom: 4 }}>
                      Description:
                    </Text>
                    <Text variant="bodyMedium">{formData.description}</Text>
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* Physical Properties */}
          {(formData.weight || formData.length || formData.width || formData.height) && (
            <Card style={{ backgroundColor: '#f8f9fa' }}>
              <Card.Content style={{ gap: 8 }}>
                <Text variant="titleMedium">Physical Properties</Text>
                <View style={{ gap: 4 }}>
                  {formData.weight && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                        Weight:
                      </Text>
                      <Text variant="bodyMedium">{formData.weight} kg</Text>
                    </View>
                  )}
                  {formData.length && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                        Length:
                      </Text>
                      <Text variant="bodyMedium">{formData.length} cm</Text>
                    </View>
                  )}
                  {formData.width && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                        Width:
                      </Text>
                      <Text variant="bodyMedium">{formData.width} cm</Text>
                    </View>
                  )}
                  {formData.height && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                        Height:
                      </Text>
                      <Text variant="bodyMedium">{formData.height} cm</Text>
                    </View>
                  )}
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Materials */}
          {formData.materials.length > 0 && (
            <Card style={{ backgroundColor: '#f8f9fa' }}>
              <Card.Content style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="titleMedium">Bill of Materials</Text>
                  <Text
                    variant="bodyMedium"
                    style={{
                      color: totalMaterialsPercentage === 100 ? '#4caf50' : '#ff9800',
                      fontWeight: '500',
                    }}
                  >
                    {totalMaterialsPercentage.toFixed(1)}%
                  </Text>
                </View>

                {formData.materials.map((item, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 4,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">{item.material.name}</Text>
                      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                        {item.material.type}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyMedium">{item.percentage}%</Text>
                      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                        {item.mass} kg
                      </Text>
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          {/* Media */}
          {formData.media.length > 0 && (
            <Card style={{ backgroundColor: '#f8f9fa' }}>
              <Card.Content style={{ gap: 8 }}>
                <Text variant="titleMedium">Media Items ({formData.media.length})</Text>

                {formData.media.map((item, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 4,
                      gap: 8,
                    }}
                  >
                    <Text variant="bodyLarge">
                      {item.type === 'image' ? '📷' : item.type === 'video' ? '🎥' : '📄'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">{item.name}</Text>
                      {item.description && (
                        <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                          {item.description}
                        </Text>
                      )}
                    </View>
                    <Chip compact>{item.type}</Chip>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          <Divider />

          {/* Submit Section */}
          <Card style={{ backgroundColor: '#e8f5e8' }}>
            <Card.Content style={{ gap: 12 }}>
              <Text variant="titleMedium" style={{ color: '#2e7d32' }}>
                Ready to Submit
              </Text>
              <Text variant="bodyMedium" style={{ color: '#388e3c' }}>
                Your product data has been prepared for submission. Once submitted, it will be processed and made
                available in the product database for research purposes.
              </Text>

              <Tooltip title="Product submission and database integration - Available at launch">
                <Button
                  mode="contained"
                  icon="cloud-upload"
                  style={{ alignSelf: 'flex-start' }}
                  contentStyle={{ paddingHorizontal: 24 }}
                  disabled
                >
                  Submit Product
                </Button>
              </Tooltip>
            </Card.Content>
          </Card>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Button mode="outlined" onPress={() => router.back()} style={{ flex: 1 }}>
              Back to Media
            </Button>

            <Button mode="text" onPress={handleSaveAsDraft} style={{ flex: 1 }}>
              Save as Draft
            </Button>
          </View>
        </Card.Content>
      </Card>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={{ backgroundColor: '#4caf50' }}
      >
        Draft saved successfully! Redirecting to products...
      </Snackbar>
    </Screen>
  );
}
