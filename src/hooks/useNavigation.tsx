import { useEffect } from "react";
import { FileManagerIndex } from "../component/FileManager/FileManager.tsx";
import { useAppDispatch, useAppSelector } from "../redux/hooks.ts";
import {
  beforePathChange,
  checkOpenViewerQuery,
  checkReadMeEnabled,
  navigateReconcile,
  setTargetPath,
} from "../redux/thunks/filemanager.ts";
import { useQuery } from "../util";
import { Filesystem } from "../util/uri.ts";

const pathQueryKey = "path";
export const defaultPath = "cloudreve://my";
export const defaultTrashPath = "cloudreve://trash";
export const defaultSharedWithMePath = "cloudreve://" + Filesystem.shared_with_me;

const useNavigation = (index: number, initialPath?: string) => {
  const dispatch = useAppDispatch();
  const query = useQuery();
  const path = useAppSelector((s) => s.fileManager[index].path);
  const listPath = useAppSelector((s) => s.fileManager[index].listPath);

  // Update path in redux when path in query changes
  if (index === FileManagerIndex.main) {
    useEffect(() => {
      const path = query.get(pathQueryKey) ? (query.get(pathQueryKey) as string) : defaultPath;
      dispatch(setTargetPath(index, path));
    }, [query]);
  } else {
    useEffect(() => {
      dispatch(setTargetPath(index, initialPath ?? defaultPath));
    }, []);
  }

  // When path state changed, dispatch to load file list
  useEffect(() => {
    if (path) {
      dispatch(navigateReconcile(index));
      dispatch(beforePathChange(index));
    }
  }, [path]);

  // Only an accepted list can complete navigation. Superseded request promises
  // must not consume a newer view's file-open query against retained rows.
  useEffect(() => {
    if (path && listPath === path) {
      dispatch(checkReadMeEnabled(index));
      dispatch(checkOpenViewerQuery(index));
    }
  }, [path, listPath, index, dispatch]);
};

export default useNavigation;
