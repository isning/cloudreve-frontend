import { Alert, Button, DialogContent, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getFileInfo } from "../../../api/api";
import { FileResponse, FileType, PermissionSetting } from "../../../api/explorer";
import { clearFilePermissions, setFilePermissions } from "../../../api/permission";
import { GroupPermission } from "../../../api/user";
import { useAppDispatch } from "../../../redux/hooks";
import { refreshFileList } from "../../../redux/thunks/filemanager";
import SessionManager from "../../../session";
import DraggableDialog from "../../Dialogs/DraggableDialog";
import PermissionEditor from "./Share/PermissionEditor";

export default function FilePermissions({
  target,
  onSaved,
}: {
  target: FileResponse;
  onSaved: (file: FileResponse) => void;
}) {
  const { t } = useTranslation("application");
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [value, setValue] = useState<PermissionSetting>({});
  const revision = useRef(0);
  useEffect(() => {
    ++revision.current;
    setOpen(false);
    setLoading(false);
    setFailed(false);
    return () => {
      ++revision.current;
    };
  }, [target.id]);
  if (!target.owned && !SessionManager.currentUserGroupPermission().enabled(GroupPermission.is_admin)) return null;
  const save = async (clear = false) => {
    const current = revision.current;
    setLoading(true);
    setFailed(false);
    try {
      await dispatch(clear ? clearFilePermissions([target.path]) : setFilePermissions([target.path], value));
      const refreshed = await dispatch(getFileInfo({ uri: target.path, extended: true }));
      if (current === revision.current) {
        onSaved(refreshed);
        setOpen(false);
      }
      dispatch(refreshFileList(0));
    } catch {
      if (current === revision.current) setFailed(true);
    } finally {
      if (current === revision.current) setLoading(false);
    }
  };
  return (
    <>
      <Button
        size="small"
        sx={{ alignSelf: "flex-start" }}
        onClick={() => {
          setValue(target.extended_info?.permissions ?? { everyone: "Pw==", anonymous: "IQ==" });
          setFailed(false);
          setOpen(true);
        }}
      >
        {t("fileManager.permissions")}
      </Button>
      <DraggableDialog
        title={t("fileManager.permissions")}
        showActions
        showCancel
        loading={loading}
        onAccept={() => save()}
        secondaryAction={
          <Button disabled={loading} onClick={() => save(true)}>
            {t("sharing.inherit")}
          </Button>
        }
        dialogProps={{
          open,
          fullWidth: true,
          maxWidth: "sm",
          onClose: () => {
            if (!loading) setOpen(false);
          },
        }}
      >
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {t("sharing.fileInheritance")}
            </Typography>
            {!target.extended_info?.permissions && <Alert severity="info">{t("sharing.currentlyInherited")}</Alert>}
            {failed && <Alert severity="error">{t("sharing.saveFailed")}</Alert>}
            <PermissionEditor value={value} onChange={setValue} folder={target.type === FileType.folder} />
          </Stack>
        </DialogContent>
      </DraggableDialog>
    </>
  );
}
