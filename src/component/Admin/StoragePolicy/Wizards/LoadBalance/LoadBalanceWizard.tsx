import { Button, Stack } from "@mui/material";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StoragePolicy } from "../../../../../api/dashboard";
import { PolicyType } from "../../../../../api/explorer";
import { DenseFilledTextField } from "../../../../Common/StyledComponents";
import SettingForm from "../../../../Pages/Setting/SettingForm";
import { NoMarginHelperText } from "../../../Settings/Settings";
import { AddWizardProps } from "../../AddWizardDialog";
import LoadBalanceChildrenInput from "../../LoadBalanceChildrenInput";

const LoadBalanceWizard = ({ onSubmit }: AddWizardProps) => {
  const { t } = useTranslation("dashboard");
  const form = useRef<HTMLFormElement>(null);
  const [policy, setPolicy] = useState<StoragePolicy>({
    id: 0,
    name: "",
    type: PolicyType.load_balance,
    settings: {},
    edges: { policy_load_balance: [] },
  });
  const submit = () => {
    if (!form.current?.reportValidity() || !policy.edges.policy_load_balance?.length) return;
    onSubmit(policy);
  };
  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack spacing={2}>
        <SettingForm title={t("policy.name")} lgWidth={12}>
          <DenseFilledTextField
            fullWidth
            required
            value={policy.name}
            onChange={(event) => setPolicy({ ...policy, name: event.target.value })}
          />
          <NoMarginHelperText>{t("policy.policyName")}</NoMarginHelperText>
        </SettingForm>
        <SettingForm title={t("policy.childPolicy")} lgWidth={12}>
          <LoadBalanceChildrenInput
            value={policy.edges.policy_load_balance ?? []}
            onChange={(children) => setPolicy({ ...policy, edges: { policy_load_balance: children } })}
          />
        </SettingForm>
      </Stack>
      <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={!policy.edges.policy_load_balance?.length}>
        {t("policy.create")}
      </Button>
    </form>
  );
};

export default LoadBalanceWizard;
