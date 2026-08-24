import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Asset, AssetCategory } from "../types/domain";
import { useAllFloors } from "../hooks/useAllFloors";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PhotoCropModal } from "../components/ui/PhotoCropModal";
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
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const queryClient = useQueryClient();

  const effectiveFloorId = floorId || floors?.[0]?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["assets", effectiveFloorId],
    queryFn: () => api.get<{ assets: Asset[] }>(`/assets/floor/${effectiveFloorId}`),
    enabled: !!effectiveFloorId,
    // Assets are edited from both here and the 3D user panel — poll so a
    // change made from either side shows up on the other without needing a
    // manual refresh or tab-focus switch.
    refetchInterval: 8_000
  });

  const { data: deletedData } = useQuery({
    queryKey: ["assets", effectiveFloorId, "deleted"],
    queryFn: () => api.get<{ assets: Asset[] }>(`/assets/floor/${effectiveFloorId}/deleted`),
    enabled: !!effectiveFloorId && showDeleted
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["assets", effectiveFloorId] });
    queryClient.invalidateQueries({ queryKey: ["assets", effectiveFloorId, "deleted"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}`),
    onSuccess: invalidate
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/assets/${id}/restore`, {}),
    onSuccess: invalidate
  });

  const columns: Column<Asset>[] = [
    {
      header: "Employee item",
      render: (a) => (
        <button
          type="button"
          onClick={() => setViewingAsset(a)}
          className="flex items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          aria-label={`View details for ${a.name}`}
          title="Click to view details"
        >
          {a.image_url ? (
            <img src={a.image_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {a.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{a.name}</p>
            <p className="text-xs capitalize text-slate-400">{a.category.replace(/_/g, " ")}</p>
          </div>
        </button>
      )
    },
    { header: "Seat ID", render: (a) => <code className="text-xs">{a.seat_id}</code> },
    { header: "Status", render: (a) => <StatusBadge status={a.live_status} /> },
    { header: "Designation", render: (a) => a.designation ?? "—" },
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Employees</h2>
          <p className="text-xs text-slate-500 mt-1">Manage employee seat allocations, designations, active occupancy status, and profiles.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Select className="w-full sm:w-64 h-9 text-xs" value={effectiveFloorId} onChange={(e) => setFloorId(e.target.value)}>
            {(floors ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.building_name} — {f.name}</option>
            ))}
          </Select>
          <Button className="w-full sm:w-auto h-9 text-xs" onClick={() => { setEditingAsset(null); setIsModalOpen(true); }} disabled={!effectiveFloorId}>
            + New Employee Item
          </Button>
        </div>
      </div>

      <DataTable columns={columns} rows={data?.assets ?? []} keyField={(a) => a.id} isLoading={isLoading} emptyMessage="No employee items on this floor yet." />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowDeleted((v) => !v)}
          className="self-start text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {showDeleted ? "Hide" : "Show"} deleted employee items
        </button>
        {showDeleted && (
          <DataTable
            columns={[
              { header: "Employee item", render: (a) => a.name },
              { header: "Seat ID", render: (a) => <code className="text-xs">{a.seat_id}</code> },
              { header: "Deleted", render: (a) => (a.deleted_at ? new Date(a.deleted_at).toLocaleString() : "—") },
              {
                header: "Actions",
                render: (a) => (
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() => restoreMutation.mutate(a.id)}
                    disabled={restoreMutation.isPending}
                  >
                    Restore
                  </Button>
                )
              }
            ]}
            rows={deletedData?.assets ?? []}
            keyField={(a) => a.id}
            emptyMessage="No deleted employee items on this floor."
          />
        )}
      </div>

      {viewingAsset && (
        <EmployeeDetailModal
          asset={viewingAsset}
          onClose={() => setViewingAsset(null)}
        />
      )}

      {isModalOpen && (
        <AssetFormModal floorId={effectiveFloorId} asset={editingAsset} onClose={() => setIsModalOpen(false)} onDone={invalidate} />
      )}

      {qrAsset && (
        <QrCodeModal
          title={`QR — ${qrAsset.name}`}
          value={buildAssetKioskLink(qrAsset.seat_id, floors?.find((f) => f.id === qrAsset.floor_id)?.floor_number ?? 0)}
          fileName={`asset-${qrAsset.seat_id}-qr`}
          onClose={() => setQrAsset(null)}
        />
      )}
    </div>
  );
}

