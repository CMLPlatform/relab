import {Button, Text} from "react-native-paper";
import {View} from "react-native";
import {useState, useEffect} from "react";

import ProductCard from "@/components/common/ProductCard";
import NewProductModal from "@/components/common/NewProductModal";
import {productComponents} from "@/services/api/fetching";
import {Product} from "@/types/Product";

interface Props {
    product: Product;
    editMode: boolean;
}

export default function ProductComponents({product, editMode}: Props) {
    // States
    const [modalVisible, setModalVisible] = useState(false);
    const [components, setComponents] = useState<Product[]>([]);

    // Effects
    useEffect(() => {
        productComponents(product).then(setComponents)
    }, [product]);

    // Render
    return (
        <View style={{margin: 10, gap: 10}}>
            <Text variant="titleLarge" style={{ marginBottom: 12, paddingLeft: 10 }}>
                Components ({product.componentIDs.length})
            </Text>
                {components.map((component, index) => (
                    <ProductCard key={component.id} id={component.id} name={component.name} description={component.description} />
                ))}
            {editMode || product.ownedBy !== "me" || (
                <Button compact={true} icon="plus" mode="contained" onPress={() => setModalVisible(true)}>
                    Add component
                </Button>
            )}
            {modalVisible && <NewProductModal onDone={() => setModalVisible(false)} parentID={product.id} />}
        </View>
    )
}

