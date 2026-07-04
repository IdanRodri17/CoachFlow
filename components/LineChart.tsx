// components/LineChart.tsx — a minimal weight-over-time line chart built on
// react-native-svg (which IS bundled in Expo Go — no native chart library, so no
// dev build needed). Measures its own width via onLayout.

import { useState } from "react";
import { Text as RNText, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

export type ChartPoint = { label: string; value: number };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function LineChart({ data, height = 200 }: { data: ChartPoint[]; height?: number }) {
  const [width, setWidth] = useState(0);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {data.length === 0 ? (
        <RNText className="py-8 text-center text-sm text-slate-400">
          Log your weight to see the trend.
        </RNText>
      ) : width > 0 ? (
        <Chart data={data} width={width} height={height} />
      ) : null}
    </View>
  );
}

function Chart({ data, width, height }: { data: ChartPoint[]; width: number; height: number }) {
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const y = (v: number) => padT + chartH - ((v - min) / range) * chartH;

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  return (
    <Svg width={width} height={height}>
      {/* Axes */}
      <Line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#e2e8f0" strokeWidth={1} />
      <Line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="#e2e8f0" strokeWidth={1} />

      {/* Y range labels */}
      <SvgText x={padL - 6} y={padT + 4} fontSize={10} fill="#94a3b8" textAnchor="end">
        {fmt(max)}
      </SvgText>
      <SvgText x={padL - 6} y={padT + chartH} fontSize={10} fill="#94a3b8" textAnchor="end">
        {fmt(min)}
      </SvgText>

      {/* Line + dots */}
      {n > 1 ? <Polyline points={points} fill="none" stroke="#4f46e5" strokeWidth={2} /> : null}
      {data.map((d, i) => (
        <Circle key={i} cx={x(i)} cy={y(d.value)} r={3} fill="#4f46e5" />
      ))}

      {/* First / last date labels */}
      <SvgText x={padL} y={height - 6} fontSize={10} fill="#94a3b8" textAnchor="start">
        {data[0].label}
      </SvgText>
      {n > 1 ? (
        <SvgText x={padL + chartW} y={height - 6} fontSize={10} fill="#94a3b8" textAnchor="end">
          {data[n - 1].label}
        </SvgText>
      ) : null}
    </Svg>
  );
}
