import { useEffect, useRef, useState } from "react";
import { getFileInfo } from "../../../api/api.ts";
import { FileResponse, ListResponse, Metadata } from "../../../api/explorer.ts";
import { setSidebar } from "../../../redux/globalStateSlice.ts";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks.ts";
import SessionManager from "../../../session";

interface DetailsSnapshot {
  file: FileResponse | undefined | null;
  source: FileResponse;
  list: ListResponse;
  owner?: string;
}

const useSidebarDetails = () => {
  const dispatch = useAppDispatch();
  const sidebarOpen = useAppSelector((state) => state.globalState.sidebarOpen);
  const sidebarTarget = useAppSelector((state) => state.globalState.sidebarTarget);
  const list = useAppSelector((state) => state.fileManager[0].list);
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  const [details, setDetails] = useState<DetailsSnapshot>();
  const revision = useRef(0);

  useEffect(() => {
    const current = ++revision.current;
    const cleanup = () => {
      ++revision.current;
    };
    const active = () => current === revision.current && SessionManager.currentLoginOrNull()?.user.id === owner;
    if (!sidebarOpen || !sidebarTarget || typeof sidebarTarget === "string") {
      setDetails(undefined);
      return cleanup;
    }
    const close = () => {
      setDetails(undefined);
      dispatch(setSidebar({ open: false }));
    };
    if (!list) {
      close();
      return cleanup;
    }
    dispatch(getFileInfo({ uri: sidebarTarget.path, extended: true }))
      .then((fresh) => {
        if (!active()) return;
        if (fresh.id !== sidebarTarget.id) {
          close();
          return;
        }
        const listed = list.files.find((file) => file.id === fresh.id && file.path === sidebarTarget.path);
        // Thumbnail failures update the list locally. Keep that hint for this
        // content version so revalidation cannot restart the failed request.
        const thumbnailDisabled =
          listed?.primary_entity === fresh.primary_entity ? listed?.metadata?.[Metadata.thumbDisabled] : undefined;
        setDetails({
          file: {
            ...fresh,
            metadata:
              thumbnailDisabled === undefined
                ? fresh.metadata
                : { ...fresh.metadata, [Metadata.thumbDisabled]: thumbnailDisabled },
            capability: fresh.capability ?? listed?.capability ?? sidebarTarget.capability,
          },
          source: sidebarTarget,
          list,
          owner,
        });
      })
      .catch(() => {
        if (active()) close();
      });
    return cleanup;
  }, [sidebarOpen, sidebarTarget, list, owner, dispatch]);

  // Keep same-object editors mounted while revalidating, but gate their actions
  // immediately. Late save callbacks still belong to their validated snapshot.
  const current = revision.current;
  const target = !sidebarOpen
    ? null
    : list && details?.source === sidebarTarget && details?.owner === owner
      ? details?.file
      : undefined;
  const validating = details?.list !== list;
  const updateTarget = (file: FileResponse | undefined | null) => {
    if (
      validating ||
      current !== revision.current ||
      SessionManager.currentLoginOrNull()?.user.id !== owner ||
      !details
    )
      return;
    if (file && file.id !== details.source.id) return;
    setDetails({ ...details, file });
  };

  return { sidebarOpen, target, validating, setTarget: updateTarget };
};

export default useSidebarDetails;
