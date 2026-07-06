import type { ReactNode } from "react";
import { TableSkeleton } from "./Skeleton";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, rows, keyField, isLoading, emptyMessage = "No records found." }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {columns.map((col) => (
              <th key={col.header} className={`px-4 py-3 font-medium ${col.className ?? ""}`}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="p-4">
                <TableSkeleton columns={columns.length} />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={keyField(row)} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                {columns.map((col) => (
                  <td key={col.header} className={`px-4 py-3 align-middle text-slate-700 dark:text-slate-300 ${col.className ?? ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
