import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../../lib/api";
import type { ComplaintHistoryEntry, ComplaintWithAsset } from "../../types/domain";
import { Modal } from "../ui/Modal";
import { PriorityBadge, StatusBadge } from "../ui/Badge";
import { Skeleton } from "../ui/Skeleton";

export function ComplaintDetailModal({ complaint, onClose }: { complaint: ComplaintWithAsset; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["complaints", complaint.id, "history"],
    queryFn: () => api.get<{ history: ComplaintHistoryEntry[] }>(`/complaints/${complaint.id}/history`)
  });

  return (
    <Modal isOpen onClose={onClose} title="Complaint details" size="xl">
      <div className="overflow-hidden rounded-[22px] bg-gradient-to-br from-slate-950 via-brand-950 to-brand-800 p-5 text-white sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-center gap-4">
            {complaint.asset_image_url ? <img src={complaint.asset_image_url} alt={complaint.asset_name} className="h-16 w-16 shrink-0 rounded-2xl border border-white/15 object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-2xl font-black">{complaint.asset_category.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-brand-300">{complaint.asset_category.replaceAll("_", " ")}</p><h3 className="mt-1 truncate text-2xl font-black">{complaint.asset_name}</h3><p className="mt-1 text-sm text-brand-200">{complaint.issue_type}</p></div>
          </div>
          <div className="flex gap-2"><PriorityBadge priority={complaint.priority} /><StatusBadge status={complaint.status} /></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-4">
          <DetailSection title="Problem description"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{complaint.description}</p></DetailSection>

          <DetailSection title={`Proof images (${complaint.photo_urls?.length ?? 0})`}>
            {(complaint.photo_urls?.length ?? 0) > 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{complaint.photo_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5"><img src={url} alt={`Complaint proof ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /><span className="absolute inset-x-2 bottom-2 rounded-lg bg-slate-950/70 px-2 py-1 text-center text-[9px] font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100">Open full image</span></a>)}</div> : <p className="text-sm text-slate-400">No proof images attached.</p>}
          </DetailSection>

          {complaint.assigned_notes && <DetailSection title="Assignment notes"><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{complaint.assigned_notes}</p></DetailSection>}
          {complaint.admin_reply && <DetailSection title="Admin reply"><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{complaint.admin_reply}</p></DetailSection>}
          {complaint.resolution_text && <DetailSection title="Resolution"><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{complaint.resolution_text}</p>{complaint.resolution_image_url && <a href={complaint.resolution_image_url} target="_blank" rel="noreferrer"><img src={complaint.resolution_image_url} alt="Resolution proof" className="mt-3 max-h-52 rounded-xl object-cover" /></a>}</DetailSection>}
        </div>

        <div className="space-y-4">
          <DetailSection title="Report information">
            <Fact label="Reporter" value={complaint.reporter_name} /><Fact label="Email" value={complaint.reporter_email} /><Fact label="Created" value={new Date(complaint.created_at).toLocaleString()} /><Fact label="Last updated" value={new Date(complaint.updated_at).toLocaleString()} /><Fact label="Assigned to" value={complaint.assigned_to_name || "Not assigned"} />{complaint.assigned_deadline && <Fact label="Deadline" value={new Date(complaint.assigned_deadline).toLocaleString()} />}
          </DetailSection>

          <DetailSection title="Activity timeline">
            {isLoading ? <Skeleton className="h-28" /> : (data?.history.length ?? 0) === 0 ? <p className="text-sm text-slate-400">No activity recorded yet.</p> : <TimelineList history={dedupeHistory(data!.history)} />}
          </DetailSection>
        </div>
      </div>
    </Modal>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[.03]"><h4 className="mb-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{title}</h4>{children}</section>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 py-2.5 last:border-0 dark:border-white/5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span><span className="max-w-[65%] break-words text-right text-xs font-bold text-slate-700 dark:text-slate-200">{value}</span></div>; }

const TIMELINE_DOT_CLASS: Record<string, string> = {
  pending: "bg-amber-500 ring-amber-50 dark:ring-amber-500/10",
  assigned: "bg-sky-500 ring-sky-50 dark:ring-sky-500/10",
  resolved: "bg-emerald-500 ring-emerald-50 dark:ring-emerald-500/10",
  rejected: "bg-rose-500 ring-rose-50 dark:ring-rose-500/10",
};

// Older data (created before the backend guarded against re-resolving an
// already-resolved complaint) can contain back-to-back rows for the same
// transition — collapse those so the timeline reads as one event, not two.
function dedupeHistory(history: ComplaintHistoryEntry[]): ComplaintHistoryEntry[] {
  return history.filter((entry, index) => {
    const prev = history[index - 1];
    return !prev || prev.to_status !== entry.to_status || prev.note !== entry.note;
  });
}

function TimelineList({ history }: { history: ComplaintHistoryEntry[] }) {
  return (
    <div className="space-y-5 border-l-2 border-brand-100 pl-5 dark:border-brand-500/20">
      {history.map((entry, index) => {
        const isLatest = index === history.length - 1;
        const dotClass = (entry.to_status && TIMELINE_DOT_CLASS[entry.to_status]) || "bg-brand-500 ring-brand-50 dark:ring-slate-900";
        return (
          <div key={entry.id} className="relative">
            <span className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ${dotClass}`} />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-extrabold capitalize text-slate-700 dark:text-slate-200">{entry.to_status ? `${entry.from_status || "New"} → ${entry.to_status}` : "Complaint updated"}</p>
              {isLatest && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">Latest</span>}
            </div>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">{new Date(entry.created_at).toLocaleString()}</p>
            {entry.note && <p className="mt-1.5 rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-xs leading-5 text-slate-600 dark:bg-white/5 dark:text-slate-300">{entry.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
