import { PermissionSetting } from "./explorer";
import { defaultOpts, send, ThunkResponse } from "./request";

export interface PermissionGroup {
  id: string;
  name: string;
}
export const getPermissionGroups = (): ThunkResponse<PermissionGroup[]> =>
  send("/group/list", { method: "GET" }, defaultOpts);
export const setFilePermissions = (
  uris: string[],
  setting: PermissionSetting,
  expectedIDs?: string[],
): ThunkResponse<void> =>
  send("/file/permission", { method: "POST", data: { uris, setting, expected_ids: expectedIDs } }, defaultOpts);
export const clearFilePermissions = (uris: string[], expectedIDs?: string[]): ThunkResponse<void> =>
  send("/file/permission", { method: "DELETE", data: { uris, expected_ids: expectedIDs } }, defaultOpts);
