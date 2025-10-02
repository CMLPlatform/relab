import {
    Pressable,
    Animated,
    Easing,
    StyleSheet,
    View,
    Platform,
    Text
} from "react-native";
import React, { useRef } from "react";
import {useRouter} from "expo-router";
import {Product} from "@/types/Product";
import {useTheme} from "react-native-paper";




interface Props {
    product: Product;
}

export default function ProductCard({ product }: Props) {
    // Hooks
    const router = useRouter();
    const theme = useTheme();

    // Variables
    const detailList = [
        product.brand,
        product.model,
        product.productType?.name,
    ].filter(Boolean);

    // Callbacks
    const navigateToProduct = () => {
        const params = {id: product.id};
        router.push({pathname: "/products/[id]", params: params});
    }

    // Render
    return (
        <Pressable
            onPress={navigateToProduct}
            style={({ pressed }) => [
                {
                    padding: 10,
                    paddingLeft: 16,
                },
                (pressed ? { backgroundColor: theme.colors.secondaryContainer } : { backgroundColor: undefined }),
            ]}
        >
            <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>
                {product.name || "Unnamed Product"}
            </Text>
            <Text style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={1} ellipsizeMode="tail">
                {detailList.join(" • ")}
            </Text>
            <Text
                style={{ fontSize: 16,  marginBottom: 4 }}
                numberOfLines={1}
                ellipsizeMode="tail"
            >
                {product.description || "No description provided."}
            </Text>
        </Pressable>
    );
}

