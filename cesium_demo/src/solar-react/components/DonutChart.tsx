import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend as RLegend } from "recharts";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
}

export function DonutChart({ data }: DonutChartProps) {
  const nonZero = data.filter((d) => d.value > 0);
  if (nonZero.length === 0) {
    return <div className="sw-chart-empty">No data to chart.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={nonZero} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
          {nonZero.map((d, i) => (
            <Cell key={i} fill={d.color} stroke="rgba(255,248,218,.95)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "rgba(255,255,255,.96)", border: "1px solid rgba(224,78,28,.25)", borderRadius: 8, color: "#3d2614", fontSize: 11 }}
          itemStyle={{ color: "#3d2614" }}
          labelStyle={{ color: "#7c3a12" }}
        />
        <RLegend wrapperStyle={{ fontSize: 10.5, color: "#5b3923" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
