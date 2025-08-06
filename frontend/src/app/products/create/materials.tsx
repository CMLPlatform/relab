import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, IconButton, Text, TextInput, Tooltip } from 'react-native-paper';
import { Dropdown } from 'react-native-paper-dropdown';
import { Screen } from '@/lib/ui/components/Screen';
import { useProductCreationStore, type MaterialEntry } from '@/lib/stores/productCreationStore';

// Mock materials for demonstration
const AVAILABLE_MATERIALS = [
  { label: 'Stainless Steel (Metal)', value: '1' },
  { label: 'ABS Plastic (Plastic)', value: '2' },
  { label: 'Copper Wire (Metal)', value: '3' },
  { label: 'Borosilicate Glass (Glass)', value: '4' },
  { label: 'Polypropylene (Plastic)', value: '5' },
  { label: 'Silicone (Elastomer)', value: '6' },
  { label: 'Aluminum (Metal)', value: '7' },
  { label: 'Polyethylene (Plastic)', value: '8' },
  { label: 'Carbon Steel (Metal)', value: '9' },
  { label: 'Ceramic (Ceramic)', value: '10' },
];

const MATERIAL_MAP = {
  '1': { id: 1, name: 'Stainless Steel', type: 'Metal' },
  '2': { id: 2, name: 'ABS Plastic', type: 'Plastic' },
  '3': { id: 3, name: 'Copper Wire', type: 'Metal' },
  '4': { id: 4, name: 'Borosilicate Glass', type: 'Glass' },
  '5': { id: 5, name: 'Polypropylene', type: 'Plastic' },
  '6': { id: 6, name: 'Silicone', type: 'Elastomer' },
  '7': { id: 7, name: 'Aluminum', type: 'Metal' },
  '8': { id: 8, name: 'Polyethylene', type: 'Plastic' },
  '9': { id: 9, name: 'Carbon Steel', type: 'Metal' },
  '10': { id: 10, name: 'Ceramic', type: 'Ceramic' },
};

