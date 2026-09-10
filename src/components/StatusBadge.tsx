import { STATUS_LABEL, type Status } from "@/lib/config";

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status as Status] ?? status;
  return <span className={`badge ${status}`}>{label}</span>;
}
