import {View} from "react-native";
import {Text, TextInput} from "@/components/base";
import {Divider} from "react-native-paper";
import {useState, Fragment} from "react";
import {Product, PhysicalProperties} from "@/types/Product";
import Cube from "@/components/common/SVGCube";

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
    // States
    const [text, setText] = useState(Number.isNaN(value) ? "" : value.toString());

    // Render
    return(
        <View style={{ marginHorizontal: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline"}} >
                <Text style={{paddingHorizontal: 10}}>
                    {name}
                </Text>
            <View style={{flexDirection: "row", justifyContent: "space-between", alignItems: "baseline"}}>
                    <TextInput
                        style={{
                            width: 80,
                            height: 40,
                            outline: "none",
                            textAlign: "right",
                            fontSize: 14,
                            fontWeight: "bold",
                        }}
                        value={text}
                        onChangeText={s => {
                            if(s.match("^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$") || s === "") {
                                setText(s)
                                onChangeProperty?.(name.toLowerCase(), parseFloat(s))
                            }
                        }}
                        textAlign={"right"}
                        textAlignVertical={"top"}
                        keyboardType={"numeric"}
                        placeholder={"Set value"}
                        editable={editMode}
                    />
                <Text style={{ width: 30, fontWeight: "bold" }}>
                    {" " + unit}
                </Text>

            </View>

        </View>
    )
}


