import { Alert, Stack, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DefaultShareResult, sendAddDefaultShares } from "../../../api/api.ts";
import { useAppDispatch } from "../../../redux/hooks.ts";
import SessionManager from "../../../session";
import { SecondaryLoadingButton } from "../../Common/StyledComponents.tsx";
import FolderLink from "../../Icons/FolderLink.tsx";
import SettingForm from "./SettingForm.tsx";

const DefaultShares = (): React.ReactElement => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DefaultShareResult>();
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const add = async () => {
    if (running.current) return;
    const owner = SessionManager.currentLoginOrNull()?.user.id;
    if (!owner) return;
    const active = () => mounted.current && SessionManager.currentLoginOrNull()?.user.id === owner;
    running.current = true;
    setBusy(true);
    setFailed(false);
    setResult(undefined);
    try {
      const response = await dispatch(sendAddDefaultShares());
      if (active()) setResult(response);
    } catch {
      if (active()) setFailed(true);
    } finally {
      running.current = false;
      if (active()) setBusy(false);
    }
  };
  return (
    <SettingForm title={t("setting.defaultShares")} lgWidth={5}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {t("setting.defaultSharesDes")}
        </Typography>
        <SecondaryLoadingButton
          variant="contained"
          loading={busy}
          onClick={add}
          startIcon={<FolderLink />}
          sx={{ alignSelf: "flex-start" }}
        >
          <span>{t("setting.addDefaultShares")}</span>
        </SecondaryLoadingButton>
        {result && <Alert severity="success">{t("setting.defaultSharesResult", { ...result })}</Alert>}
        {failed && <Alert severity="error">{t("setting.defaultSharesError")}</Alert>}
      </Stack>
    </SettingForm>
  );
};

export default DefaultShares;
