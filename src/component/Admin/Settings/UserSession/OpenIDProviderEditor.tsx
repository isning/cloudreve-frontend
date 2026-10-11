import GroupSelectionInput from "../../Common/GroupSelectionInput.tsx";
import { useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { ExternalProvider, discoverOpenID } from "../../../../api/openid.ts";
import { useAppDispatch } from "../../../../redux/hooks.ts";

export default function OpenIDProviderEditor({
  provider,
  onChange,
}: {
  provider: ExternalProvider;
  onChange: (provider: ExternalProvider) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [endpoint, setEndpoint] = useState(
    String(provider.wellknown?.issuer ?? "").replace(/\/$/, "") + "/.well-known/openid-configuration",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: string, value: unknown) => onChange({ ...provider, config: { ...provider.config, [key]: value } });
  const field = (key: string, secret = false, required = false) => (
    <TextField
      key={key}
      size="small"
      fullWidth
      label={t(`openid.fields.${key}`)}
      type={secret ? "password" : "text"}
      autoComplete={secret ? "new-password" : "off"}
      required={required && provider.enabled}
      value={provider.config[key] ?? ""}
      onChange={(e) => set(key, e.target.value)}
    />
  );
  const discover = async () => {
    setLoading(true);
    setError("");
    try {
      const document = JSON.parse(await dispatch(discoverOpenID(endpoint)));
      onChange({ ...provider, wellknown: document });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t("openid.callbackURI")}:{" "}
        <Box component="code" sx={{ wordBreak: "break-all" }}>
          {window.location.origin}/callback/openid/{provider.id}
        </Box>
      </Typography>
      {field("display_name")}
      {field("icon")}
      {provider.type === "logto" ? (
        <>
          {field("endpoint", false, true)}
          {field("app_id", false, true)}
          {field("app_secret", true, true)}
          {field("direct_sso")}
        </>
      ) : (
        <>
          {field("client_id", false, true)}
          {field("client_secret", true, true)}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              size="small"
              fullWidth
              label={t("openid.discoveryURL")}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
            <Button type="button" disabled={loading} onClick={discover}>
              {t("openid.discover")}
            </Button>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          <JSONField
            label={t("openid.discoveryDocument")}
            value={provider.wellknown ?? {}}
            onChange={(value) => onChange({ ...provider, wellknown: value })}
          />
        </>
      )}
      {field("scope")}
      <FormControlLabel
        control={
          <Checkbox
            checked={provider.config.direct_sign_in === true}
            onChange={(e) => set("direct_sign_in", e.target.checked)}
          />
        }
        label={t("openid.autoCreate")}
      />
      <Box component="details">
        <Box component="summary" sx={{ cursor: "pointer", mb: 2 }}>
          {t("openid.claimMappings")}
        </Box>
        <Stack spacing={2}>
          {[
            "sub_field_mapping",
            "email_field_mapping",
            "name_field_mapping",
            "avatar_field_mapping",
            "group_field_mapping",
          ].map((key) => field(key))}
          {Object.entries((provider.config.group_mapping ?? {}) as Record<string, number>).map(([value, group]) => (
            <Stack key={value} direction="row" spacing={1} alignItems="center">
              <Typography sx={{ minWidth: 100 }}>{value}</Typography>
              <GroupSelectionInput
                value={String(group)}
                onChange={(id) =>
                  set("group_mapping", { ...(provider.config.group_mapping as object), [value]: Number(id) })
                }
              />
            </Stack>
          ))}
          <JSONField
            label={t("openid.groupMapping")}
            value={(provider.config.group_mapping ?? {}) as Record<string, unknown>}
            onChange={(value) => set("group_mapping", value)}
          />
        </Stack>
      </Box>
    </Stack>
  );
}
function JSONField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [invalid, setInvalid] = useState<string>();
  return (
    <TextField
      fullWidth
      multiline
      minRows={3}
      label={label}
      error={invalid !== undefined}
      helperText={invalid !== undefined ? "Invalid JSON object" : undefined}
      value={invalid ?? JSON.stringify(value, null, 2)}
      onChange={(e) => {
        try {
          const parsed = JSON.parse(e.target.value);
          if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
          setInvalid(undefined);
          e.target.setCustomValidity("");
          onChange(parsed);
        } catch {
          setInvalid(e.target.value);
          e.target.setCustomValidity("Invalid JSON object");
        }
      }}
    />
  );
}
