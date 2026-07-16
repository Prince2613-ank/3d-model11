import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Announcement, AnnouncementCategory } from "../types/domain";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Label, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";

const CATEGORIES: AnnouncementCategory[] = ["power_shutdown", "maintenance", "fire_drill", "holiday", "other"];

export function AnnouncementsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["announcements", "all"],
    queryFn: () => api.get<{ announcements: Announcement[] }>("/announcements")
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: invalidate
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/announcements/${id}/active`, { isActive }),
    onSuccess: invalidate
  });

  const columns: Column<Announcement>[] = [
    { header: "Title", render: (a) => <span className="font-medium text-slate-800 dark:text-slate-100">{a.title}</span> },
    { header: "Category", render: (a) => <span className="capitalize">{a.category.replace(/_/g, " ")}</span> },
    { header: "Window", render: (a) => (a.starts_at || a.ends_at ? `${a.starts_at ? new Date(a.starts_at).toLocaleDateString() : "—"} → ${a.ends_at ? new Date(a.ends_at).toLocaleDateString() : "—"}` : "Always") },
    {
      header: "Actions",
      render: (a) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditing(a); setIsModalOpen(true); }}>Edit</Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => toggleActiveMutation.mutate({ id: a.id, isActive: !a.is_active })}
          >
            {a.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteMutation.mutate(a.id)}>Delete</Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="hidden text-xl font-semibold text-slate-900 dark:text-slate-100 sm:block">Announcements</h1>
        <Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setIsModalOpen(true); }}>+ New Announcement</Button>
      </div>

      <DataTable columns={columns} rows={data?.announcements ?? []} keyField={(a) => a.id} isLoading={isLoading} emptyMessage="No announcements yet." />

      {isModalOpen && (
        <AnnouncementFormModal announcement={editing} onClose={() => setIsModalOpen(false)} onDone={invalidate} />
      )}
    </div>
  );
}

function AnnouncementFormModal({ announcement, onClose, onDone }: { announcement: Announcement | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [category, setCategory] = useState<AnnouncementCategory>(announcement?.category ?? "other");
  const [startsAt, setStartsAt] = useState(announcement?.starts_at?.slice(0, 16) ?? "");
  const [endsAt, setEndsAt] = useState(announcement?.ends_at?.slice(0, 16) ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { title, body, category, startsAt: startsAt || null, endsAt: endsAt || null };
      return announcement ? api.patch(`/announcements/${announcement.id}`, payload) : api.post("/announcements", payload);
    },
    onSuccess: () => { onDone(); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={announcement ? "Edit Announcement" : "New Announcement"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!title || !body || mutation.isPending}>Save</Button>
        </>
      }
    >
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled Power Shutdown" />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </Select>
      </div>
      <div>
        <Label>Body</Label>
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>Starts</Label>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <Label>Ends</Label>
          <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}
