import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Profile, UserRole } from "../types/domain";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";
import { useAuth } from "../contexts/AuthContext";

export function UsersPage() {
  const { profile: currentProfile } = useAuth();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

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
    }
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Users</h1>
      <Input className="w-72" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <DataTable columns={columns} rows={data?.profiles ?? []} keyField={(p) => p.id} isLoading={isLoading} emptyMessage="No users found." />
    </div>
  );
}
