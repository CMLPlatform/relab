import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, HelperText, Icon, Searchbar } from 'react-native-paper';

import CPVCard from '@/components/common/CPVCard';
import { useAuth } from '@/context/auth';
import { loadCPV } from '@/services/cpv';
import { useAppTheme } from '@/theme';
import type { CPVCategory } from '@/types/CPVCategory';

type searchParams = {
  id: string;
};

export default function CategorySelection() {
  // Hooks
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<searchParams>();

  // States
  // No local `isAuthorized` state; rely on `user` from context.
  const [cpv, setCpv] = useState<Record<string, CPVCategory> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cpvClass, setCpvClass] = useState<CPVCategory | null>(null);
  const [history, setHistory] = useState<CPVCategory[]>([]);

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: `/products/${id}` } });
    }
  }, [user, id, router]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton
          {...props}
          onPress={() => router.replace({ pathname: '/products/[id]', params: { id } })}
        />
      ),
    });
  }, [navigation, router, id]);

  useEffect(() => {
    let isMounted = true;

    loadCPV()
      .then((data) => {
        if (!isMounted) return;
        setCpv(data);
        setCpvClass(data.root);
        setHistory([data.root]);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Callbacks
  const selectedBranch = (item: CPVCategory) => {
    setHistory((h) => [...h, item]);
    setCpvClass(item);
  };

  const moveUp = () => {
    setHistory((h) => {
      const newHistory = h.slice(0, -1);
      setCpvClass(newHistory[newHistory.length - 1]);
      return newHistory;
    });
  };

  const typeSelected = (selectedTypeID: number) => {
    const params = { id: id, typeSelection: selectedTypeID };
    router.dismissTo({ pathname: '/products/[id]', params: params });
  };

  // Methods
  const filtered = useMemo((): CPVCategory[] => {
    if (!(cpv && cpvClass)) return [];
    if (!searchQuery) return cpvClass.directChildren.map((id) => cpv[id]);
    const unfiltered = cpvClass.allChildren.map((id) => cpv[id]);
    return unfiltered.filter(
      (item) =>
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [cpv, searchQuery, cpvClass]);

  if (!user) return null;
  if (!cpvClass) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Render
  return (
    <View style={{ flex: 1 }}>
      <Searchbar
        style={{ position: 'absolute', top: 15, left: 15, right: 15, zIndex: 1 }}
        placeholder="Search"
        onChangeText={setSearchQuery}
        value={searchQuery}
      />
      <HelperText type="info" style={{ marginTop: 70, marginHorizontal: 15 }}>
        Search by name or description, or browse with the &apos;Subcategories&apos; button on each
        card. Tap or click a card to select it.
      </HelperText>
      {history.length > 1 && <CPVHistory history={history} onPress={moveUp} />}
      <FlatList
        contentContainerStyle={{
          gap: 15,
          padding: 15,
          paddingTop: history.length > 1 ? 152 : 85,
          marginBottom: 20,
        }}
        data={filtered}
        renderItem={({ item }) => (
          <View>
            <CPVCard
              CPV={item}
              onPress={() => {
                typeSelected(item.id);
              }}
              actionElement={<CPVLink CPV={item} onPress={() => selectedBranch(item)} />}
            />
          </View>
        )}
      />
    </View>
  );
}

function CPVHistory({ history, onPress }: { history: CPVCategory[]; onPress?: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.historyContainer,
        { backgroundColor: colors.tertiaryContainer },
        pressed && { opacity: 0.5 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back to parent category"
    >
      <Icon size={20} source={'chevron-left'} color={colors.onTertiaryContainer} />
      <Text
        numberOfLines={2}
        ellipsizeMode={'tail'}
        style={[styles.historyText, { color: colors.onTertiaryContainer }]}
      >
        {history[history.length - 1].description}
      </Text>
    </Pressable>
  );
}

function CPVLink({ CPV, onPress }: { CPV: CPVCategory; onPress?: () => void }) {
  const { colors } = useAppTheme();

  if (CPV.directChildren.length <= 0) {
    return <View style={{ height: 50 }} />;
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.linkContainer,
        { backgroundColor: colors.secondaryContainer },
        pressed && { opacity: 0.5 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${CPV.directChildren.length} subcategories`}
    >
      <Text style={[styles.linkText, { color: colors.onSecondaryContainer }]}>
        {`${CPV.directChildren.length} subcategories`}
      </Text>
      <Icon size={20} source={'chevron-right'} color={colors.onSecondaryContainer} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
  },
  linkText: {
    fontSize: 14,
    textAlign: 'right',
  },
  historyContainer: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    height: 60,
    alignItems: 'center',
    top: 80,
    left: 15,
    right: 15,
    zIndex: 1,
    borderRadius: 5,
  },
  historyText: {
    flexShrink: 1,
  },
});
