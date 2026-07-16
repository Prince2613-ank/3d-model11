import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Asset, AssetCategory, Profile } from "../types/domain";
import { useAllFloors } from "../hooks/useAllFloors";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { QrCodeModal } from "../components/ui/QrCodeModal";
import { buildAssetKioskLink } from "../lib/kioskLink";

const CATEGORIES: AssetCategory[] = [
  "chair", "ac", "projector", "door", "printer", "monitor",
  "fire_extinguisher", "desk", "elevator", "light", "other"
];

export function AssetsPage() {
  const { data: floors } = useAllFloors();
  const [floorId, setFloorId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const queryClient = useQueryClient();

  const effectiveFloorId = floorId || floors?.[0]?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["assets", effectiveFloorId],
    queryFn: () => api.get<{ assets: Asset[] }>(`/assets/floor/${effectiveFloorId}`),
    enabled: !!effectiveFloorId
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["assets", effectiveFloorId] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}`),
    onSuccess: invalidate
  });

  const columns: Column<Asset>[] = [
    {
      header: "Employee item",
      render: (a) => (
        <div className="flex items-center gap-3">
          {a.image_url ? (
            <img src={a.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs dark:bg-slate-800">
              {a.category.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{a.name}</p>
            <p className="text-xs capitalize text-slate-400">{a.category.replace(/_/g, " ")}</p>
          </div>
        </div>
      )
    },
    { header: "Object Key", render: (a) => <code className="text-xs">{a.object_key}</code> },
    { header: "Status", render: (a) => <StatusBadge status={a.live_status} /> },
    { header: "Warranty", render: (a) => a.warranty_expiry ?? "—" },
    {
      header: "Actions",
      render: (a) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditingAsset(a); setIsModalOpen(true); }}>Edit</Button>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setQrAsset(a)}>QR</Button>
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteMutation.mutate(a.id)}>Delete</Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="hidden text-xl font-semibold text-slate-900 dark:text-slate-100 sm:block">Employees</h1>
        <Button className="w-full sm:w-auto" onClick={() => { setEditingAsset(null); setIsModalOpen(true); }} disabled={!effectiveFloorId}>
          + New Employee Item
        </Button>
      </div>

      <Select className="w-full sm:w-72" value={effectiveFloorId} onChange={(e) => setFloorId(e.target.value)}>
        {(floors ?? []).map((f) => (
          <option key={f.id} value={f.id}>{f.building_name} — {f.name}</option>
        ))}
      </Select>

      <DataTable columns={columns} rows={data?.assets ?? []} keyField={(a) => a.id} isLoading={isLoading} emptyMessage="No employee items on this floor yet." />

      {isModalOpen && (
        <AssetFormModal floorId={effectiveFloorId} asset={editingAsset} onClose={() => setIsModalOpen(false)} onDone={invalidate} />
      )}

      {qrAsset && (
        <QrCodeModal
          title={`QR — ${qrAsset.name}`}
          value={buildAssetKioskLink(qrAsset.object_key, floors?.find((f) => f.id === qrAsset.floor_id)?.floor_number ?? 0)}
          fileName={`asset-${qrAsset.object_key}-qr`}
          onClose={() => setQrAsset(null)}
        />
      )}
    </div>
  );
}

function AssetFormModal({ floorId, asset, onClose, onDone }: { floorId: string; asset: Asset | null; onClose: () => void; onDone: () => void }) {
  const [objectKey, setObjectKey] = useState(asset?.object_key ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [category, setCategory] = useState<AssetCategory>(asset?.category ?? "chair");
  const [imageUrl, setImageUrl] = useState(asset?.image_url ?? "");
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? "");
  const [warrantyExpiry, setWarrantyExpiry] = useState(asset?.warranty_expiry ?? "");
  const [maintenanceDate, setMaintenanceDate] = useState(asset?.maintenance_date ?? "");
  const [assignedProfileId, setAssignedProfileId] = useState(asset?.assigned_to_profile_id ?? "");

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ profiles: Profile[] }>("/users")
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        category,
        imageUrl: imageUrl || null,
        purchaseDate: purchaseDate || null,
        warrantyExpiry: warrantyExpiry || null,
        maintenanceDate: maintenanceDate || null,
        assignedToProfileId: assignedProfileId || null
      };
      return asset
        ? api.patch(`/assets/${asset.id}`, payload)
        : api.post("/assets", { objectKey, floorId, ...payload });
    },
    onSuccess: () => { onDone(); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={asset ? "Edit Employee Item" : "New Employee Item"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || (!asset && !objectKey) || mutation.isPending}>Save</Button>
        </>
      }
    >
      {!asset && (
        <div>
          <Label>Object Key</Label>
          <Input value={objectKey} onChange={(e) => setObjectKey(e.target.value)} placeholder="Must match the 3D scene's picking id, e.g. chair-3f-12" />
        </div>
      )}
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Conference Room Projector" />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </Select>
      </div>
      <div>
        <Label>Image URL</Label>
        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div>
        <Label>Assigned employee</Label>
        <Select value={assignedProfileId} onChange={(e) => setAssignedProfileId(e.target.value)}>
          <option value="">— Unassigned —</option>
          {(usersData?.profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.display_name || p.email}</option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label>Purchased</Label>
          <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div>
          <Label>Warranty</Label>
          <Input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} />
        </div>
        <div>
          <Label>Maintenance</Label>
          <Input type="date" value={maintenanceDate} onChange={(e) => setMaintenanceDate(e.target.value)} />
        </div>
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}
