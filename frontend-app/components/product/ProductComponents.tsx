import {View} from "react-native";
import {Button} from "react-native-paper";
import {useState, useEffect} from "react";

import {Text} from "@/components/base";
import ProductCard from "@/components/common/ProductCard";
import {productComponents} from "@/services/api/fetching";
import {Product} from "@/types/Product";
import {useRouter} from "expo-router";
import {useDialog} from "@/components/common/DialogProvider";

interface Props {
    product: Product;
    editMode: boolean;
}

export default function ProductComponents({product, editMode}: Props) {
    // Hooks
    const router = useRouter();
    const dialog = useDialog();

    // States
    const [components, setComponents] = useState<Product[]>([]);

    // Effects
    useEffect(() => {
        productComponents(product).then(setComponents)
    }, [product]);

    // Callbacks
    const newComponent = () => {
        dialog.input({
            title: "Create New Component",
            placeholder: "Component Name",
            buttons: [
                { text: "Cancel" },
                { text: "OK", onPress: (componentName) => {
                    const params = { id: "new", edit: "true", name: componentName, parent: product.id };
                    router.push({ pathname: "/products/[id]", params: params });
                }}
            ]
        })
    }

    // Render
    return (
        <View>
            <Text
                style={{
                    marginBottom: 12,
                    paddingLeft: 14,
                    fontSize: 24,
                    fontWeight: "bold",
                }}
            >
                Components ({product.componentIDs.length})
            </Text>
            {components.length === 0 && (
                <Text style={{ paddingHorizontal: 14, opacity: 0.7, marginBottom: 8 }}>
                    This product has no subcomponents.
                </Text>
            )}
            {components.map((component, index) => (<ProductCard key={component.id} product={component} />))}
            {editMode || product.ownedBy !== "me" || (
                <Button
                    compact={true}
                    icon="plus"
                    mode="contained"
                    onPress={newComponent}
                    style={{ marginHorizontal: 16, marginVertical: 8 }}
                >
                    Add component
                </Button>
            )}
        </View>
    )
}
