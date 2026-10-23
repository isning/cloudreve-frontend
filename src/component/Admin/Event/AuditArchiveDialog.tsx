import React from "react";
import { Alert, DialogContent, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import { LoadingButton } from "@mui/lab";
import DraggableDialog from "../../Dialogs/DraggableDialog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuditArchive, createAuditArchive, getAuditArchiveStatus, purgeAuditArchive } from "../../../api/audit";
import { useAppDispatch } from "../../../redux/hooks";
import { confirmOperation } from "../../../redux/thunks/dialog";
import AuditCategorySelect from "./AuditCategorySelect";

const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

export default function AuditArchiveDialog({
  open,
  onClose,
  onPurged,
  categories: initialCategories,
}: {
  open: boolean;
  onClose: () => void;
  onPurged: () => void;
  categories: number[];
}) {
  const { t } = useTranslation("dashboard");
  const dispatch = useAppDispatch();
  const [before, setBefore] = useState(localDate(new Date(Date.now() - 30 * 86400000)));
  const [after, setAfter] = useState(localDate(new Date()));
  const [categories, setCategories] = useState(initialCategories);
  const [archive, setArchive] = useState<AuditArchive>();
  const [status, setStatus] = useState<"pending" | "completed" | "failed" | "purged">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setArchive(undefined);
      setStatus(undefined);
      setError("");
      setCategories(initialCategories);
      setAfter(localDate(new Date()));
    }
  }, [open]);
  useEffect(() => {
    if (!open || !archive || status !== "pending") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await dispatch(getAuditArchiveStatus(archive.id));
        if (!active) return;
        if (result.status === "pending" && new Date(archive.expires).getTime() > Date.now())
          timer = setTimeout(poll, 1000);
        else setStatus(result.status === "pending" ? "failed" : result.status);
      } catch {
        if (active) {
          setStatus("failed");
          setError(t("audit.exportFailed"));
        }
      }
    };
    timer = setTimeout(poll, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [archive, status, open, dispatch, t]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await dispatch(
        createAuditArchive({
          not_before: new Date(before).toISOString(),
          not_after: new Date(after).toISOString(),
          categories,
        }),
      );
      setArchive(result);
      setStatus("pending");
    } catch {
      setError(t("audit.exportFailed"));
    } finally {
      setBusy(false);
    }
  };
  const purge = async () => {
    if (!archive) return;
    try {
      await dispatch(confirmOperation(t("audit.confirmPurge")));
    } catch {
      return;
    }
    setBusy(true);
    try {
      await dispatch(purgeAuditArchive(archive.id));
      setStatus("purged");
      onPurged();
    } catch {
      setError(t("audit.purgeFailed"));
    } finally {
      setBusy(false);
    }
  };
  const valid =
    Number.isFinite(Date.parse(before)) &&
    Number.isFinite(Date.parse(after)) &&
    Date.parse(before) <= Date.parse(after);
  return (
    <DraggableDialog
      title={t("audit.export")}
      showActions
      showCancel
      hideOk={!!archive}
      cancelText={t("audit.close")}
      okText={t("audit.download")}
      loading={busy}
      disabled={!valid}
      onAccept={start}
      dialogProps={{ open, onClose, fullWidth: true, maxWidth: "sm" }}
      secondaryAction={
        status === "completed" && (
          <LoadingButton variant="contained" color="error" loading={busy} onClick={purge}>
            <span>{t("audit.purgeExported")}</span>
          </LoadingButton>
        )
      }
    >
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("audit.exportDescription")}
          </Typography>
          <TextField
            type="datetime-local"
            label={t("audit.notBefore")}
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 1 }}
            disabled={!!archive}
          />
          <TextField
            type="datetime-local"
            label={t("audit.notAfter")}
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 1 }}
            disabled={!!archive}
          />
          {!archive && <AuditCategorySelect value={categories} onChange={setCategories} />}
          {error && <Alert severity="error">{error}</Alert>}
          {status === "pending" && (
            <>
              <LinearProgress />
              <Typography role="status">{t("audit.exportPending")}</Typography>
            </>
          )}
          {status === "completed" && <Alert severity="success">{t("audit.exportCompleted")}</Alert>}
          {status === "failed" && !error && <Alert severity="error">{t("audit.exportFailed")}</Alert>}
          {status === "purged" && <Alert severity="success">{t("audit.purged")}</Alert>}
          {archive && <iframe title={t("audit.export")} src={archive.url} hidden />}
        </Stack>
      </DialogContent>
    </DraggableDialog>
  );
}
