import {View, Text} from "react-native";
import {TextInput, Divider} from "react-native-paper";
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
                    <PhysicalPropertyCard
                        name={nameMap[prop as keyof PhysicalProperties]}
                        value={product.physicalProperties[prop as keyof PhysicalProperties]}
                        unit={unitMap[prop as keyof PhysicalProperties]}
                        editMode={editMode}
                        onChangeProperty={onChangeProperty}
                    />
                    {index < 4 && <Divider/>}
                </Fragment>

            ))}
        </View>
    )}


function PhysicalPropertyCard({name, value, unit, editMode, onChangeProperty}: { name: string; value: number; unit: string; editMode: boolean; onChangeProperty?: (name: string, value: number) => void}) {
    // States
    const [text, setText] = useState(Number.isNaN(value) ? "" : value.toString());

    // Render
    return(
        <View style={{ margin: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline"}} >
                <Text style={{paddingHorizontal: 10}}>
                    {name}
                </Text>
            <View style={{flexDirection: "row", justifyContent: "space-between", alignItems: "baseline"}}>
                {editMode ? (
                    <TextInput
                        mode={"outlined"}
                        style={{height: 26, width: 80, textAlign: "right", lineHeight: 24, fontSize: 14
                    }}
                        contentStyle={{padding: 0, paddingHorizontal: 5}}
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
                        error={text === ""}
                    />

                ) : (
                    <Text style={{height: 25, width: 80, textAlign: "right", padding: 5}}>
                        {text}
                    </Text>
                )}
                <Text style={{ width: 30 }}>
                    {" " + unit}
                </Text>

            </View>

        </View>
    )
}


