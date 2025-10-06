import { FlatList, NativeSyntheticEvent, NativeScrollEvent, RefreshControl } from "react-native";
import { useState } from "react";

import ProductCard from "@/components/common/ProductCard";
import { allProducts } from "@/services/api/fetching";
import { Product } from "@/types/Product";
import { AnimatedFAB } from "react-native-paper";
import { useDialog } from "@/components/common/DialogProvider";
import {useRouter} from "expo-router";


export default function DatabaseTab() {
    // Hooks
    const dialog = useDialog();
    const router = useRouter();

    // States
    const [productList, setProductList] = useState<Required<Product>[]>([]);
    const [fabExtended, setFabExtended] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Callbacks
    const onRefresh = () => {
        setRefreshing(true);
        allProducts().then(setProductList).finally(() => setRefreshing(false));
    }

    const syncProducts = () => {
        allProducts().then(setProductList);
    }

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        setFabExtended(event.nativeEvent.contentOffset.y <= 0);
    };

    const newProduct = () => {
        dialog.input({
            title: "Create New Product",
            placeholder: "Product Name",
            buttons: [
                { text: "Cancel" },
                { text: "OK", onPress: (productName) => {
                    const params = { id: "new", edit: "true", name: productName };
                    router.push({ pathname: "/products/[id]", params: params });
                }}
            ]
        })
    }

    // Render
    return (
        <>
            <FlatList
                onScroll={onScroll}
                scrollEventThrottle={16}
                onLayout={syncProducts}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ gap: 15, padding: 10}}
                data={productList}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <ProductCard name={item.name} description={item.description} id={item.id}/>
                )}
            />
            <AnimatedFAB
                icon="plus"
                label="New Product"
                extended={fabExtended}
                onPress={newProduct}
                style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
            />
        </>
    );
}
