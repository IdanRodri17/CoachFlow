// components/ColumnChart.tsx — D27: a single-series column chart
// (docs/design/screens/trainer-money.html, "הכנסות לפי חודש").
//
// Ink bars 24 wide with 4 px rounded tops, faint gridlines at 0 / half / top
// with their values at the end edge, the month under each bar. A bar can
// carry a light "cap" stacked on it (the current month's projection), with
// its total printed above it. Oldest first in the data; laid out from the
// start edge, so in Hebrew the oldest bar sits on the right, next to the axis
// labels. Drawn with react-native-svg at the measured width.

import { useState } from "react";
import { View } from "react-native";
import Svg, { G, Line, Path, Text as SvgText } from "react-native-svg";

import { isRTL } from "@/lib/i18n";
import { colors, fonts } from "@/components/ui";

export type Column = {
  label: string;
  value: number;
  /** Extra on top of value (e.g. projected − earned), drawn light. */
  cap?: number;
  /** Bold label — the current month. */
  current?: boolean;
};

const HEIGHT = 192;
const BASELINE = 164;
const LABEL_Y = 184;
/** Room above the tallest bar for its cap label. */
const PLOT_TOP = 40;
const BAR = 24;
const RADIUS = 4;
const AXIS = 36;

/** A round step for two gridlines above zero: 4,000 for a max of 8,100. */
function niceStep(max: number): number {
  if (max <= 0) return 1;
  const raw = max / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const nice = n >= 5 ? 5 : n >= 2.5 ? 2.5 : n >= 2 ? 2 : 1;
  return nice * mag;
}

/** A column from y0 (bottom) to y1 (top), rounded on top only. */
function barPath(x: number, y0: number, y1: number, rounded: boolean): string {
  const r = rounded ? Math.min(RADIUS, (y0 - y1) / 2) : 0;
  return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + BAR - r} Q${x + BAR},${y1} ${x + BAR},${y1 + r} V${y0} Z`;
}

export function ColumnChart({
  columns,
  format,
  accessibilityLabel,
}: {
  columns: Column[];
  format: (n: number) => string;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const rtl = isRTL();
  const max = Math.max(1, ...columns.map((c) => c.value + (c.cap ?? 0)));
  const step = niceStep(max);
  const y = (v: number) => BASELINE - (v / max) * (BASELINE - PLOT_TOP);
  // The plot sits between the axis labels (start edge) and the far edge;
  // bar i is centred in its slot, counted from the axis — so in Hebrew the
  // oldest bar is on the right, beside the labels.
  const plotW = Math.max(0, width - AXIS - 4);
  const slot = columns.length ? plotW / columns.length : 0;
  const xOf = (i: number) => {
    const fromAxis = slot * (i + 0.5);
    const center = rtl ? width - AXIS - fromAxis : AXIS + fromAxis;
    return center - BAR / 2;
  };
  const ticks = [0, step, step * 2].filter((v) => v <= max * 1.02);
  const axisX = rtl ? width : 0;
  const axisAnchor = rtl ? "end" : "start";
  const gridFrom = rtl ? 4 : AXIS;
  const gridTo = rtl ? width - AXIS : width - 4;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: HEIGHT }}
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((v, i) => (
            <Line
              key={`g${v}`}
              x1={gridFrom}
              x2={gridTo}
              y1={y(v)}
              y2={y(v)}
              stroke={i === 0 ? colors.lineStrong : colors.mist}
              strokeWidth={1}
            />
          ))}
          {ticks.map((v) => (
            <SvgText
              key={`t${v}`}
              x={axisX}
              y={y(v) + 4}
              textAnchor={axisAnchor}
              fontSize={11}
              fontFamily={fonts.regular}
              fill={colors.smoke}
            >
              {format(v)}
            </SvgText>
          ))}
          {columns.map((c, i) => {
            const x = xOf(i);
            const top = y(c.value);
            const cap = c.cap ?? 0;
            return (
              <G key={c.label}>
                {c.value > 0 ? <Path d={barPath(x, BASELINE, top, cap <= 0)} fill={colors.ink} /> : null}
                {cap > 0 ? (
                  <>
                    <Path d={barPath(x, top - 2, y(c.value + cap), true)} fill={colors.lineStrong} />
                    <SvgText
                      x={x + BAR / 2}
                      y={y(c.value + cap) - 8}
                      textAnchor="middle"
                      fontSize={12}
                      fontFamily={fonts.semibold}
                      fill={colors.ink}
                    >
                      {format(c.value + cap)}
                    </SvgText>
                  </>
                ) : null}
                <SvgText
                  x={x + BAR / 2}
                  y={LABEL_Y}
                  textAnchor="middle"
                  fontSize={12}
                  fontFamily={c.current ? fonts.semibold : fonts.regular}
                  fill={c.current ? colors.ink : colors.smoke}
                >
                  {c.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
