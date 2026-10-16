import { Alert, Button, DialogContent, Stack, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getFileInfo } from "../../../api/api";
import { FileResponse, FileType, PermissionSetting } from "../../../api/explorer";
import { clearFilePermissions, setFilePermissions } from "../../../api/permission";
import { AppError, Code } from "../../../api/request.ts";
import { GroupPermission } from "../../../api/user";
import { setFilePermissionDialog } from "../../../redux/globalStateSlice";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { refreshFileList } from "../../../redux/thunks/filemanager";
import SessionManager from "../../../session";
import DraggableDialog from "../../Dialogs/DraggableDialog";
import PermissionEditor, { defaultSharePermissions } from "./Share/PermissionEditor";

const canManage = (file: FileResponse) =>
  !file.metadata?.["sys:shared_redirect"] &&
  (file.owned || SessionManager.currentUserGroupPermission().enabled(GroupPermission.is_admin));

// Evaluate lazily because request imports this component through the router.
// GroupNotAllowed on writes can reject an editable rule rather than the target.
const isUnavailableTarget = (code: number) =>
  [Code.NodeFound, Code.ParentNotExist, Code.PermissionDenied, Code.OwnerOnly].includes(code);

// Bind personal URIs to their original account, including while authentication refreshes.
const freezeUri = (file: FileResponse, owner: string) => {
  const uri = new URL(file.path);
  if (uri.hostname === "my" && !uri.username) uri.username = owner;
  return uri.toString();
};

function PermissionDialog({
  files,
  owner,
  index = 0,
  onClose,
  onSaved,
  disabled = false,
}: {
  files: FileResponse[];
  owner: string;
  index?: number;
  onClose: () => void;
  onSaved?: (file: FileResponse) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("application");
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const batch = files.length > 1;
  const [explicit, setExplicit] = useState(false);
  const [value, setValue] = useState<PermissionSetting>({});
  const [info, setInfo] = useState<FileResponse>();
  const revision = useRef(0);
  const dismissed = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const identity = files.map((file) => `${file.id}\n${file.path}`).join("\n");
  const activeAccount = () => SessionManager.currentLoginOrNull()?.user.id === owner;
  const active = (current: number) => current === revision.current && !dismissed.current && activeAccount();
  const close = () => {
    dismissed.current = true;
    ++revision.current;
    onClose();
  };
  // Paths can be reused by another object while this editor is open. Check the
  // complete selection both when loading and immediately before an ACL write.
  const readTargets = async (current: number, extended = false) => {
    let first: FileResponse | undefined;
    for (let start = 0; start < files.length; start += 10) {
      if (!active(current)) return;
      let fresh: FileResponse[];
      try {
        fresh = await Promise.all(
          files
            .slice(start, start + 10)
            .map((file, offset) =>
              dispatch(getFileInfo({ uri: freezeUri(file, owner), extended: extended && start + offset === 0 })),
            ),
        );
      } catch (error) {
        if (
          active(current) &&
          error instanceof AppError &&
          (isUnavailableTarget(error.code) || error.code === Code.GroupNotAllowed)
        ) {
          dispatch(refreshFileList(index));
          close();
        }
        throw error;
      }
      if (!active(current)) return;
      if (fresh.some((file, offset) => file.id !== files[start + offset].id || !canManage(file))) {
        close();
        return;
      }
      first ??= fresh[0];
    }
    return first;
  };
  const load = async () => {
    const current = ++revision.current;
    dismissed.current = false;
    setLoading(true);
    setFailed(false);
    setSaveFailed(false);
    setInfo(undefined);
    setExplicit(false);
    setValue({});
    try {
      const fresh = await readTargets(current, true);
      if (!fresh || !active(current)) return;
      setInfo(fresh);
      if (!batch) {
        setValue(fresh.extended_info?.permissions ?? {});
        setExplicit(fresh.extended_info?.permissions != null);
      }
    } catch {
      if (active(current)) setFailed(true);
    } finally {
      if (active(current)) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      dismissed.current = true;
      ++revision.current;
    };
  }, [identity, owner]);
  const save = async (clear = false) => {
    if (
      disabledRef.current ||
      dismissed.current ||
      !activeAccount() ||
      loading ||
      saving ||
      failed ||
      !info ||
      (!clear && !explicit)
    )
      return;
    const current = revision.current;
    setSaving(true);
    setSaveFailed(false);
    try {
      if (!(await readTargets(current)) || !active(current) || disabledRef.current) return;
      const uris = files.map((file) => freezeUri(file, owner));
      const expectedIDs = files.map((file) => file.id);
      await dispatch(clear ? clearFilePermissions(uris, expectedIDs) : setFilePermissions(uris, value, expectedIDs));
      if (!active(current)) return;
      if (onSaved) {
        const fresh = await readTargets(current, true);
        if (!fresh || !active(current)) return;
        onSaved(fresh);
      }
      dispatch(refreshFileList(index));
      close();
    } catch (error) {
      if (active(current)) {
        if (error instanceof AppError && (isUnavailableTarget(error.code) || error.code === Code.Conflict)) {
          dispatch(refreshFileList(index));
          close();
        } else {
          setSaveFailed(true);
        }
      }
    } finally {
      if (active(current)) setSaving(false);
    }
  };
  return (
    <DraggableDialog
      title={t("fileManager.permissions")}
      showActions
      showCancel
      disabled={disabled || loading || failed || !explicit}
      loading={saving}
      onAccept={() => save()}
      secondaryAction={
        <Button
          disabled={disabled || loading || saving || failed || (!batch && !info?.extended_info?.permissions)}
          onClick={() => save(true)}
        >
          {t("sharing.inherit")}
        </Button>
      }
      dialogProps={{
        open: activeAccount() && !dismissed.current,
        fullWidth: true,
        maxWidth: "sm",
        onClose: close,
        sx: { ".MuiDialogActions-root": { flexWrap: "wrap", gap: 1 } },
      }}
    >
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            {batch ? t("sharing.batchReplace", { count: files.length }) : files[0].name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("sharing.fileInheritance")}
          </Typography>
          {!batch && info?.extended_info?.permission_context && (
            <Alert severity="info">
              {t(`sharing.source_${info.extended_info.permission_context.source}`)}
              {info.extended_info.permission_context.source_uri && (
                <Typography variant="caption" display="block" sx={{ overflowWrap: "anywhere" }}>
                  {info.extended_info.permission_context.source_uri}
                </Typography>
              )}
              {info.extended_info.permission_context.context_dependent && (
                <Typography variant="body2">{t("sharing.contextDependent")}</Typography>
              )}
            </Alert>
          )}
          {loading && <Typography role="status">{t("sharing.loadingPermissions")}</Typography>}
          {saveFailed && <Alert severity="error">{t("sharing.saveDraftKept")}</Alert>}
          {failed && (
            <Alert severity="error" action={<Button onClick={() => void load()}>{t("sharing.retry")}</Button>}>
              {t("sharing.saveFailed")}
            </Alert>
          )}
          {!loading && !failed && !explicit && (
            <>
              <Alert severity="info">{t(batch ? "sharing.batchReplaceWarning" : "sharing.currentlyInherited")}</Alert>
              <Button
                sx={{ alignSelf: "flex-start" }}
                onClick={() => {
                  setValue(defaultSharePermissions());
                  setExplicit(true);
                }}
              >
                {t("sharing.setExplicit")}
              </Button>
            </>
          )}
          {!loading && !failed && explicit && (
            <PermissionEditor
              value={value}
              onChange={setValue}
              folder={files.some((file) => file.type === FileType.folder)}
            />
          )}
        </Stack>
      </DialogContent>
    </DraggableDialog>
  );
}

