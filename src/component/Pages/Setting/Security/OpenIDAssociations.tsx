import { useState } from "react";
import { Alert, Button, List, ListItem, ListItemText } from "@mui/material";
import { useTranslation } from "react-i18next";
import { UserSettings } from "../../../../api/user.ts";
import { unlinkOpenID } from "../../../../api/openid.ts";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks.ts";
import { confirmOperation } from "../../../../redux/thunks/dialog.ts";
import OpenIDButtons from "../../Login/Signin/OpenIDButtons.tsx";

export default function OpenIDAssociations({
  setting,
  setSetting,
}: {
  setting: UserSettings;
  setSetting: (setting: UserSettings) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const providers = useAppSelector((s) => s.siteConfig.login.config.login_providers ?? []);
  const bindings = setting.open_id ?? [];
  const unlink = async (id: number) => {
    try {
      await dispatch(confirmOperation(t("openid.unlinkConfirm")));
      setLoading(true);
      await dispatch(unlinkOpenID(id));
      setSetting({ ...setting, open_id: bindings.filter((b) => b.provider !== id) });
    } catch {
      // The request stack displays server errors; cancel leaves the list intact.
    } finally {
      setLoading(false);
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
