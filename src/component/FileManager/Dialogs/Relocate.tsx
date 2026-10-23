import { Alert, Button, DialogContent, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAvailableStoragePolicies, sendRelocate } from "../../../api/api.ts";
import { AppError, Code } from "../../../api/request.ts";
import { GroupPermission } from "../../../api/user.ts";
import { refreshFileList } from "../../../redux/thunks/filemanager.ts";
import { StoragePolicy } from "../../../api/explorer.ts";
import { setRelocateDialog } from "../../../redux/globalStateSlice.ts";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks.ts";
import CrUri from "../../../util/uri.ts";
import SessionManager from "../../../session";
import DraggableDialog from "../../Dialogs/DraggableDialog.tsx";
import { ViewTaskAction } from "../../Common/Snackbar/snackbar.tsx";

const Relocate = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const target = useAppSelector((state) => state.globalState.relocateDialog);
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  const authorized = SessionManager.currentUserGroupPermission().enabled(GroupPermission.relocate);
  const [policies, setPolicies] = useState<StoragePolicy[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const close = () => dispatch(setRelocateDialog(undefined));
  useEffect(() => {
    let active = true;
    setPolicies([]);
    setSelected("");
    if (!target || target.owner !== owner) return;
    setLoading(true);
    setFailed(false);
    dispatch(getAvailableStoragePolicies())
      .then((available) => {
        if (active) setPolicies(available);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [target, owner, dispatch, retryVersion]);
  const save = async () => {
    if (!target || target.owner !== owner || !authorized || !selected || !policies.some((p) => p.id === selected))
      return;
    const sources = target.files.map((file) => {
      const uri = new URL(file.path!);
      uri.username = target.owner;
      return uri.toString();
    });
    setSaving(true);
    try {
      await dispatch(sendRelocate({ src: sources, dst_policy_id: selected }));
      if (SessionManager.currentLoginOrNull()?.user.id !== target.owner) return;
      close();
      enqueueSnackbar({ message: t("fileManager.relocateTaskAccepted"), variant: "success", action: ViewTaskAction() });
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === Code.GroupNotAllowed &&
        SessionManager.currentLoginOrNull()?.user.id === target.owner
      ) {
        await dispatch(refreshFileList(target.index));
      }
      /* Native request handling displays the error and preserves this choice. */
    } finally {
      setSaving(false);
    }
  };
  return (
    <DraggableDialog
      title={t("fileManager.relocateStoragePolicy")}
      showActions
      showCancel
      loading={saving}
      disabled={loading || !selected || !authorized}
      onAccept={save}
      okText={t("fileManager.startStorageMigration")}
      dialogProps={{ open: !!target && target.owner === owner, onClose: close, fullWidth: true, maxWidth: "xs" }}
    >
      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {failed && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button size="small" color="inherit" onClick={() => setRetryVersion((value) => value + 1)}>
                {t("uploader.retryPolicies")}
              </Button>
            }
          >
            {t("uploader.policyLoadFailed")}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary">
          {t(
            target?.files.some((file) => file.path && new CrUri(file.path).is_root())
              ? "fileManager.relocatePersonalRootDescription"
              : "fileManager.relocateStoragePolicyDescription",
          )}
        </Typography>
        <TextField
          select
          fullWidth
          margin="normal"
          label={t("uploader.storagePolicy")}
          SelectProps={{ displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          value={selected}
          disabled={loading || saving || !policies.length}
          onChange={(event) => setSelected(event.target.value)}
        >
          <MenuItem value="" disabled>
            {t("fileManager.chooseStorageDestination")}
          </MenuItem>
          {policies.map((policy) => (
            <MenuItem key={policy.id} value={policy.id}>
              {policy.name}
            </MenuItem>
          ))}
        </TextField>
        {!loading && !failed && !policies.length && (
          <Typography color="error" variant="body2">
            {t("uploader.noAvailablePolicies")}
          </Typography>
        )}
      </DialogContent>
    </DraggableDialog>
  );
};
export default Relocate;
