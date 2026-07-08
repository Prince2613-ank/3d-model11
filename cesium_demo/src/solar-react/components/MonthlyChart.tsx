import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

interface MonthlyChartProps {
  data: any[];
  currentMonthIndex: number;
  unit?: string;
  label?: string;
}

export function MonthlyChart({ data, currentMonthIndex, unit = "kWh/day", label = "Production" }: MonthlyChartProps) {
  if (data.length === 0) {
    return <div className="sw-chart-empty">Not enough data to chart.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,73,22,.16)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#785334", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#8a6040", fontSize: 9 }} axisLine={false} tickLine={false} width={45} />
        <Tooltip
          contentStyle={{ background: "rgba(255,255,255,.96)", border: "1px solid rgba(224,78,28,.25)", borderRadius: 8, color: "#3d2614", fontSize: 11 }}
          itemStyle={{ color: "#3d2614" }}
          labelStyle={{ color: "#7c3a12" }}
          formatter={(v: number) => [`${unit === "₹/day" ? "₹" : ""}${v} ${unit === "₹/day" ? "" : unit}`, label]}
        />
        <Bar dataKey="dailyKwh" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === currentMonthIndex ? "#f97316" : "#facc15"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
