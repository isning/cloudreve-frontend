import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bindStoragePolicy, getAvailableStoragePolicies } from "../../../api/api.ts";
import { StoragePolicy } from "../../../api/explorer.ts";
import { setBindPolicyDialog } from "../../../redux/globalStateSlice.ts";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks.ts";
import { refreshFileList } from "../../../redux/thunks/filemanager.ts";
import SessionManager from "../../../session";

const BindPolicy = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const target = useAppSelector((state) => state.globalState.bindPolicyDialog);
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  const [policies, setPolicies] = useState<StoragePolicy[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const close = () => dispatch(setBindPolicyDialog(undefined));
  useEffect(() => {
    let active = true;
    setPolicies([]);
    setSelected("");
    if (!target || target.owner !== owner) return;
    setLoading(true);
    dispatch(getAvailableStoragePolicies())
      .then((available) => {
        if (!active) return;
        setPolicies(available);
        const preference = target.file.extended_info?.storage_policy?.id;
        setSelected(available.find((p) => p.id === preference)?.id ?? available[0]?.id ?? "");
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [target, owner, dispatch]);
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
    <Dialog open={!!target && target.owner === owner} onClose={saving ? undefined : close} fullWidth maxWidth="xs">
      <DialogTitle>{t("fileManager.bindStoragePolicy")}</DialogTitle>
      <DialogContent>
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
        {!loading && !policies.length && (
          <Typography color="error" variant="body2">
            {t("uploader.noAvailablePolicies")}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={close}>
          {t("cancel", { ns: "common" })}
        </Button>
        <Button disabled={loading || saving || !selected} onClick={save}>
          {t("fileManager.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
export default BindPolicy;
