import { useEffect, useRef } from "react";
import { ApiPrefix, Code, getAccessToken } from "../api/request";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { navigateReconcile } from "../redux/thunks/filemanager";
import SessionManager from "../session";
import { uuidv4 } from "../util";
import { canList } from "../util/permission";
import CrUri, { Filesystem } from "../util/uri";

// Native file events plus the CCSN data-free, periodic refresh extension.
export default function useFileEvents(index: number, enabled: boolean) {
  const dispatch = useAppDispatch();
  const path = useAppSelector((state) => state.fileManager[index].path);
  const listPath = useAppSelector((state) => state.fileManager[index].listPath);
  const parent = useAppSelector((state) => state.fileManager[index].list?.parent);
  const single = useAppSelector((state) => state.fileManager[index].list?.single_file_view);
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  const client = useRef(uuidv4());
  // Retained rows belong to the previous view until navigation accepts a list.
  const canObserve = !!parent && listPath === path && canList(parent);
  useEffect(() => {
    if (!enabled || !owner || !path || !parent || single || !canObserve) return;
    const uri = new CrUri(path);
    if (uri.is_search() || (uri.fs() !== Filesystem.my && uri.fs() !== Filesystem.share)) return;
    const controller = new AbortController();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    let pending = false;
    const active = () => !controller.signal.aborted && SessionManager.currentLoginOrNull()?.user.id === owner;
    const reload = () => {
      if (!active()) return;
      pending = true;
      if (loading || reloadTimer) return;
      reloadTimer = setTimeout(async () => {
        reloadTimer = undefined;
        if (!active()) return;
        loading = true;
        pending = false;
        try {
          await dispatch(navigateReconcile(index));
        } finally {
          loading = false;
          if (pending) reload();
        }
      }, 100);
    };
    const connect = async () => {
      try {
        const authorization = await dispatch(getAccessToken());
        if (!active() || !authorization) return;
        const response = await fetch(`${ApiPrefix}/file/events?uri=${encodeURIComponent(path)}`, {
          signal: controller.signal,
          headers: { Authorization: authorization, "X-Cr-Client-Id": client.current },
        });
        if (!active()) return;
        if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
          const failure = await response.json().catch(() => null);
          // Native authentication and service errors can use HTTP 200 envelopes.
          // Reload through native auth, then reconnect with current credentials.
          const retryable =
            failure?.code === Code.LockConflict ||
            failure?.code === Code.CodeLoginRequired ||
            failure?.code === Code.CredentialInvalid ||
            (failure?.code >= 50000 && failure?.code < 60000) ||
            response.status === 401 ||
            response.status >= 500;
          if (failure?.code !== Code.LockConflict) reload();
          if (retryable && active()) retryTimer = setTimeout(() => void connect(), 5000);
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (active()) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            if (buffer.length > 65536) break;
            let boundary: number;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const kind = frame
                .split("\n")
                .find((line) => line.startsWith("event:"))
                ?.slice(6)
                .trim();
              if (kind === "event" || kind === "refresh" || kind === "subscribed" || kind === "resumed") reload();
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (active()) reload();
      } catch {
        /* List requests expose current authorization errors through the native flow. */
      }
      if (active()) retryTimer = setTimeout(() => void connect(), 5000);
    };
    void connect();
    return () => {
      controller.abort();
      clearTimeout(reloadTimer);
      clearTimeout(retryTimer);
    };
  }, [enabled, owner, path, parent?.id, single, canObserve, dispatch, index]);
}