function AssetFormModal({ floorId, asset, onClose, onDone }: { floorId: string; asset: Asset | null; onClose: () => void; onDone: () => void }) {
  const [objectKey, setObjectKey] = useState(asset?.object_key ?? "");
  const [seatId, setSeatId] = useState(asset?.seat_id ?? asset?.object_key ?? "");
  const [designation, setDesignation] = useState(asset?.designation ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [category, setCategory] = useState<AssetCategory>(asset?.category ?? "chair");
  const [imageUrl, setImageUrl] = useState(asset?.image_url ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);

  const uploadCroppedPhoto = async (blob: Blob) => {
    setCropFile(null);
    setUploadError("");
    setUploadingPhoto(true);
    try {
      const { url } = await api.uploadFile("/uploads/asset-photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      setImageUrl(url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };
  const [joiningDate, setJoiningDate] = useState(asset?.joining_date ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        seatId: seatId.trim() || objectKey,
        designation: designation.trim() || null,
        category,
        imageUrl: imageUrl || null,
        joiningDate: joiningDate || null
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
        <FormCard title="Object">
          <Label>Object Key</Label>
          <Input value={objectKey} onChange={(e) => setObjectKey(e.target.value)} placeholder="Must match the 3D scene's picking id, e.g. chair-3f-12" />
        </FormCard>
      )}

      <FormCard title="Identity">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ankita Kushwaha" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><Label>Seat ID</Label><Input value={seatId} onChange={(e) => setSeatId(e.target.value)} placeholder="e.g. Chair-4-27" /></div>
          <div><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Fullstack Developer" /></div>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </Select>
        </div>
      </FormCard>

      <FormCard title="Photo">
        <div className="flex items-center gap-3">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-400 dark:bg-slate-800">
              {name.slice(0, 1).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              {uploadingPhoto ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingPhoto}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) setCropFile(file); e.target.value = ""; }}
              />
            </label>
            {imageUrl && <button type="button" onClick={() => setImageUrl("")} className="ml-2 text-sm font-medium text-rose-600 hover:text-rose-700">Remove</button>}
            {uploadError && <p className="mt-1 text-xs text-rose-600">{uploadError}</p>}
          </div>
        </div>
      </FormCard>

      <FormCard title="Employment">
        <Label>Joining date</Label>
        <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
      </FormCard>

      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(blob) => void uploadCroppedPhoto(blob)}
        />
      )}
    </Modal>
  );
}

function EmployeeDetailModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Employee details"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="flex items-center gap-3">
        {asset.image_url ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            aria-label="View larger photo"
            title="Click to view larger photo"
          >
            <img src={asset.image_url} alt="" className="h-16 w-16 rounded-full object-cover" />
          </button>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {asset.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{asset.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{asset.designation || "No designation set"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailField label="Seat ID" value={asset.seat_id} />
        <DetailField label={`${asset.category.replace(/_/g, " ")} status`} value={<StatusBadge status={asset.live_status} />} />
        <DetailField label="Category" value={asset.category.replace(/_/g, " ")} className="capitalize" />
        <DetailField label="Joining date" value={asset.joining_date ?? "—"} />
      </div>

      {previewOpen && asset.image_url && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-6"
          onClick={() => setPreviewOpen(false)}
        >
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close preview"
          >
            ✕
          </button>
          <img
            src={asset.image_url}
            alt={asset.name}
            className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Modal>
  );
}

function DetailField({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-white/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className={`mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-white/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}
