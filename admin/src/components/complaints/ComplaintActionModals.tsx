import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ComplaintWithAsset } from "../../types/domain";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, Textarea, Label } from "../ui/Input";

interface ModalProps {
  complaint: ComplaintWithAsset;
  onClose: () => void;
  // Passed a short confirmation naming the reporter, so the admin gets
  // explicit feedback about who the action/notification just went to.
  onDone: (confirmation?: string) => void;
}

function reporterLabel(complaint: ComplaintWithAsset): string {
  return complaint.reporter_name || complaint.reporter_email || "the reporter";
}

export function AssignComplaintModal({ complaint, onClose, onDone }: ModalProps) {
  const [assignedToName, setAssignedToName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.patch(`/complaints/${complaint.id}/assign`, {
      assignedToName,
      deadline: deadline || undefined,
      notes: notes || undefined
    }),
    onSuccess: () => { onDone(`Assignment notification sent to ${reporterLabel(complaint)}`); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Assign — ${complaint.asset_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!assignedToName || mutation.isPending}>
            Assign
          </Button>
        </>
      }
    >
      <div>
        <Label>Technician</Label>
        <Input value={assignedToName} onChange={(e) => setAssignedToName(e.target.value)} placeholder="Technician name" />
      </div>
      <div>
        <Label>Deadline</Label>
        <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes for the technician" />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}

export function ResolveComplaintModal({ complaint, onClose, onDone }: ModalProps) {
  const [resolutionText, setResolutionText] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.patch(`/complaints/${complaint.id}/resolve`, { resolutionText }),
    onSuccess: () => { onDone(`Resolution notification sent to ${reporterLabel(complaint)}`); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Resolve — ${complaint.asset_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!resolutionText || mutation.isPending}>
            Mark Resolved
          </Button>
        </>
      }
    >
      <div>
        <Label>Resolution</Label>
        <Textarea rows={4} value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder="What was done to fix this?" />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}

export function RejectComplaintModal({ complaint, onClose, onDone }: ModalProps) {
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.patch(`/complaints/${complaint.id}/reject`, { reason }),
    onSuccess: () => { onDone(`Rejection notification sent to ${reporterLabel(complaint)}`); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Reject — ${complaint.asset_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => mutation.mutate()} disabled={!reason || mutation.isPending}>
            Reject
          </Button>
        </>
      }
    >
      <div>
        <Label>Reason</Label>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this complaint being rejected?" />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}

export function ReplyComplaintModal({ complaint, onClose, onDone }: ModalProps) {
  const [message, setMessage] = useState(complaint.admin_reply ?? "");

  const mutation = useMutation({
    mutationFn: () => api.patch(`/complaints/${complaint.id}/reply`, { message }),
    onSuccess: () => { onDone(`Reply sent to ${reporterLabel(complaint)}`); onClose(); }
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Reply — ${complaint.asset_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!message || mutation.isPending}>
            Send Reply
          </Button>
        </>
      }
    >
      <div>
        <Label>Message</Label>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Reply to the reporter" />
      </div>
      {mutation.isError && <p className="text-sm text-rose-600">{(mutation.error as Error).message}</p>}
    </Modal>
  );
}
