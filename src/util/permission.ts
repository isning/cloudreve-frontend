import { FilePermission, FileResponse } from "../api/explorer";
import Boolset from "./boolset";
import CrUri, { Filesystem } from "./uri";

// Filesystem compatibility is separate from the destination's create grant,
// which is checked by the selector and revalidated by the server.
export function canCopyMoveTo(files: FileResponse[], dst: string, isCopy: boolean): boolean {
  if (
    !files.length ||
    !files.every((file) => hasPermission(file, isCopy ? FilePermission.read : FilePermission.delete))
  )
    return false;
  const dstFs = new CrUri(dst).fs();
  return files.every((file) => {
    const srcFs = new CrUri(file.path).fs();
    if (
      (srcFs === Filesystem.my || srcFs === Filesystem.share) &&
      (dstFs === Filesystem.my || dstFs === Filesystem.share)
    )
      return true;
    return (
      !isCopy &&
      ((srcFs === Filesystem.my && dstFs === Filesystem.trash) ||
        (srcFs === Filesystem.trash && dstFs === Filesystem.my))
    );
  });
}

export function hasPermission(file: Pick<FileResponse, "permission">, permission: number) {
  return file.permission == null || new Boolset(file.permission).enabled(permission);
}

export function canList(file: Pick<FileResponse, "permission">) {
  return hasPermission(file, FilePermission.read) || hasPermission(file, FilePermission.list);
}
