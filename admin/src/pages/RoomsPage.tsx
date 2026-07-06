import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Room } from "../types/domain";
import { useAllFloors } from "../hooks/useAllFloors";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Label, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";

export function RoomsPage() {
  const { data: floors } = useAllFloors();
  const [floorId, setFloorId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const queryClient = useQueryClient();

  const effectiveFloorId = floorId || floors?.[0]?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["rooms", effectiveFloorId],
    queryFn: () => api.get<{ rooms: Room[] }>(`/rooms/floor/${effectiveFloorId}?includeHidden=true`),
    enabled: !!effectiveFloorId
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rooms", effectiveFloorId] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/rooms/${id}`),
    onSuccess: invalidate
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) => api.patch(`/rooms/${id}/visibility`, { isVisible }),
    onSuccess: invalidate
  });

  const columns: Column<Room>[] = [
    {
      header: "Room",
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />}
          <span className="font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
        </div>
      )
    },
    { header: "Department", render: (r) => r.department || "—" },
    { header: "Capacity", render: (r) => r.capacity ?? "—" },
    { header: "Manager", render: (r) => r.manager_name || "—" },
    { header: "Visible", render: (r) => (r.is_visible ? "Yes" : "Hidden") },
    {
      header: "Actions",
      render: (r) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditingRoom(r); setIsModalOpen(true); }}>Edit</Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => toggleVisibilityMutation.mutate({ id: r.id, isVisible: !r.is_visible })}
          >
            {r.is_visible ? "Hide" : "Show"}
          </Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteMutation.mutate(r.id)}>Delete</Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Rooms</h1>
        <Button onClick={() => { setEditingRoom(null); setIsModalOpen(true); }} disabled={!effectiveFloorId}>
          + New Room
        </Button>
      </div>

      <Select className="w-72" value={effectiveFloorId} onChange={(e) => setFloorId(e.target.value)}>
        {(floors ?? []).map((f) => (
          <option key={f.id} value={f.id}>{f.building_name} — {f.name}</option>
        ))}
      </Select>

      <DataTable columns={columns} rows={data?.rooms ?? []} keyField={(r) => r.id} isLoading={isLoading} emptyMessage="No rooms on this floor yet." />

      {isModalOpen && (
        <RoomFormModal floorId={effectiveFloorId} room={editingRoom} onClose={() => setIsModalOpen(false)} onDone={invalidate} />
      )}
    </div>
  );
}

function RoomFormModal({ floorId, room, onClose, onDone }: { floorId: string; room: Room | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(room?.name ?? "");
  const [department, setDepartment] = useState(room?.department ?? "");
  const [capacity, setCapacity] = useState(room?.capacity?.toString() ?? "");
  const [managerName, setManagerName] = useState(room?.manager_name ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [color, setColor] = useState(room?.color ?? "#6366f1");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        department: department || null,
        capacity: capacity ? parseInt(capacity, 10) : null,
        managerName: managerName || null,
        description: description || null,
        color
      };
      return room ? api.patch(`/rooms/${room.id}`, payload) : api.post("/rooms", { floorId, ...payload });
    },
    onSuccess: () => { onDone(); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={room ? "Edit Room" : "New Room"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>Save</Button>
        </>
      }
    >
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Conference Room A" />
      </div>
      <div>
        <Label>Department</Label>
        <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <div>
        <Label>Capacity</Label>
        <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <div>
        <Label>Manager</Label>
        <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label>Color</Label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 rounded-md border border-slate-300 dark:border-slate-700" />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}
