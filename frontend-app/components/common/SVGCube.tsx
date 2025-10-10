import React from "react";
import { Dimensions } from "react-native";
import Svg, {
    Rect,
    G,
} from "react-native-svg";
import {useTheme} from "react-native-paper";

type CubeProps = {
    width?: number;   // width along X
    height?: number;  // height along Y
    depth?: number;   // depth along Z
};

export default function Cube({ width = 1, height = 1, depth = 1}: CubeProps) {
    // Hooks
    const theme = useTheme();


    if (Number.isNaN(width)) width = 1;
    if (Number.isNaN(height)) height = 1;
    if (Number.isNaN(depth)) depth = 1;

    // Calculate SVG dimensions to fit the cube
    const highest = Math.max(width, depth, height);
    const factor = 90 / highest;

    width *= factor;
    height *= factor;
    depth *= factor;

    const gWidth = (Dimensions.get("window").width - (width + depth)) / 2
    const svgHeight = height + (Math.tan(0.52) * width) + (Math.tan(0.52) * depth) - 50;

    return (
        <Svg width="100%" height="250" >
            <G transform={`translate(${gWidth} ${(250 - svgHeight) / 2})`}>
                <Rect
                    width={width}
                    height={height}
                    fill={theme.colors.primary}
                    stroke="black"
                    transform="skewY(30)"
                />
                <Rect
                    width={depth}
                    height={height}
                    fill={theme.colors.secondary}
                    stroke="black"
                    transform={`skewY(-30) translate(${width} ${2 * (Math.tan(0.52) * width)})`}
                />
                <Rect
                    width={width}
                    height={depth}
                    fill={theme.colors.primaryContainer}
                    stroke="black"
                    transform={`scale(1.41,.81) rotate(45) translate(0 -${depth})`}
                />
            </G>
        </Svg>
    );
}
