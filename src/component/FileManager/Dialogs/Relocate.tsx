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
import { useSnackbar } from "notistack";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAvailableStoragePolicies, sendRelocate } from "../../../api/api.ts";
import { AppError, Code } from "../../../api/request.ts";
import { GroupPermission } from "../../../api/user.ts";
import { refreshFileList } from "../../../redux/thunks/filemanager.ts";
import { StoragePolicy } from "../../../api/explorer.ts";
import { setRelocateDialog } from "../../../redux/globalStateSlice.ts";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks.ts";
import SessionManager from "../../../session";
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
  const close = () => dispatch(setRelocateDialog(undefined));
  useEffect(() => {
    let active = true;
    setPolicies([]);
    setSelected("");
    if (!target || target.owner !== owner) return;
    setLoading(true);
    dispatch(getAvailableStoragePolicies())
      .then((available) => {
        if (active) setPolicies(available);
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
    <Dialog open={!!target && target.owner === owner} onClose={saving ? undefined : close} fullWidth maxWidth="xs">
      <DialogTitle>{t("fileManager.relocateStoragePolicy")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t("fileManager.relocateStoragePolicyDescription")}
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
        <Button disabled={loading || saving || !selected || !authorized} onClick={save}>
          {t("fileManager.startStorageMigration")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
export default Relocate;