export default function CreateProductMaterials() {
  const router = useRouter();
  const { formData, addMaterial, removeMaterial, getTotalMaterialsPercentage } = useProductCreationStore();

  const [newMaterial, setNewMaterial] = useState({
    materialId: '',
    percentage: '',
    mass: '',
  });

  // Get total product weight from store
  const totalProductWeight = parseFloat(formData.weight) || 0;

  // Auto-calculate mass or percentage when the other is entered
  const handlePercentageChange = (percentage: string) => {
    const percentValue = parseFloat(percentage);
    setNewMaterial((prev) => ({
      ...prev,
      percentage,
      mass:
        !isNaN(percentValue) && totalProductWeight > 0
          ? ((percentValue / 100) * totalProductWeight).toFixed(3)
          : prev.mass,
    }));
  };

  const handleMassChange = (mass: string) => {
    const massValue = parseFloat(mass);
    setNewMaterial((prev) => ({
      ...prev,
      mass,
      percentage:
        !isNaN(massValue) && totalProductWeight > 0
          ? ((massValue / totalProductWeight) * 100).toFixed(1)
          : prev.percentage,
    }));
  };

  const handleAddMaterial = () => {
    const material = MATERIAL_MAP[newMaterial.materialId as keyof typeof MATERIAL_MAP];
    if (material && (newMaterial.percentage || newMaterial.mass)) {
      // Ensure both values are calculated
      let finalPercentage = newMaterial.percentage;
      let finalMass = newMaterial.mass;

      if (!finalPercentage && finalMass && totalProductWeight > 0) {
        finalPercentage = ((parseFloat(finalMass) / totalProductWeight) * 100).toFixed(1);
      }
      if (!finalMass && finalPercentage && totalProductWeight > 0) {
        finalMass = ((parseFloat(finalPercentage) / 100) * totalProductWeight).toFixed(3);
      }

      const materialEntry: MaterialEntry = {
        material,
        percentage: finalPercentage,
        mass: finalMass,
      };

      addMaterial(materialEntry);
      setNewMaterial({ materialId: '', percentage: '', mass: '' });
    }
  };

  const handleNext = () => {
    router.push('/products/create/media');
  };

  const totalPercentage = getTotalMaterialsPercentage();
  const isOverWeight = totalPercentage > 100;

  return (
    <Screen>
      <Stack.Screen name="materials" options={{ title: 'Register New Product' }} />

      {/* Demo Notice */}
      <Card style={{ backgroundColor: '#e3f2fd', marginBottom: 16 }}>
        <Card.Content>
          <Text variant="titleMedium" style={{ marginBottom: 8, color: '#1565c0' }}>
            Product Registration Demo
          </Text>
          <Text variant="bodyMedium" style={{ color: '#1565c0', lineHeight: 18 }}>
            This demonstrates our product registration workflow. Material database integration, automated composition
            analysis, and supply chain tracking will be available at launch.
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 16 }}>
          <View>
            <Text variant="headlineMedium">Bill of Materials</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: 4 }}>
              Step 2 of 4: Add materials that make up your product
            </Text>
            {totalProductWeight > 0 && (
              <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 4 }}>
                Total product weight: {totalProductWeight} kg
              </Text>
            )}
          </View>

          {/* Add Material Form */}
          <Card style={{ backgroundColor: '#f8f9fa' }}>
            <Card.Content style={{ gap: 12 }}>
              <Text variant="titleMedium">Add Material</Text>

              <View style={{ gap: 8 }}>
                <Dropdown
                  label="Material"
                  placeholder="Select material..."
                  options={AVAILABLE_MATERIALS}
                  value={newMaterial.materialId}
                  onSelect={(value) => setNewMaterial({ ...newMaterial, materialId: value })}
                  mode="outlined"
                />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      label="Percentage"
                      mode="outlined"
                      dense
                      placeholder="35"
                      placeholderTextColor="#757575"
                      value={newMaterial.percentage}
                      onChangeText={handlePercentageChange}
                      keyboardType="numeric"
                      right={<TextInput.Affix text="%" />}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <TextInput
                      label="Mass"
                      mode="outlined"
                      dense
                      placeholder="0.5"
                      placeholderTextColor="#757575"
                      value={newMaterial.mass}
                      onChangeText={handleMassChange}
                      keyboardType="numeric"
                      right={<TextInput.Affix text="kg" />}
                    />
                  </View>
                </View>
              </View>

              <Button
                mode="contained"
                onPress={handleAddMaterial}
                disabled={!newMaterial.materialId || (!newMaterial.percentage && !newMaterial.mass)}
                compact
              >
                Add Material
              </Button>
            </Card.Content>
          </Card>

          {/* Selected Materials */}
          {formData.materials.length > 0 && (
            <Card>
              <Card.Content style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="titleMedium">Selected Materials</Text>
                  <Text
                    variant="bodyMedium"
                    style={{
                      color: isOverWeight ? '#f44336' : totalPercentage === 100 ? '#4caf50' : '#ff9800',
                      fontWeight: '500',
                    }}
                  >
                    Total: {totalPercentage.toFixed(1)}%
                  </Text>
                </View>

                {isOverWeight && (
                  <Text variant="bodySmall" style={{ color: '#f44336', marginBottom: 8 }}>
                    ⚠️ Total exceeds 100% of product weight
                  </Text>
                )}

                {formData.materials.map((item, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: index < formData.materials.length - 1 ? 1 : 0,
                      borderBottomColor: '#e0e0e0',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Tooltip title="Material properties and sustainability metrics - Available at launch">
                        <Text variant="bodyMedium">{item.material.name}</Text>
                      </Tooltip>
                      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                        {item.material.type}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                      <Text variant="bodyMedium">{item.percentage}%</Text>
                      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                        {item.mass} kg
                      </Text>
                    </View>
                    <IconButton icon="delete" size={20} onPress={() => removeMaterial(index)} />
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Button mode="outlined" onPress={() => router.back()} style={{ flex: 1 }}>
              Back
            </Button>

            <Button
              mode="contained"
              onPress={handleNext}
              style={{ flex: 1 }}
              icon="arrow-right"
              contentStyle={{ flexDirection: 'row-reverse' }}
            >
              Next: Media
            </Button>
          </View>
        </Card.Content>
      </Card>
    </Screen>
  );
}
