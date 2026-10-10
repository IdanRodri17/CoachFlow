// components/LineChart.tsx — a weight-over-time line chart on react-native-svg
// (bundled in Expo Go — no native chart library). Measures its own width.
//
// D28a: restyled to docs/design/screens/client-progress.html — an ink line
// over a faint ink area, gridlines at round values with their labels at the
// end edge, the latest point as a ringed dot with its value, and three dates
// under the axis. Time runs from the start edge: in Hebrew the newest point
// is on the left (right→left), mirrored in English. The trainer's client
// card uses it too.

import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from "react-native-svg";

import { isRTL } from "@/lib/i18n";
import { formatWeight } from "@/lib/workoutSession";
import { AppText, colors, fonts } from "@/components/ui";

export type ChartPoint = { label: string; value: number };

const AXIS = 28;
const EDGE = 10;
const TOP = 12;
const BOTTOM_PAD = 32;

/** A round gridline step: 2 for weights between 63 and 67. */
function niceStep(range: number): number {
  const raw = Math.max(range / 2, 0.5);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
}

export function LineChart({ data, height = 172 }: { data: ChartPoint[]; height?: number }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {data.length === 0 ? (
        <AppText size={14} tone="smoke" center style={{ paddingVertical: 32 }}>
          {t("progress.logToSeeTrend")}
        </AppText>
      ) : width > 0 ? (
        <Chart data={data} width={width} height={height} />
      ) : null}
    </View>
  );
}

function Chart({ data, width, height }: { data: ChartPoint[]; width: number; height: number }) {
  const rtl = isRTL();
  const bottom = height - BOTTOM_PAD;
  const values = data.map((d) => d.value);
  const step = niceStep(Math.max(...values) - Math.min(...values));
  const lo = Math.floor(Math.min(...values) / step) * step;
  let hi = Math.ceil(Math.max(...values) / step) * step;
  if (hi === lo) hi = lo + step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);

  // Laid out in the Hebrew reference's coordinates (axis on the right, newest
  // point on the left), then mirrored for English.
  const mx = (x: number) => (rtl ? x : width - x);
  const anchor = (a: "start" | "end") => (rtl ? a : a === "start" ? "end" : "start");
  const oldestX = width - AXIS - 6;
  const n = data.length;
  const xAt = (i: number) => (n === 1 ? (EDGE + oldestX) / 2 : oldestX - (i / (n - 1)) * (oldestX - EDGE));
  const yAt = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - TOP);

  const pts = data.map((d, i) => `${mx(xAt(i))},${yAt(d.value)}`);
  const last = data[n - 1];
  const lastX = mx(xAt(n - 1));
  const lastY = yAt(last.value);
  const dateIdx = n >= 3 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];

  return (
    <Svg width={width} height={height}>
      {ticks.map((v) => (
        <Line key={`g${v}`} x1={mx(EDGE)} x2={mx(width - AXIS)} y1={yAt(v)} y2={yAt(v)} stroke={colors.mist} strokeWidth={1} />
      ))}
      {ticks.map((v) => (
        <SvgText
          key={`t${v}`}
          x={mx(width)}
          y={yAt(v) + 4}
          textAnchor={anchor("end")}
          fontSize={11}
          fontFamily={fonts.regular}
          fill={colors.smoke}
        >
          {formatWeight(v)}
        </SvgText>
      ))}
      {n > 1 ? (
        <>
          <Polygon
            points={[`${mx(xAt(0))},${bottom}`, ...pts, `${lastX},${bottom}`].join(" ")}
            fill={colors.ink}
            fillOpacity={0.07}
          />
          <Polyline
            points={pts.join(" ")}
            fill="none"
            stroke={colors.ink}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      ) : null}
      <Circle cx={lastX} cy={lastY} r={5} fill={colors.ink} stroke={colors.white} strokeWidth={2} />
      <SvgText
        x={rtl ? lastX + 8 : lastX - 8}
        y={Math.min(lastY + 20, bottom - 4)}
        textAnchor={rtl ? "start" : "end"}
        fontSize={13}
        fontFamily={fonts.semibold}
        fill={colors.ink}
      >
        {formatWeight(last.value)}
      </SvgText>
      {dateIdx.map((i) => (
        <SvgText
          key={`d${i}`}
          x={mx(xAt(i))}
          y={height - 8}
          textAnchor="middle"
          fontSize={11}
          fontFamily={fonts.regular}
          fill={colors.smoke}
        >
          {data[i].label}
        </SvgText>
      ))}
    </Svg>
  );
}
