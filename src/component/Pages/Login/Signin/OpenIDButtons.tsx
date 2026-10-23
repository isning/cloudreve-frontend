import React, { useState } from "react";
import { Avatar, Alert, Stack } from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { useTranslation } from "react-i18next";
import { beginOpenID, LoginProvider } from "../../../../api/openid.ts";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks.ts";
import SessionManager from "../../../../session";
import { rememberOpenID } from "../../../../session/openid.ts";

export default function OpenIDButtons({
  hint,
  ids,
  linking = false,
  providers: supplied,
}: {
  hint?: string;
  ids?: number[];
  linking?: boolean;
  providers?: LoginProvider[];
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const configured = useAppSelector((state) => state.siteConfig.login.config.login_providers ?? []);
  const providers = (supplied ?? configured).filter((p) => p.enabled && (!ids || ids.includes(p.id)));
  const [loading, setLoading] = useState<number>();
  const [error, setError] = useState("");
  const begin = async (p: LoginProvider) => {
    setLoading(p.id);
    setError("");
    try {
      const authorization = await dispatch(beginOpenID(p.id, hint, linking));
      const target = new URL(authorization);
      if (!/^https?:$/.test(target.protocol) || !target.searchParams.get("state"))
        throw new Error("Invalid authorization response");
      const query = new URLSearchParams(window.location.search);
      const returnTo = linking
        ? window.location.pathname + window.location.search
        : window.location.pathname === "/session/authorize"
          ? window.location.pathname + window.location.search
          : query.get("redirect") ?? "/home";
      rememberOpenID(target.searchParams.get("state")!, {
        returnTo,
        linking,
        provider: p.id,
        userID: linking ? SessionManager.currentLoginOrNull()?.user.id : undefined,
      });
      window.location.assign(target.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(undefined);
    }
  };
  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {providers.map((p) => (
        <LoadingButton
          key={p.id}
          type="button"
          variant="outlined"
          fullWidth
          loading={loading === p.id}
          disabled={loading !== undefined}
          onClick={() => begin(p)}
          startIcon={p.icon && <Avatar src={p.icon} sx={{ width: 20, height: 20 }} />}
        >
          {t(linking ? "openid.link" : "openid.signIn", { name: p.name })}
        </LoadingButton>
      ))}
    </Stack>
  );
}
