import { motion } from "framer-motion";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  index: number;
}

export function KpiCard({ label, value, sub, index }: KpiCardProps) {
  return (
    <motion.div
      className="sw-kpi-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <div className="sw-kpi-label">{label}</div>
      <div className="sw-kpi-value">{value}</div>
      {sub && <div className="sw-kpi-sub">{sub}</div>}
    </motion.div>
  );
}
