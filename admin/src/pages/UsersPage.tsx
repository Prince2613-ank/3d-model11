import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Asset, Profile, UserRole } from "../types/domain";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea, Label } from "../components/ui/Input";
import { useAuth } from "../contexts/AuthContext";
import { Modal } from "../components/ui/Modal";
import { QrCodeModal } from "../components/ui/QrCodeModal";
import { useAllFloors } from "../hooks/useAllFloors";
import { buildAssetKioskLink } from "../lib/kioskLink";

export function UsersPage() {
  const { profile: currentProfile } = useAuth();
  const { data: floors } = useAllFloors();
  const [search, setSearch] = useState("");
  const [messageTarget, setMessageTarget] = useState<Profile | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [qrLink, setQrLink] = useState<{ title: string; value: string } | null>(null);
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function handleGenerateSeatQr(p: Profile): Promise<void> {
    setQrLoadingId(p.id);
    try {
      const { assets } = await api.get<{ assets: Asset[] }>(`/assets/assigned/${p.id}`);
      const asset = assets[0];
      if (!asset) {
        window.alert(`${p.display_name || p.email} has no assigned seat yet. Assign one from the Employees page first.`);
        return;
      }
      const floor = floors?.find((f) => f.id === asset.floor_id);
      if (!floor) {
        window.alert("Could not resolve this seat's floor.");
        return;
      }
      setQrLink({
        title: `Seat QR — ${p.display_name || p.email}`,
        value: buildAssetKioskLink(asset.object_key, floor.floor_number)
      });
    } finally {
      setQrLoadingId(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["users", search],
    queryFn: () => api.get<{ profiles: Profile[] }>(`/users${search ? `?search=${encodeURIComponent(search)}` : ""}`)
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const setRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.patch(`/users/${id}/role`, { role }),
    onSuccess: invalidate
  });

  const setActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}/active`, { isActive }),
    onSuccess: invalidate
  });

  const messageMutation = useMutation({
    mutationFn: () => api.post("/notifications/message", { userId: messageTarget!.id, subject, message }),
    onSuccess: () => {
      const recipient = messageTarget?.display_name || messageTarget?.email || "employee";
      setSentMessage(`Message sent to ${recipient}`);
      window.setTimeout(() => setSentMessage(""), 4500);
      setMessageTarget(null);
      setSubject("");
      setMessage("");
    }
  });

  const columns: Column<Profile>[] = [
    {
      header: "User",
      render: (p) => (
        <div className="flex items-center gap-2">
          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />}
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{p.display_name || "—"}</p>
            <p className="text-xs text-slate-400">{p.email}</p>
          </div>
        </div>
      )
    },
    {
      header: "Role",
      render: (p) => (
        <Select
          className="w-32"
          value={p.role}
          disabled={p.id === currentProfile?.id}
          onChange={(e) => setRoleMutation.mutate({ id: p.id, role: e.target.value as UserRole })}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </Select>
      )
    },
    { header: "Last Login", render: (p) => (p.last_login_at ? new Date(p.last_login_at).toLocaleString() : "Never") },
    {
      header: "Status",
      render: (p) => (
        <Button
          variant={p.is_active ? "secondary" : "danger"}
          className="px-2 py-1 text-xs"
          disabled={p.id === currentProfile?.id}
          onClick={() => setActiveMutation.mutate({ id: p.id, isActive: !p.is_active })}
        >
          {p.is_active ? "Active" : "Deactivated"}
        </Button>
      )
    },
    {
      header: "Message",
      render: (p) => (
        <Button
          variant="primary"
          className="px-3 py-1.5 text-xs"
          disabled={p.id === currentProfile?.id || !p.is_active}
          onClick={() => setMessageTarget(p)}
        >
          Message
        </Button>
      )
    },
    {
      header: "Seat QR",
      render: (p) => (
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          disabled={qrLoadingId === p.id}
          onClick={() => void handleGenerateSeatQr(p)}
        >
          {qrLoadingId === p.id ? "Loading…" : "QR"}
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <h1 className="hidden text-xl font-semibold text-slate-900 dark:text-slate-100 sm:block">Users</h1>
      <Input className="w-full sm:w-72" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <DataTable columns={columns} rows={data?.profiles ?? []} keyField={(p) => p.id} isLoading={isLoading} emptyMessage="No users found." />

      {sentMessage && <div className="fixed right-4 top-24 z-[130] flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm font-bold text-emerald-700 shadow-[0_18px_60px_rgba(15,23,42,.18)] backdrop-blur dark:border-emerald-500/25 dark:bg-slate-900/95 dark:text-emerald-300"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-500/15">✓</span>{sentMessage}</div>}

      {messageTarget && (
        <Modal
          isOpen
          onClose={() => setMessageTarget(null)}
          title={`Message ${messageTarget.display_name || messageTarget.email}`}
          footer={<><Button variant="secondary" onClick={() => setMessageTarget(null)}>Cancel</Button><Button disabled={!message.trim() || messageMutation.isPending} onClick={() => messageMutation.mutate()}>{messageMutation.isPending ? "Sending…" : "Send message"}</Button></>}
        >
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">This message will appear in the employee notification panel and as a live toast.</div>
          <div><Label>Subject</Label><Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} placeholder="Message from administration" /></div>
          <div><Label>Message</Label><Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={2000} placeholder="Write your message…" /></div>
          {messageMutation.isError && <p className="text-sm text-rose-500">{(messageMutation.error as Error).message}</p>}
        </Modal>
      )}

      {qrLink && (
        <QrCodeModal
          title={qrLink.title}
          value={qrLink.value}
          fileName="seat-qr"
          onClose={() => setQrLink(null)}
        />
      )}
    </div>
  );
}
