import {Button, FAB, Modal, Portal, Text, TextInput} from "react-native-paper";
import {View} from "react-native";
import {useRouter} from "expo-router";
import {useState, useEffect} from "react";

import ProductCard from "@/components/common/ProductCard";
import {productComponents} from "@/services/api/fetching";
import {Product} from "@/types/Product";

interface Props {
    product: Product;
    editMode: boolean;
}

export default function ProductComponents({product, editMode}: Props) {
    // Hooks
    const router = useRouter();

    // States
    const [visible, setVisible] = useState(false);
    const [components, setComponents] = useState<Product[]>([]);
    const [newComponentName, setNewComponentName] = useState("");

    // Effects
    useEffect(() => {
        productComponents(product).then(setComponents)
    }, [product]);

    // Callbacks
    const addComponent = () => {
        setVisible(false)
        const params = {id: "new", edit: "true", name: newComponentName, parent: product.id.toString()};
        router.push({pathname: "/products/[id]", params: params});
    }

    // Render
    return (
        <View style={{margin: 10, gap: 10}}>
            <Text variant="titleLarge" style={{ marginBottom: 12, paddingLeft: 10 }}>
                Components ({product.componentIDs.length})
            </Text>
                {components.map((component, index) => (
                    <ProductCard key={component.id} id={component.id} name={component.name} description={component.description} />
                ))}
            {editMode || (
                <Button compact={true} icon="plus" mode="contained" onPress={() => setVisible(true)}>
                    Add component
                </Button>
            )}
            <Portal>
                <Modal
                    visible={visible}
                    onDismiss={() => setVisible(false)}
                    contentContainerStyle={{backgroundColor: 'white', padding: 16, margin: 10, borderRadius: 12}}
                >
                    <TextInput
                        placeholder={"New component name"}
                        value={newComponentName}
                        onChangeText={setNewComponentName}
                        onSubmitEditing={addComponent}
                        autoFocus={true}
                    />
                </Modal>
                <FAB
                    visible={visible}
                    icon={"plus"}
                    onPress={addComponent}
                    style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
                />
            </Portal>
        </View>
    )
}

