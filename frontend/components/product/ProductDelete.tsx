import {Button} from "react-native-paper";
import {deleteProduct} from "@/services/api/saving";
import {Product} from "@/types/Product";
import {useRouter} from "expo-router";
import {useDialog} from "@/components/common/DialogProvider";


interface Props {
    product: Product;
    editMode: boolean;
    onDelete?: () => void;
}


export default function ProductDelete({product, editMode, onDelete}: Props){
    // Hooks
    const dialog = useDialog();

    const onPressDelete = () => {
        dialog.alert({
            title: "Delete Product",
            message: "Are you sure you want to delete this product? This action cannot be undone.",
            buttons: [
                { text: "Cancel", onPress: () => {} },
                { text: "Delete", onPress: onDelete}
            ]
        });
    }

    if (product?.id === "new" || !editMode) {
        return null;
    }

    return(
        <Button
            mode="contained"
            onPress={onPressDelete}
            icon={"delete"}
            style={{
                marginTop: 10,
                marginLeft: 10,
                marginRight: 85,
                height: 54,
                backgroundColor: "#B00020",
                justifyContent: "center",
                alignItems: "center",
        }}
        >
            Delete product
        </Button>
    )
}
