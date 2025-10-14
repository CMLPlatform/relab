import { Pressable } from "react-native";
import { Text } from "@/components/base";
import React from "react";
import {useRouter} from "expo-router";
import {Product} from "@/types/Product";
import {useTheme} from "react-native-paper";




interface Props {
    product: Product;
    enabled?: boolean
}

export default function ProductCard({ product, enabled = true }: Props) {
    // Hooks
    const router = useRouter();
    const theme = useTheme();

    // Variables
    const detailList = [
        product.brand,
        product.model,
        product.componentIDs.length === 1 && `1 component`,
        product.componentIDs.length > 1 && `${product.componentIDs.length} components`,
    ].filter(Boolean);

    // Callbacks
    const navigateToProduct = () => {
        const params = {id: product.id};
        router.push({pathname: "/products/[id]", params: params});
    }

    // Render
    return (
        <Pressable
            onPress={enabled ? navigateToProduct : undefined}
            style={({ pressed }) => [
                {
                    padding: 10,
                    paddingLeft: 16,
                },
                pressed && enabled && { backgroundColor: theme.colors.secondaryContainer },
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

