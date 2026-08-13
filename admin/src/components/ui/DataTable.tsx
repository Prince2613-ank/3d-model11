import type { ReactNode } from "react";
import { TableSkeleton } from "./Skeleton";

export interface Column<T> { header: string; render: (row: T) => ReactNode; className?: string; }
interface DataTableProps<T> { columns: Column<T>[]; rows: T[]; keyField: (row: T) => string; isLoading?: boolean; emptyMessage?: string; onRowClick?: (row: T) => void; }

export function DataTable<T>({ columns, rows, keyField, isLoading, emptyMessage = "No records found.", onRowClick }: DataTableProps<T>) {
  if (isLoading) return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900"><TableSkeleton columns={Math.min(columns.length, 4)} /></div>;
  if (rows.length === 0) return <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-12 text-center text-sm font-semibold text-slate-400 dark:border-white/10 dark:bg-slate-900/60">{emptyMessage}</div>;

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => <article key={keyField(row)} onClick={() => onRowClick?.(row)} onKeyDown={(event) => { if (onRowClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row); } }} role={onRowClick ? "button" : undefined} tabIndex={onRowClick ? 0 : undefined} className={`overflow-hidden rounded-[20px] border border-white/80 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,.07)] dark:border-white/10 dark:bg-slate-900 ${onRowClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:hover:border-brand-500/30" : ""}`}>
          {columns.map((col, index) => <div key={col.header} className={`${index === 0 ? "pb-3" : "flex items-start justify-between gap-4 border-t border-slate-100 py-3 dark:border-white/5"}`}>
            {index > 0 && <span className="shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-[.13em] text-slate-400">{col.header}</span>}
            <div className={`${index === 0 ? "text-base" : "min-w-0 text-right text-sm text-slate-700 dark:text-slate-300"}`}>{col.render(row)}</div>
          </div>)}
        </article>)}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60 md:block">
        <table className="w-full min-w-max text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">{columns.map((col) => <th key={col.header} className={`px-4 py-3 font-medium ${col.className ?? ""}`}>{col.header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((row) => <tr key={keyField(row)} onClick={() => onRowClick?.(row)} onKeyDown={(event) => { if (onRowClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row); } }} tabIndex={onRowClick ? 0 : undefined} className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${onRowClick ? "cursor-pointer focus:bg-brand-50/60 focus:outline-none dark:focus:bg-brand-500/10" : ""}`}>{columns.map((col) => <td key={col.header} className={`px-4 py-3 align-middle text-slate-700 dark:text-slate-300 ${col.className ?? ""}`}>{col.render(row)}</td>)}</tr>)}</tbody></table>
      </div>
    </>
  );
}
