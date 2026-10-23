import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, List, ListItem, ListItemText } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ProfileSettingProps } from "../ProfileSetting.tsx";
import { unlinkOpenID } from "../../../../api/openid.ts";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks.ts";
import { confirmOperation } from "../../../../redux/thunks/dialog.ts";
import OpenIDButtons from "../../Login/Signin/OpenIDButtons.tsx";
import SessionManager from "../../../../session";

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
          <ListItem
            key={binding.provider}
            disableGutters
            secondaryAction={
              <Button type="button" disabled={loading} onClick={() => unlink(binding.provider)}>
                {t("openid.unlink")}
              </Button>
            }
          >
            <ListItemText
              primary={
                providers.find((p) => p.id === binding.provider)?.name ??
                t("openid.unavailable", { id: binding.provider })
              }
              secondary={new Date(binding.linked_at).toLocaleString()}
            />
          </ListItem>
        ))}
      </List>
      <OpenIDButtons linking providers={providers.filter((p) => !bindings.some((b) => b.provider === p.id))} />
    </>
  );
}
