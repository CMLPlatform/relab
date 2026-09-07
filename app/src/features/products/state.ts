import { useCallback, useEffect, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };

export function useSlowLoading(isLoading: boolean) {
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const resetTimer = setTimeout(() => setSlowLoading(false), 0);
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as TimerWithUnref).unref();
    }
    return () => {
      clearTimeout(resetTimer);
      clearTimeout(timer);
    };
  }, [isLoading]);

  return isLoading && slowLoading;
}

// `initiallyExpanded` is read once: a deep link that carries a filter opens
// the row so what is applied is visible; afterwards the toggle is the user's.
export function useProductsFilterUiState(initiallyExpanded: boolean) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');

  return {
    expanded,
    toggleExpanded,
    sortMenuVisible,
    setSortMenuVisible,
    dateMenuVisible,
    setDateMenuVisible,
    brandModalVisible,
    setBrandModalVisible,
    typeModalVisible,
    setTypeModalVisible,
    brandSearch,
    setBrandSearch,
    typeSearch,
    setTypeSearch,
  };
}

export function useProductsHeaderState() {
  const [headerBottom, setHeaderBottom] = useState(0);
  const [fabExtended, setFabExtended] = useState(true);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  }, []);

  return {
    headerBottom,
    setHeaderBottom,
    fabExtended,
    onScroll,
  };
}
