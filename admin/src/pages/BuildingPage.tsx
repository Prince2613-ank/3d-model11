import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DtBuilding, Floor } from "../types/domain";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Label } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";

export function BuildingPage() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<DtBuilding | null>(null);
  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const queryClient = useQueryClient();

  const { data: buildingsData, isLoading: isLoadingBuildings } = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api.get<{ buildings: DtBuilding[] }>("/dt-buildings")
  });

  const { data: floorsData, isLoading: isLoadingFloors } = useQuery({
    queryKey: ["floors", selectedBuildingId],
    queryFn: () => api.get<{ floors: Floor[] }>(`/floors/building/${selectedBuildingId}?includeHidden=true`),
    enabled: !!selectedBuildingId
  });

  const invalidateBuildings = () => queryClient.invalidateQueries({ queryKey: ["buildings"] });
  const invalidateFloors = () => queryClient.invalidateQueries({ queryKey: ["floors", selectedBuildingId] });

  const deleteBuildingMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/dt-buildings/${id}`),
    onSuccess: invalidateBuildings
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/floors/${id}`),
    onSuccess: invalidateFloors
  });

  const toggleFloorVisibilityMutation = useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) => api.patch(`/floors/${id}/visibility`, { isVisible }),
    onSuccess: invalidateFloors
  });

  const buildingColumns: Column<DtBuilding>[] = [
    {
      header: "Name",
      render: (b) => (
        <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setSelectedBuildingId(b.id)}>
          {b.name}
        </button>
      )
    },
    { header: "Description", render: (b) => b.description || "—" },
    { header: "Created", render: (b) => new Date(b.created_at).toLocaleDateString() },
    {
      header: "Actions",
      render: (b) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditingBuilding(b); setIsBuildingModalOpen(true); }}>Edit</Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteBuildingMutation.mutate(b.id)}>Delete</Button>
        </div>
      )
    }
  ];

  const floorColumns: Column<Floor>[] = [
    { header: "#", render: (f) => f.floor_number },
    { header: "Name", render: (f) => f.name },
    { header: "Visible", render: (f) => (f.is_visible ? "Yes" : "Hidden") },
    {
      header: "Actions",
      render: (f) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditingFloor(f); setIsFloorModalOpen(true); }}>Edit</Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => toggleFloorVisibilityMutation.mutate({ id: f.id, isVisible: !f.is_visible })}
          >
            {f.is_visible ? "Hide" : "Show"}
          </Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteFloorMutation.mutate(f.id)}>Delete</Button>
        </div>
      )
    }
  ];

  const selectedBuilding = buildingsData?.buildings.find((b) => b.id === selectedBuildingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="hidden text-xl font-semibold text-slate-900 dark:text-slate-100 sm:block">Building</h1>
        <Button className="w-full sm:w-auto" onClick={() => { setEditingBuilding(null); setIsBuildingModalOpen(true); }}>+ New Building</Button>
      </div>

      <DataTable columns={buildingColumns} rows={buildingsData?.buildings ?? []} keyField={(b) => b.id} isLoading={isLoadingBuildings} emptyMessage="No buildings yet." />

      {selectedBuildingId && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              Floors — {selectedBuilding?.name}
            </h2>
            <Button className="w-full sm:w-auto" onClick={() => { setEditingFloor(null); setIsFloorModalOpen(true); }}>+ Add Floor</Button>
          </div>
          <DataTable columns={floorColumns} rows={floorsData?.floors ?? []} keyField={(f) => f.id} isLoading={isLoadingFloors} emptyMessage="No floors yet." />
        </div>
      )}

      {isBuildingModalOpen && (
        <BuildingFormModal
          building={editingBuilding}
          onClose={() => setIsBuildingModalOpen(false)}
          onDone={invalidateBuildings}
        />
      )}

      {isFloorModalOpen && selectedBuildingId && (
        <FloorFormModal
          buildingId={selectedBuildingId}
          floor={editingFloor}
          onClose={() => setIsFloorModalOpen(false)}
          onDone={invalidateFloors}
        />
      )}
    </div>
  );
}

function BuildingFormModal({ building, onClose, onDone }: { building: DtBuilding | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(building?.name ?? "");
  const [description, setDescription] = useState(building?.description ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      building
        ? api.patch(`/dt-buildings/${building.id}`, { name, description })
        : api.post("/dt-buildings", { name, description }),
    onSuccess: () => { onDone(); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={building ? "Edit Building" : "New Building"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>Save</Button>
        </>
      }
    >
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FloData HQ Tower" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}

function FloorFormModal({ buildingId, floor, onClose, onDone }: { buildingId: string; floor: Floor | null; onClose: () => void; onDone: () => void }) {
  const [floorNumber, setFloorNumber] = useState(floor?.floor_number ?? 1);
  const [name, setName] = useState(floor?.name ?? "");
  const [description, setDescription] = useState(floor?.description ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(floor?.thumbnail_url ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      floor
        ? api.patch(`/floors/${floor.id}`, { name, description, thumbnailUrl, floorNumber })
        : api.post("/floors", { buildingId, floorNumber, name, description, thumbnailUrl }),
    onSuccess: () => { onDone(); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={floor ? "Edit Floor" : "Add Floor"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>Save</Button>
        </>
      }
    >
      <div>
        <Label>Floor Number</Label>
        <Input type="number" value={floorNumber} onChange={(e) => setFloorNumber(parseInt(e.target.value, 10) || 0)} />
      </div>
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floor 3 — Engineering" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label>Thumbnail URL</Label>
        <Input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="https://…" />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}