export function FilePermissionMenuDialog() {
  const dispatch = useAppDispatch();
  const target = useAppSelector((state) => state.globalState.filePermissionDialog);
  const list = useAppSelector((state) => state.fileManager[target?.index ?? 0]?.list);
  const rows = [...(list?.files ?? []), ...(list?.parent ? [list.parent] : [])];
  const listed = useRef({ target, paths: new Set<string>() });
  if (listed.current.target !== target) listed.current = { target, paths: new Set() };
  const current =
    target &&
    list &&
    target.owner === SessionManager.currentLoginOrNull()?.user.id &&
    target.files.every((file) => {
      const row = rows.find((row) => row.path === file.path);
      if (row) listed.current.paths.add(file.path);
      // Tree and breadcrumb targets can be outside the main listing. Their
      // fresh identity is checked by PermissionDialog; listed targets must
      // still close if a later listing removes or replaces them.
      return row ? row.id === file.id && canManage(row) : !listed.current.paths.has(file.path) && canManage(file);
    });
  useEffect(() => {
    if (target && !current) dispatch(setFilePermissionDialog(undefined));
  }, [target, current, dispatch]);
  if (!target || !current) return null;
  return <PermissionDialog {...target} onClose={() => dispatch(setFilePermissionDialog(undefined))} />;
}

export default function FilePermissions({
  target,
  onSaved,
  disabled = false,
}: {
  target: FileResponse;
  onSaved: (file: FileResponse) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("application");
  const [open, setOpen] = useState(false);
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  useEffect(() => setOpen(false), [target.id, target.path, owner]);
  if (!owner || !canManage(target)) return null;
  return (
    <>
      <Button size="small" sx={{ alignSelf: "flex-start" }} disabled={disabled} onClick={() => setOpen(true)}>
        {t("fileManager.permissions")}
      </Button>
      {open && (
        <PermissionDialog
          files={[target]}
          owner={owner}
          onSaved={onSaved}
          onClose={() => setOpen(false)}
          disabled={disabled}
        />
      )}
    </>
  );
}
