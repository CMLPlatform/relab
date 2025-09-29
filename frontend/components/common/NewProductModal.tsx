import {FAB, Modal, Portal, TextInput} from "react-native-paper";
import {useRouter} from "expo-router";
import {useState} from "react";

interface Props {
    onDone: () => void;
    parentID?: number | "new";
}


export default function NewProductModal({ onDone, parentID }: Props) {
    // Hooks
    const router = useRouter();

    // States
    const [productName, setProductName] = useState("");

    // Callbacks
    const createProduct = () => {
        const params = { id: "new", edit: "true", name: productName, parent: parentID ? parentID.toString() : undefined };
        router.push({ pathname: "/products/[id]", params: params });
        onDone();
    };

    // Render
    return (
        <Portal>
            <Modal
                visible={true}
                onDismiss={onDone}
                contentContainerStyle={{backgroundColor: 'white', padding: 16, margin: 10, borderRadius: 12}}
            >
                <TextInput
                    placeholder={parentID ? "New component name" : "New product name"}
                    value={productName}
                    onChangeText={setProductName}
                    onSubmitEditing={productName.length ? createProduct : onDone}
                    autoFocus={true}
                />
            </Modal>
            <FAB
                icon={"plus"}
                onPress={createProduct}
                style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
                visible={productName.length !== 0}
            />
        </Portal>
    );
}

