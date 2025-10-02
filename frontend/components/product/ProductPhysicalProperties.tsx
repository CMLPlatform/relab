import {View} from "react-native";
import {Card, Text, TextInput, Divider, Button} from "react-native-paper";
import {useState, Fragment} from "react";
import {Product, PhysicalProperty} from "@/types/Product";
import ProductCard from "@/components/common/ProductCard";
import DimensionSvg from "@/components/common/Dimensions";
import Cube from "@/components/common/SVGCube";

interface Props {
    product: Product;
    editMode: boolean;
    onChangePhysicalProperties?: (newProperties: PhysicalProperty[]) => void;
}

export default function ProductPhysicalProperties({product, editMode, onChangePhysicalProperties}: Props) {
    // Callbacks
    const onChangeProperty = (index: number, newProperty: PhysicalProperty) => {
        const newProperties = [...product.physicalProperties];
        newProperties[index] = newProperty;
        onChangePhysicalProperties?.(newProperties);
    }

    const widthProp = product.physicalProperties.find(p => p.propertyName.toLowerCase() === "width");
    const heightProp = product.physicalProperties.find(p => p.propertyName.toLowerCase() === "height");
    const depthProp = product.physicalProperties.find(p => p.propertyName.toLowerCase() === "depth");

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
            <Cube width={widthProp?.value} height={heightProp?.value} depth={depthProp?.value}></Cube>
            {product.physicalProperties.map((prop, index) => (
                <Fragment key={index}>
                    <PhysicalPropertyCard
                        property={prop}
                        editMode={editMode}
                        onChangeProperty={newProp => onChangeProperty(index, newProp)}
                    />
                    {index < product.physicalProperties.length - 1 && <Divider/>}
                </Fragment>

            ))}
        </View>
    )}


function PhysicalPropertyCard({property, editMode, onChangeProperty}: { property: PhysicalProperty; editMode: boolean; onChangeProperty?: (newProperty: PhysicalProperty) => void}) {
    // States
    const [text, setText] = useState(Number.isNaN(property.value) ? "" : property.value.toString());

    // Render
    return(
        <View style={{ margin: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline"}} >
                <Text variant="labelLarge" style={{paddingHorizontal: 10}}>
                    {property.propertyName}
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
                                onChangeProperty?.({...property, value: parseFloat(s)})
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
                <Text variant="bodyMedium" style={{ width: 30 }}>
                    {" " + property.unit}
                </Text>

            </View>

        </View>
    )
}


