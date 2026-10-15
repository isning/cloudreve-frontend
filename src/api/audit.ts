import { AdminListService, AuditLog, ListAuditLogResponse, LogEntry } from "./dashboard";
import { PaginationResults } from "./explorer";
import { defaultOpts, send, ThunkResponse } from "./request";
import { User } from "./user";

export interface AuditArchiveRequest {
  not_before: string;
  not_after: string;
  categories?: number[];
}
export interface AuditArchive {
  id: string;
  url: string;
  expires: string;
}
export interface FileActivity {
  id: string;
  created_at: string;
  content: Pick<
    LogEntry,
    | "category"
    | "original_name"
    | "new_name"
    | "from"
    | "to"
    | "entity_create_time"
    | "storage_policy_id"
    | "direct_link_id"
  > & { storage_policy?: string };
  user: User | null;
  version_id?: string;
}
export type ActivityFilter = "" | "my" | "updates" | "reads";
export interface FileActivitiesRequest {
  uri: string;
  page_size: number;
  order_direction: "asc" | "desc";
  next_page_token?: string;
  filter?: ActivityFilter;
}
export interface FileActivitiesResponse {
  activities: FileActivity[];
  pagination: PaginationResults;
}

export const getAuditLogs = (data: AdminListService): ThunkResponse<ListAuditLogResponse> =>
  send("/admin/event", { method: "POST", data }, defaultOpts);
export const getAuditLog = (id: number): ThunkResponse<AuditLog> =>
  send(`/admin/event/${id}`, { method: "GET" }, defaultOpts);
export const deleteAuditLogs = (ids: number[]): ThunkResponse<void> =>
  send("/admin/event/batch/delete", { method: "POST", data: { ids } }, defaultOpts);
export const cleanupAuditLogs = (not_after: string, categories?: number[]): ThunkResponse<void> =>
  send("/admin/event/cleanup", { method: "POST", data: { not_after, categories } }, defaultOpts);
export const createAuditArchive = (data: AuditArchiveRequest): ThunkResponse<AuditArchive> =>
  send("/admin/event/archive", { method: "POST", data }, defaultOpts);
export const getAuditArchiveStatus = (id: string): ThunkResponse<{ status: "pending" | "completed" | "failed" }> =>
  send(`/admin/event/archive/${id}/status`, { method: "GET" }, defaultOpts);
export const purgeAuditArchive = (id: string): ThunkResponse<void> =>
  send(`/admin/event/archive/${id}`, { method: "DELETE" }, defaultOpts);
export const getFileActivities = (
  params: FileActivitiesRequest,
  signal?: AbortSignal,
): ThunkResponse<FileActivitiesResponse> => send("/file/activities", { method: "GET", params, signal }, defaultOpts);
