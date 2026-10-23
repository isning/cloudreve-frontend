import { ExpandMoreRounded } from "@mui/icons-material";
import { AccordionDetails, FormControlLabel } from "@mui/material";
import { AccordionSummary, StyledAccordion } from "../../Common/SettingsAccordion.tsx";
import React, { useContext } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { ProviderRegistry, ExternalProvider } from "../../../../api/openid.ts";
import { SettingContext } from "../SettingWrapper.tsx";
import OpenIDProviderEditor from "./OpenIDProviderEditor.tsx";
import { useTranslation } from "react-i18next";
import Add from "../../../Icons/Add.tsx";
import { SecondaryButton, StyledCheckbox } from "../../../Common/StyledComponents.tsx";

export { AccordionSummary, StyledAccordion } from "../../Common/SettingsAccordion.tsx";

export interface SettingSectionProps {}

const SSOSettings = () => {
  const { values, setSettings, resetVersion } = useContext(SettingContext);
  const { t } = useTranslation();
  let registry: ProviderRegistry;
  try {
    registry = JSON.parse(values.external_login_providers || '{"version":1,"next_id":3,"providers":[]}');
    if (
      registry.version !== 1 ||
      !Number.isSafeInteger(registry.next_id) ||
      registry.next_id < 3 ||
      !Array.isArray(registry.providers)
    )
      throw new Error();
    const ids = new Set<number>();
    for (const provider of registry.providers) {
      if (
        !provider ||
        !Number.isSafeInteger(provider.id) ||
        provider.id < 0 ||
        provider.id >= registry.next_id ||
        ids.has(provider.id) ||
        typeof provider.type !== "string" ||
        !provider.type
      )
        throw new Error();
      ids.add(provider.id);
      if (
        ["oidc", "logto"].includes(provider.type) &&
        (!provider.config || typeof provider.config !== "object" || Array.isArray(provider.config))
      )
        throw new Error();
    }
  } catch {
    return <Alert severity="error">{t("openid.invalidConfig")}</Alert>;
  }
  const save = (next: ProviderRegistry) => setSettings({ external_login_providers: JSON.stringify(next) });
  const update = (provider: ExternalProvider) =>
    save({ ...registry, providers: registry.providers.map((p) => (p.id === provider.id ? provider : p)) });
  const add = (type: string) => {
    const id = Math.max(3, registry.next_id);
    save({
      ...registry,
      next_id: id + 1,
      providers: [
        ...registry.providers,
        {
          id,
          type,
          enabled: false,
          config: { display_name: type.toUpperCase(), direct_sign_in: false },
          wellknown: {},
        },
      ],
    });
  };
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t("openid.adminIntro")}
      </Typography>
      {registry.providers.map((provider) => (
        <StyledAccordion key={provider.id} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>
            <FormControlLabel
              onClick={(e) => e.stopPropagation()}
              control={
                <StyledCheckbox
                  size="small"
                  checked={provider.enabled}
                  disabled={!["oidc", "logto"].includes(provider.type)}
                  onChange={(e) => update({ ...provider, enabled: e.target.checked })}
                />
              }
              label={`${provider.config?.display_name || provider.type.toUpperCase()} · #${provider.id}`}
            />
          </AccordionSummary>
          <AccordionDetails>
            {["oidc", "logto"].includes(provider.type) ? (
              <OpenIDProviderEditor provider={provider} onChange={update} resetVersion={resetVersion} />
            ) : (
              <Alert severity="info">{t("openid.unsupported")}</Alert>
            )}
            <Button
              type="button"
              color="error"
              sx={{ mt: 2 }}
              onClick={() => save({ ...registry, providers: registry.providers.filter((p) => p.id !== provider.id) })}
            >
              {t("openid.remove")}
            </Button>
          </AccordionDetails>
        </StyledAccordion>
      ))}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <SecondaryButton type="button" variant="contained" startIcon={<Add />} onClick={() => add("oidc")}>
          {t("openid.addOIDC")}
        </SecondaryButton>
        <SecondaryButton type="button" variant="contained" startIcon={<Add />} onClick={() => add("logto")}>
          {t("openid.addLogto")}
        </SecondaryButton>
      </Stack>
    </Stack>
  );
};
export default SSOSettings;
