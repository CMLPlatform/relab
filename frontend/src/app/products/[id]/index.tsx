import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Card, Chip, DataTable, Divider, Text, Tooltip } from 'react-native-paper';
import { Screen } from '@/lib/ui/components/Screen';

// Import demo data
import demoData from '@/assets/data/demo.json';

// Extract product type from demo data
type Product = (typeof demoData.products)[0];

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Find the product by ID
  const product = demoData.products.find((p) => p.id === parseInt(id || '0'));

  if (!product) {
    return (
      <Screen>
        <Stack.Screen name="products" options={{ title: 'Product Not Found' }} />
        <Card>
          <Card.Content style={{ alignItems: 'center', gap: 12 }}>
            <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
              The requested product could not be found.
            </Text>
          </Card.Content>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen name="products" options={{ title: product.name }} />

      {/* Demo Notice */}
      <Card style={{ backgroundColor: '#e3f2fd', marginBottom: 16 }}>
        <Card.Content>
          <Text variant="titleMedium" style={{ marginBottom: 8, color: '#1565c0' }}>
            Demo Product Information
          </Text>
          <Text variant="bodyMedium" style={{ color: '#388e3c', lineHeight: 18 }}>
            This is a demonstration of our product data collection and hosting platform for industrial ecology research.
            Interactive features like component drilling, bill-of-material generation, and aggregated data views are
            scheduled for the full release.
          </Text>
        </Card.Content>
      </Card>

      {/* Header */}
      <Card>
        <Card.Content style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text variant="headlineMedium" style={{ flex: 1 }}>
              {product.name}
            </Text>
            {product.product_type && (
              <Tooltip title="Product type categorization and analytics - Available in full release">
                <Chip mode="outlined">{product.product_type.name}</Chip>
              </Tooltip>
            )}
          </View>

          {product.description && (
            <Text variant="bodyLarge" style={{ opacity: 0.8 }}>
              {product.description}
            </Text>
          )}

          {product.images && product.images.length > 0 && (
            <View
              style={{
                height: 200,
                backgroundColor: '#f5f5f5',
                borderRadius: 8,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text variant="bodyMedium" style={{ opacity: 0.6 }}>
                📷 Product Image
              </Text>
              <Text variant="bodySmall" style={{ opacity: 0.5 }}>
                {product.images[0].description}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Physical Properties */}
      <Card>
        <Card.Content>
          <Text variant="titleLarge" style={{ marginBottom: 12 }}>
            Physical Properties
          </Text>
          <DataTable>
            {product.physical_properties.map((prop, index) => (
              <DataTable.Row key={index}>
                <DataTable.Cell>{prop.property_name}</DataTable.Cell>
                <DataTable.Cell numeric>
                  {prop.value} {prop.unit}
                </DataTable.Cell>
              </DataTable.Row>
            ))}
          </DataTable>
        </Card.Content>
      </Card>

      {/* Bill of Materials */}
      {product.bill_of_materials && product.bill_of_materials.length > 0 && (
        <Card>
          <Card.Content>
            <Text variant="titleLarge" style={{ marginBottom: 12 }}>
              Bill of Materials
            </Text>
            <DataTable>
              <DataTable.Header>
                <DataTable.Title>Material</DataTable.Title>
                <DataTable.Title>Type</DataTable.Title>
                <DataTable.Title numeric>Mass</DataTable.Title>
                <DataTable.Title numeric>%</DataTable.Title>
              </DataTable.Header>
              {product.bill_of_materials.map((item, index) => (
                <DataTable.Row key={index}>
                  <DataTable.Cell>
                    <Tooltip title="Material properties and related metrics - Available in full release">
                      <Text>{item.material.name}</Text>
                    </Tooltip>
                  </DataTable.Cell>
                  <DataTable.Cell>{item.material.type}</DataTable.Cell>
                  <DataTable.Cell numeric>
                    {item.mass} {item.unit}
                  </DataTable.Cell>
                  <DataTable.Cell numeric>{item.percentage}%</DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>
          </Card.Content>
        </Card>
      )}

      {/* Components */}
      <Card>
        <Card.Content>
          <Text variant="titleLarge" style={{ marginBottom: 12 }}>
            Components ({product.components.length})
          </Text>
          <View style={{ gap: 8 }}>
            {product.components.map((component, index) => (
              <View key={component.id} style={{ paddingVertical: 8 }}>
                <Tooltip title="Component details and sub-assemblies - Available in full release">
                  <Text variant="titleMedium">{component.name}</Text>
                </Tooltip>
                {component.description && (
                  <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: 4 }}>
                    {component.description}
                  </Text>
                )}
                {index < product.components.length - 1 && <Divider style={{ marginTop: 8 }} />}
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* Metadata */}
      <Card>
        <Card.Content>
          <Text variant="titleLarge" style={{ marginBottom: 12 }}>
            Metadata
          </Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                Created:
              </Text>
              <Text variant="bodyMedium">{new Date(product.created_at).toLocaleDateString()}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                Last Updated:
              </Text>
              <Text variant="bodyMedium">{new Date(product.updated_at).toLocaleDateString()}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                Product ID:
              </Text>
              <Text variant="bodyMedium">{product.id}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </Screen>
  );
}
