import { Alert, Box, Link, Stack, Typography } from "@mui/material";
import { useContext } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { PolicyType } from "../../../../api/explorer";
import LoadBalanceChildrenInput from "../LoadBalanceChildrenInput";
import { SettingSection, SettingSectionContent } from "../../Settings/Settings";
import {
  BasicInfoSection,
  DownloadSection,
  EncryptionSection,
  MediaMetadataSection,
  StorageAndUploadSection,
  ThumbnailsSection,
} from "./FormSections";
import { StoragePolicySettingContext } from "./StoragePolicySettingWrapper";

const StoragePolicyForm = () => {
  const { t } = useTranslation("dashboard");
  const { formRef, values, setPolicy } = useContext(StoragePolicySettingContext);

  return (
    <Box component={"form"} ref={formRef} onSubmit={(e) => e.preventDefault()}>
      {!values.edges?.groups?.length && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Trans
            i18nKey="policy.noBindedGroupWarning"
            ns="dashboard"
            components={[<Link component={RouterLink} to="/admin/group" />]}
          />
        </Alert>
      )}
      <Stack spacing={5}>
        <BasicInfoSection />
        {values.type === PolicyType.load_balance ? (
          <SettingSection>
            <Typography variant="h6" gutterBottom>
              {t("policy.childPolicy")}
            </Typography>
            <SettingSectionContent>
              <LoadBalanceChildrenInput
                value={values.edges.policy_load_balance ?? []}
                onChange={(children) =>
                  setPolicy((policy) => ({ ...policy, edges: { ...policy.edges, policy_load_balance: children } }))
                }
              />
            </SettingSectionContent>
          </SettingSection>
        ) : (
          <>
            <StorageAndUploadSection />
            <DownloadSection />
            <ThumbnailsSection />
            <MediaMetadataSection />
            <EncryptionSection />
          </>
        )}
      </Stack>
    </Box>
  );
};

export default StoragePolicyForm;
