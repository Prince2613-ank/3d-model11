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
          {r.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />}
          <span className="font-semibold text-slate-800 dark:text-slate-100">{r.name}</span>
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
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => { setEditingRoom(r); setIsModalOpen(true); }}>Edit</Button>
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setQrRoom(r)}>QR</Button>
          <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => deleteMutation.mutate(r.id)}>Delete</Button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Rooms</h2>
          <p className="text-xs text-slate-500 mt-1">Manage workspace rooms, department allocations, capacities, and visual parameters.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Select className="w-full sm:w-64 h-9 text-xs" value={effectiveFloorId} onChange={(e) => setFloorId(e.target.value)}>
            {(floors ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.building_name} — {f.name}</option>
            ))}
          </Select>
          <Button className="w-full sm:w-auto h-9 text-xs" onClick={() => { setEditingRoom(null); setIsModalOpen(true); }} disabled={!effectiveFloorId}>
            + New Room
          </Button>
        </div>
      </div>

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
      <section className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-4 text-slate-800 dark:border-white/5 dark:bg-white/5 dark:text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 text-lg dark:bg-brand-500/20 dark:text-brand-300">⌂</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Room workspace</p>
            <h3 className="text-sm font-bold">{room.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{floorName}{room.department ? ` · ${room.department}` : ""}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RoomFact label="Floor" value={floorName} />
        <RoomFact label="Capacity" value={room.capacity != null ? `${room.capacity} people` : "Not set"} />
        <RoomFact label="Visibility" value={room.is_visible ? "Visible" : "Hidden"} />
      </div>

      {room.description && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-white/10 dark:bg-white/[.03] dark:text-slate-300">{room.description}</div>}
      {(room.images?.length ?? 0) > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{room.images.map((image) => <a key={image} href={image} target="_blank" rel="noreferrer" className="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5"><img src={image} alt={room.name} className="h-full w-full object-cover transition hover:scale-105" /></a>)}</div>}
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
