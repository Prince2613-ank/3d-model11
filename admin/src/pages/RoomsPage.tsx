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
import { QrCodeModal } from "../components/ui/QrCodeModal";
import { buildRoomKioskLink } from "../lib/kioskLink";

export function RoomsPage() {
  const { data: floors } = useAllFloors();
  const [floorId, setFloorId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
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
    { header: "Visible", render: (r) => (r.is_visible ? "Yes" : "Hidden") },
    {
      header: "Actions",
      render: (r) => (
        <div className="flex gap-1.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditingRoom(r); setIsModalOpen(true); }}>Edit</Button>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setQrRoom(r)}>QR</Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteMutation.mutate(r.id)}>Delete</Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="hidden text-xl font-semibold text-slate-900 dark:text-slate-100 sm:block">Rooms</h1>
        <Button className="w-full sm:w-auto" onClick={() => { setEditingRoom(null); setIsModalOpen(true); }} disabled={!effectiveFloorId}>
          + New Room
        </Button>
      </div>

      <Select className="w-full sm:w-72" value={effectiveFloorId} onChange={(e) => setFloorId(e.target.value)}>
        {(floors ?? []).map((f) => (
          <option key={f.id} value={f.id}>{f.building_name} — {f.name}</option>
        ))}
      </Select>

      <DataTable columns={columns} rows={data?.rooms ?? []} keyField={(r) => r.id} isLoading={isLoading} emptyMessage="No rooms on this floor yet." onRowClick={setSelectedRoom} />

      {selectedRoom && (
        <RoomDetailModal
          room={selectedRoom}
          floorName={floors?.find((floor) => floor.id === selectedRoom.floor_id)?.name ?? "Unknown floor"}
          onClose={() => setSelectedRoom(null)}
        />
      )}

      {isModalOpen && (
        <RoomFormModal floorId={effectiveFloorId} room={editingRoom} onClose={() => setIsModalOpen(false)} onDone={invalidate} />
      )}

      {qrRoom && (
        <QrCodeModal
          title={`QR — ${qrRoom.name}`}
          value={buildRoomKioskLink(qrRoom.name, floors?.find((f) => f.id === qrRoom.floor_id)?.floor_number ?? 0)}
          fileName={`room-${qrRoom.name.toLowerCase().replace(/\s+/g, "-")}-qr`}
          onClose={() => setQrRoom(null)}
        />
      )}
    </div>
  );
}

function RoomDetailModal({ room, floorName, onClose }: { room: Room; floorName: string; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={room.name} size="lg">
      <section className="overflow-hidden rounded-[22px] bg-gradient-to-br from-slate-950 via-brand-950 to-brand-800 p-5 text-white">
        <div className="flex items-start gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-2xl">⌂</span><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">Room workspace</p><h3 className="mt-1 text-xl font-black">{room.name}</h3><p className="mt-1 text-xs text-brand-200/80">{floorName}{room.department ? ` · ${room.department}` : ""}</p></div></div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RoomFact label="Floor" value={floorName} />
        <RoomFact label="Capacity" value={room.capacity != null ? `${room.capacity} people` : "Not set"} />
        <RoomFact label="Visibility" value={room.is_visible ? "Visible" : "Hidden"} />
      </div>

      {room.description && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-white/10 dark:bg-white/[.03] dark:text-slate-300">{room.description}</div>}
      {(room.images?.length ?? 0) > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{room.images.map((image) => <a key={image} href={image} target="_blank" rel="noreferrer" className="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100"><img src={image} alt={room.name} className="h-full w-full object-cover transition hover:scale-105" /></a>)}</div>}

    </Modal>
  );
}

function RoomFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[.03]"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-bold text-slate-700 dark:text-slate-200">{value}</p></div>;
}

function RoomFormModal({ floorId, room, onClose, onDone }: { floorId: string; room: Room | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(room?.name ?? "");
  const [department, setDepartment] = useState(room?.department ?? "");
  const [capacity, setCapacity] = useState(room?.capacity?.toString() ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [color, setColor] = useState(room?.color ?? "#6366f1");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        department: department || null,
        capacity: capacity ? parseInt(capacity, 10) : null,
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
