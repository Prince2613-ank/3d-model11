import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export interface BarDatum {
  label: string;
  value: number;
  color: string;
}

interface CommunityBarChartProps {
  data: BarDatum[];
  valueLabel: string;
}

function compactNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

export function CommunityBarChart({ data, valueLabel }: CommunityBarChartProps) {
  if (data.every((d) => d.value === 0)) {
    return <div className="sw-chart-empty">No data to chart.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,73,22,.16)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#785334", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: "#8a6040", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={compactNum}
        />
        <Tooltip
          contentStyle={{ background: "rgba(255,255,255,.96)", border: "1px solid rgba(224,78,28,.25)", borderRadius: 8, color: "#3d2614", fontSize: 11 }}
          itemStyle={{ color: "#3d2614" }}
          labelStyle={{ color: "#7c3a12" }}
          formatter={(v: number) => [`${v.toLocaleString()} ${valueLabel}`, ""]}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
