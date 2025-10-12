import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip, Searchbar } from 'react-native-paper';
import { getBrands } from '@/services/api/fetching';

type searchParams = {
  id: string;
  preset?: string;
};

export default function BrandSelection() {
  // Hooks
  const router = useRouter();
  const { id, preset } = useLocalSearchParams<searchParams>();

  // States
  const [searchQuery, setSearchQuery] = useState(preset || '');
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Effects
  useEffect(() => {
    getBrands()
      .then((brands) => setAllBrands(brands))
      .catch(() => setAllBrands([]))
      .finally(() => setLoading(false));
  }, []);

  // Methods
  const results = allBrands.filter((brand) => brand.toLowerCase().includes(searchQuery.toLowerCase()));

  // Callbacks
  const brandSelected = (selectedBrand: string) => {
    const params = { id: id, brandSelection: selectedBrand };
    router.dismissTo({ pathname: '/products/[id]', params: params });
  };

  // Render
  return (
    <View style={{ padding: 10 }}>
      {loading ? (
        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <Searchbar
            style={{ marginVertical: 10 }}
            placeholder="Search"
            onChangeText={setSearchQuery}
            value={searchQuery}
            editable={false}
          />
          <Chip icon="progress-clock" disabled>
            Loading brands...
          </Chip>
        </View>
      ) : (
        <>
          <Searchbar
            style={{ marginVertical: 10 }}
            placeholder="Search"
            onChangeText={setSearchQuery}
            value={searchQuery}
          />
          <ScrollView>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                padding: 10,
                justifyContent: 'flex-start',
              }}
            >
              {results.includes(searchQuery) || searchQuery === '' ? null : (
                <Chip onPress={() => brandSelected(searchQuery)} icon={'plus'}>
                  {searchQuery}
                </Chip>
              )}
              {results.map((brand, index) => (
                <Chip key={index} onPress={() => brandSelected(brand)}>
                  {brand}
                </Chip>
              ))}
            </View>
          </ScrollView>
        </>
      )}
    </View>
  );
}
