import {useState} from "react";
import {TextInput} from "@/components/base";

import {Product} from "@/types/Product";
import {StyleSheet} from "react-native";
import LightTheme from "@/assets/themes/light";
import DarkTheme from "@/assets/themes/dark";


interface Props {
    product: Product;
    editMode: boolean;
    onChangeDescription?: (newDescription: string) => void;
}

export default function ProductDescription({product, editMode, onChangeDescription}: Props) {
    // States
    const [text, setText] = useState(product.description || "");

    // Render
    return (
        <TextInput
            style={{padding: 14, fontSize: 16, lineHeight: 26}}
            placeholder={"Add a product description"}
            value={text}
            onChangeText={text => {setText(text); onChangeDescription?.(text)}}
            editable={editMode}
            multiline
            errorOnEmpty
        />
    )
}
