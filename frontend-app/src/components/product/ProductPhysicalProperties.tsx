import RN, {Pressable, View, Platform} from "react-native";
import {Text, TextInput} from "@/components/base";
import {Divider} from "react-native-paper";
import {useState, useRef, Fragment} from "react";
import {Product, PhysicalProperties} from "@/types/Product";
import Cube from "@/components/common/SVGCube";

import LightTheme from "@/assets/themes/light";
import DarkTheme from "@/assets/themes/dark";

interface Props {
    product: Product;
    editMode: boolean;
    onChangePhysicalProperties?: (newProperties: PhysicalProperties) => void;
}

const unitMap = {
    weight: "kg",
    height: "cm",
    width: "cm",
    depth: "cm"
}

const nameMap = {
    weight: "Weight",
    height: "Height",
    width: "Width",
    depth: "Depth"
}

export default function ProductPhysicalProperties({product, editMode, onChangePhysicalProperties}: Props) {
    // Callbacks
    const onChangeProperty = (key: string, value: number) => {
        const newProperties = {...product.physicalProperties, [key]: value};
        onChangePhysicalProperties?.(newProperties);
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
                Physical Properties
            </Text>
            <Cube
                width={product.physicalProperties.width}
                height={product.physicalProperties.height}
                depth={product.physicalProperties.depth}
            />
            {Object.keys(product.physicalProperties).map((prop, index) => (
                <Fragment key={index}>
                    <Divider/>
                    <PhysicalPropertyRow
                        name={nameMap[prop as keyof PhysicalProperties]}
                        value={product.physicalProperties[prop as keyof PhysicalProperties]}
                        unit={unitMap[prop as keyof PhysicalProperties]}
                        editMode={editMode}
                        onChangeProperty={onChangeProperty}
                    />
                </Fragment>

            ))}
        </View>
    )}


function PhysicalPropertyRow({name, value, unit, editMode, onChangeProperty}: { name: string; value: number; unit: string; editMode: boolean; onChangeProperty?: (name: string, value: number) => void}) {
    // Hooks
    const textInput = useRef<RN.TextInput>(null);

    // States
    const [text, setText] = useState(Number.isNaN(value) ? "" : value.toString());

    // Callbacks
    const onPress = () => {
        if(editMode) {
            textInput.current?.focus();
        }
    }

    // Render
    return(
        <Pressable
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 15,
                gap: 2,
            }}
            onPress={onPress}
        >
            <Text
                style={{
                    flexGrow: 2,
                }}
            >
                {name}
            </Text>
            <TextInput
                style={{
                    textAlign: Platform.OS === "web" ? "right" : undefined,
                    outline: "none",
                    height: 38,
                    paddingHorizontal: 10,
                    marginVertical: 2,
                    borderRadius: 50,
                    // @ts-ignore because this works on the web
                    fieldSizing: "content",
                }}
                value={text}
                onChangeText={s => {
                    if(s.match("^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$") || s === "") {
                        setText(s)
                    }
                }}
                onBlur={() => onChangeProperty?.(name.toLowerCase(), parseFloat(text))}
                keyboardType={"numeric"}
                placeholder={"Set value"}
                editable={editMode}
                ref={textInput}
                errorOnEmpty
            />
            <Text
                style={{
                    fontWeight: "bold",
                    width: 30,
                }}

            >{unit}</Text>
        </Pressable>
    )
}
