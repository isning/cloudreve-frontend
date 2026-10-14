import { DeleteOutline } from "@mui/icons-material";
import { Alert, Box, Button, FormControl, IconButton, MenuItem, Stack, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getStoragePolicyList } from "../../../api/api";
import { PolicyLoadBalance, StoragePolicy } from "../../../api/dashboard";
import { PolicyType } from "../../../api/explorer";
import { useAppDispatch } from "../../../redux/hooks";
import { DenseFilledTextField, DenseSelect } from "../../Common/StyledComponents";

interface LoadBalanceChildrenInputProps {
  value: PolicyLoadBalance[];
  onChange: (value: PolicyLoadBalance[]) => void;
}

const LoadBalanceChildrenInput = ({ value, onChange }: LoadBalanceChildrenInputProps) => {
  const { t } = useTranslation("dashboard");
  const dispatch = useAppDispatch();
  const [policies, setPolicies] = useState<StoragePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    const load = async () => {
      const available: StoragePolicy[] = [];
      for (let page = 1; active; page++) {
        const result = await dispatch(
          getStoragePolicyList({ page, page_size: 1000, order_by: "id", order_direction: "asc" }),
        );
        available.push(...result.policies.filter((policy) => policy.type !== PolicyType.load_balance));
        if (result.policies.length < 1000) break;
      }
      if (active) setPolicies(available);
    };
    load()
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch, revision]);

  return (
    <Stack spacing={2}>
      <Alert severity="info">{t("policy.loadBalanceDes")}</Alert>
      {error && (
        <Alert
          severity="error"
          action={<Button onClick={() => setRevision((r) => r + 1)}>{t("policy.refresh")}</Button>}
        >
          {error}
        </Alert>
      )}
      <FormControl fullWidth>
        <DenseSelect
          multiple
          displayEmpty
          disabled={loading || !!error}
          value={value.map((member) => member.storage_policy_id)}
          inputProps={{ "aria-label": t("policy.selectPolicies") }}
          renderValue={() => t("policy.xChildPolicies", { count: value.length })}
          onChange={(event) => {
            const selected = event.target.value;
            const ids = typeof selected === "string" ? selected.split(",").map(Number) : (selected as number[]);
            onChange(
              ids.map(
                (id) =>
                  value.find((member) => member.storage_policy_id === id) ?? {
                    id: 0,
                    load_balance_id: 0,
                    storage_policy_id: id,
                    weight: 1,
                  },
              ),
            );
          }}
        >
          {policies.map((policy) => (
            <MenuItem key={policy.id} value={policy.id}>
              {policy.name}
            </MenuItem>
          ))}
        </DenseSelect>
      </FormControl>
      <Typography variant="caption" color="text.secondary">
        {t("policy.childPolicyDes")}
      </Typography>
      {value.map((member, index) => {
        const policy = policies.find((policy) => policy.id === member.storage_policy_id);
        const name = policy?.name ?? `#${member.storage_policy_id}`;
        return (
          <Box key={member.storage_policy_id} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0, opacity: (member.weight ?? 0) === 0 ? 0.5 : 1 }}>
              <Typography variant="body2" noWrap>
                {name}
              </Typography>
              {policy && (
                <Typography variant="caption" color="text.secondary">
                  {t(`policy.${policy.type}`)}
                </Typography>
              )}
            </Box>
            <DenseFilledTextField
              type="number"
              label={t("policy.weight")}
              value={member.weight ?? 0}
              required
              disabled={loading || !!error}
              inputProps={{
                min: 0,
                max: Number.MAX_SAFE_INTEGER,
                step: 1,
                "aria-label": `${t("policy.weight")} · ${name}`,
              }}
              sx={{ width: 120 }}
              onChange={(event) =>
                onChange(value.map((item, i) => (i === index ? { ...item, weight: Number(event.target.value) } : item)))
              }
            />
            <IconButton
              size="small"
              aria-label={`${t("policy.delete")} · ${name}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Box>
        );
      })}
    </Stack>
  );
};

export default LoadBalanceChildrenInput;
