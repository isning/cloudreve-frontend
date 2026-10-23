import { Alert, Button, DialogContent, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bindStoragePolicy, getAvailableStoragePolicies } from "../../../api/api.ts";
import { StoragePolicy } from "../../../api/explorer.ts";
import { setBindPolicyDialog } from "../../../redux/globalStateSlice.ts";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks.ts";
import { refreshFileList } from "../../../redux/thunks/filemanager.ts";
import SessionManager from "../../../session";
import DraggableDialog from "../../Dialogs/DraggableDialog.tsx";

const BindPolicy = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const target = useAppSelector((state) => state.globalState.bindPolicyDialog);
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  const [policies, setPolicies] = useState<StoragePolicy[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const close = () => dispatch(setBindPolicyDialog(undefined));
  useEffect(() => {
    let active = true;
    setPolicies([]);
    setSelected("");
    if (!target || target.owner !== owner) return;
    setLoading(true);
    setFailed(false);
    dispatch(getAvailableStoragePolicies())
      .then((available) => {
        if (!active) return;
        setPolicies(available);
        const preference = target.file.extended_info?.storage_policy?.id;
        setSelected(available.find((p) => p.id === preference)?.id ?? available[0]?.id ?? "");
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
    if (!target || target.owner !== owner || !target.file.path || !selected) return;
    // Freeze the owner in the URI so a queued request cannot bind a different
    // account's same-named folder if the active authentication changes.
    const uri = new URL(target.file.path);
    uri.username = target.owner;
    setSaving(true);
    try {
      await dispatch(bindStoragePolicy(uri.toString(), selected));
      if (SessionManager.currentLoginOrNull()?.user.id !== target.owner) return;
      close();
      dispatch(refreshFileList(target.index));
    } catch {
      /* Native request handling displays the server error. */
    } finally {
      setSaving(false);
    }
  };
  return (
    <DraggableDialog
      title={t("fileManager.bindStoragePolicy")}
      showActions
      showCancel
      loading={saving}
      disabled={loading || !selected}
      onAccept={save}
      okText={t("fileManager.save")}
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
          {t("fileManager.bindStoragePolicyDescription")}
        </Typography>
        <TextField
          select
          fullWidth
          margin="normal"
          label={t("uploader.storagePolicy")}
          value={selected}
          disabled={loading || saving || !policies.length}
          onChange={(event) => setSelected(event.target.value)}
        >
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
export default BindPolicy;
