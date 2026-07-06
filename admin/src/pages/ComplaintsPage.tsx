import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ComplaintPriority, ComplaintStatus, ComplaintWithAsset } from "../types/domain";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge, PriorityBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select, Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import {
  AssignComplaintModal,
  ResolveComplaintModal,
  RejectComplaintModal,
  ReplyComplaintModal
} from "../components/complaints/ComplaintActionModals";

interface Filters {
  status: ComplaintStatus | "";
  priority: ComplaintPriority | "";
  search: string;
}

type ActiveModal = { type: "assign" | "resolve" | "reject" | "reply" | "delete"; complaint: ComplaintWithAsset } | null;

export function ComplaintsPage() {
  const [filters, setFilters] = useState<Filters>({ status: "", priority: "", search: "" });
  const [page, setPage] = useState(1);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const queryClient = useQueryClient();

  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.search) params.set("search", filters.search);
  params.set("page", String(page));
  params.set("pageSize", "20");

  const { data, isLoading } = useQuery({
    queryKey: ["complaints", filters, page],
    queryFn: () => api.get<{ complaints: ComplaintWithAsset[]; total: number; pageSize: number }>(`/complaints?${params.toString()}`)
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["complaints"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/complaints/${id}`),
    onSuccess: () => { invalidate(); setActiveModal(null); }
  });

  const columns: Column<ComplaintWithAsset>[] = [
    {
      header: "Object",
      render: (c) => (
        <div className="flex items-center gap-3">
          {c.asset_image_url ? (
            <img src={c.asset_image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs dark:bg-slate-800">
              {c.asset_category.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{c.asset_name}</p>
            <p className="text-xs text-slate-400">{c.issue_type}</p>
          </div>
        </div>
      )
    },
    {
      header: "Reporter",
      render: (c) => (
        <div>
          <p className="text-slate-700 dark:text-slate-300">{c.reporter_name}</p>
          <p className="text-xs text-slate-400">{c.reporter_email}</p>
        </div>
      )
    },
    { header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
    { header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { header: "Created", render: (c) => new Date(c.created_at).toLocaleString() },
    {
      header: "Actions",
      render: (c) => (
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setActiveModal({ type: "assign", complaint: c })}>
            Assign
          </Button>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setActiveModal({ type: "reply", complaint: c })}>
            Reply
          </Button>
          <Button variant="primary" className="px-2 py-1 text-xs" onClick={() => setActiveModal({ type: "resolve", complaint: c })}>
            Resolve
          </Button>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setActiveModal({ type: "reject", complaint: c })}>
            Reject
          </Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setActiveModal({ type: "delete", complaint: c })}>
            Delete
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Complaints</h1>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
        <Select
          className="w-40"
          value={filters.status}
          onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value as ComplaintStatus | "" })); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select
          className="w-40"
          value={filters.priority}
          onChange={(e) => { setFilters((f) => ({ ...f, priority: e.target.value as ComplaintPriority | "" })); setPage(1); }}
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
        <Input
          className="w-64"
          placeholder="Search reporter, description…"
          value={filters.search}
          onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
        />
      </div>

      <DataTable columns={columns} rows={data?.complaints ?? []} keyField={(c) => c.id} isLoading={isLoading} emptyMessage="No complaints match these filters." />

      {(data?.total ?? 0) > 20 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {Math.ceil((data?.total ?? 0) / 20)}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= Math.ceil((data?.total ?? 0) / 20)} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {activeModal?.type === "assign" && (
        <AssignComplaintModal complaint={activeModal.complaint} onClose={() => setActiveModal(null)} onDone={invalidate} />
      )}
      {activeModal?.type === "resolve" && (
        <ResolveComplaintModal complaint={activeModal.complaint} onClose={() => setActiveModal(null)} onDone={invalidate} />
      )}
      {activeModal?.type === "reject" && (
        <RejectComplaintModal complaint={activeModal.complaint} onClose={() => setActiveModal(null)} onDone={invalidate} />
      )}
      {activeModal?.type === "reply" && (
        <ReplyComplaintModal complaint={activeModal.complaint} onClose={() => setActiveModal(null)} onDone={invalidate} />
      )}
      {activeModal?.type === "delete" && (
        <Modal
          isOpen
          onClose={() => setActiveModal(null)}
          title="Delete complaint"
          footer={
            <>
              <Button variant="secondary" onClick={() => setActiveModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => deleteMutation.mutate(activeModal.complaint.id)} disabled={deleteMutation.isPending}>
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This soft-deletes the complaint for <strong>{activeModal.complaint.asset_name}</strong>. It can be restored from the database if needed.
          </p>
        </Modal>
      )}
    </div>
  );
}
