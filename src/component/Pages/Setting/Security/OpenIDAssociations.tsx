import React, { useEffect, useRef, useState } from "react";
import { Alert, List } from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { useTranslation } from "react-i18next";
import type { ProfileSettingProps } from "../ProfileSetting.tsx";
import { unlinkOpenID } from "../../../../api/openid.ts";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks.ts";
import { confirmOperation } from "../../../../redux/thunks/dialog.ts";
import OpenIDButtons from "../../Login/Signin/OpenIDButtons.tsx";
import SessionManager from "../../../../session";
import { NoWrapTypography } from "../../../Common/StyledComponents.tsx";
import TimeBadge from "../../../Common/TimeBadge.tsx";
import LinkOutlined from "../../../Icons/LinkOutlined.tsx";
import LinkDismiss from "../../../Icons/LinkDismiss.tsx";
import SettingListItem from "../SettingListItem.tsx";

export default function OpenIDAssociations({ setting, setSetting }: ProfileSettingProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const providers = useAppSelector((s) => s.siteConfig.login.config.login_providers ?? []);
  const bindings = setting.open_id ?? [];
  const unlink = async (id: number) => {
    const actor = SessionManager.currentLoginOrNull()?.user.id;
    if (!actor || loading) return;
    try {
      await dispatch(confirmOperation(t("openid.unlinkConfirm")));
      if (!active.current || SessionManager.currentLoginOrNull()?.user.id !== actor) return;
      setLoading(true);
      await dispatch(unlinkOpenID(id));
      if (active.current && SessionManager.currentLoginOrNull()?.user.id === actor) {
        setSetting((current) =>
          current ? { ...current, open_id: current.open_id?.filter((binding) => binding.provider !== id) } : current,
        );
      }
    } catch {
      // The request stack displays server errors; cancel leaves the list intact.
    } finally {
      if (active.current) setLoading(false);
    }
  };
  return (
    <>
      {setting.credential_capabilities?.reason === "managed" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("openid.managed")}
        </Alert>
      )}
      <List disablePadding>
        {bindings.map((binding) => (
          <SettingListItem
            key={binding.provider}
            icon={LinkOutlined}
            sx={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr) auto",
              pr: 2,
              "& .MuiListItemSecondaryAction-root": { position: "static", transform: "none", ml: 1 },
            }}
            secondaryAction={
              <LoadingButton
                type="button"
                variant="outlined"
                color="error"
                loading={loading}
                onClick={() => unlink(binding.provider)}
                startIcon={<LinkDismiss />}
              >
                <span>{t("openid.unlink")}</span>
              </LoadingButton>
            }
            settingTitle={
              <NoWrapTypography variant="inherit">
                {providers.find((p) => p.id === binding.provider)?.name ??
                  t("openid.unavailable", { id: binding.provider })}
              </NoWrapTypography>
            }
            settingDescription={<TimeBadge datetime={binding.linked_at} variant="inherit" />}
          />
        ))}
      </List>
      <OpenIDButtons linking providers={providers.filter((p) => !bindings.some((b) => b.provider === p.id))} />
    </>
  );
}
