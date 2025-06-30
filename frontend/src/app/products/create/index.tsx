import { useProductCreationStore } from '@/lib/stores/productCreationStore';
import { Screen } from '@/lib/ui/components/Screen';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, Text, TextInput } from 'react-native-paper';
import { Dropdown } from 'react-native-paper-dropdown';

// Available product types
const AVAILABLE_PRODUCT_TYPES = [
  { label: 'Kitchen Appliance', value: 'Kitchen Appliance' },
  { label: 'Power Tool', value: 'Power Tool' },
  { label: 'Handheld Electronics', value: 'Handheld Electronics' },
  { label: '...', value: '...' },
];

export default function CreateProductBasicInfo() {
  const router = useRouter();
  const { formData, updateBasicInfo, isFormValid } = useProductCreationStore();

  const handleInputChange = (field: string, value: string) => {
    updateBasicInfo({ [field]: value });
  };

  const handleNext = () => {
    router.push('/products/create/materials');
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Stack.Screen name="index" options={{ title: 'Register New Product' }} />
        {/* Demo Notice */}
        <Card style={{ backgroundColor: '#e3f2fd', marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 8, color: '#1565c0' }}>
              Product Registration Demo
            </Text>
            <Text variant="bodyMedium" style={{ color: '#1976d2', lineHeight: 18 }}>
              Experience our streamlined product data collection workflow. Full integration with industrial ecology
              databases, automated validation, and AI-assisted data entry will be available at launch.
            </Text>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content style={{ gap: 16 }}>
            <View>
              <Text variant="headlineMedium">Basic Information</Text>
              <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: 4 }}>
                Step 1 of 4: Enter the basic details for your product
              </Text>
            </View>

            <TextInput
              label="Product Name *"
              value={formData.name}
              onChangeText={(value) => handleInputChange('name', value)}
              mode="outlined"
              placeholder="e.g., SmartToast Pro 2000"
              placeholderTextColor="#757575"
            />

            <TextInput
              label="Brand"
              value={formData.brand}
              onChangeText={(value) => handleInputChange('brand', value)}
              mode="outlined"
              placeholder="e.g., Kitchen Tech"
              placeholderTextColor="#757575"
            />

            <TextInput
              label="Model"
              value={formData.model}
              onChangeText={(value) => handleInputChange('model', value)}
              mode="outlined"
              placeholder="e.g., KT-2000X"
              placeholderTextColor="#757575"
            />

            <Dropdown
              label="Product Type"
              placeholder="Select product type..."
              options={AVAILABLE_PRODUCT_TYPES}
              value={formData.product_type}
              onSelect={(value) => handleInputChange('product_type', value)}
              mode="outlined"
            />

            <TextInput
              label="Description"
              value={formData.description}
              onChangeText={(value) => handleInputChange('description', value)}
              mode="outlined"
              multiline
              numberOfLines={4}
              placeholder="Describe the product's main features and purpose..."
              placeholderTextColor="#757575"
            />

            <Divider style={{ marginVertical: 8 }} />

            {/* Physical Properties Section */}
            <View>
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                Physical Properties
              </Text>

              <TextInput
                label="Weight"
                value={formData.weight}
                onChangeText={(value) => handleInputChange('weight', value)}
                mode="outlined"
                placeholder="2.8"
                placeholderTextColor="#757575"
                keyboardType="numeric"
                right={<TextInput.Affix text="kg" />}
              />

              <TextInput
                label="Length"
                value={formData.length}
                onChangeText={(value) => handleInputChange('length', value)}
                mode="outlined"
                placeholder="35"
                placeholderTextColor="#757575"
                keyboardType="numeric"
                right={<TextInput.Affix text="cm" />}
              />

              <TextInput
                label="Width"
                value={formData.width}
                onChangeText={(value) => handleInputChange('width', value)}
                mode="outlined"
                placeholder="22"
                placeholderTextColor="#757575"
                keyboardType="numeric"
                right={<TextInput.Affix text="cm" />}
              />

              <TextInput
                label="Height"
                value={formData.height}
                onChangeText={(value) => handleInputChange('height', value)}
                mode="outlined"
                placeholder="18"
                placeholderTextColor="#757575"
                keyboardType="numeric"
                right={<TextInput.Affix text="cm" />}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Button mode="outlined" onPress={() => router.back()} style={{ flex: 1 }}>
                Cancel
              </Button>

              <Button
                mode="contained"
                onPress={handleNext}
                disabled={!isFormValid()}
                style={{ flex: 1 }}
                icon="arrow-right"
                contentStyle={{ flexDirection: 'row-reverse' }}
              >
                Next: Materials
              </Button>
            </View>
          </Card.Content>
        </Card>
      </Screen>
    </View>
  );
}
