import { ArrowDownward, ArrowUpward } from "@mui/icons-material";
import { Box, FormControl, IconButton, SelectChangeEvent, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getStoragePolicyList } from "../../../../api/api";
import { StoragePolicy } from "../../../../api/dashboard";
import { useAppDispatch } from "../../../../redux/hooks";
import FacebookCircularProgress from "../../../Common/CircularProgress";
import { DenseSelect, SquareChip } from "../../../Common/StyledComponents";
import { SquareMenuItem } from "../../../FileManager/ContextMenu/ContextMenu";
export interface PolicySelectionInputProps {
  value: number[];
  onChange: (value: number[]) => void;
}

const PolicySelectionInput = ({ value, onChange }: PolicySelectionInputProps) => {
  const { t } = useTranslation("dashboard");
  const dispatch = useAppDispatch();
  const [policies, setPolicies] = useState<StoragePolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [policyMap, setPolicyMap] = useState<Record<number, StoragePolicy>>({});

  const handleChange = (event: SelectChangeEvent<unknown>) => {
    const {
      target: { value },
    } = event;
    onChange(typeof value === "string" ? value.split(",").map(Number) : (value as number[]));
  };

  const movePolicy = (index: number, offset: number) => {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };

  useEffect(() => {
    setLoading(true);
    dispatch(getStoragePolicyList({ page: 1, page_size: 1000, order_by: "id", order_direction: "asc" }))
      .then((res) => {
        setPolicies(res.policies);
        setPolicyMap(
          res.policies.reduce(
            (acc, policy) => {
              acc[policy.id] = policy;
              return acc;
            },
            {} as Record<number, StoragePolicy>,
          ),
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <FormControl fullWidth>
      <DenseSelect
        value={value}
        multiple
        inputProps={{ "aria-label": t("group.availablePolicies") }}
        required
        onChange={handleChange}
        sx={{
          minHeight: 39,
        }}
        disabled={loading}
        MenuProps={{
          PaperProps: { sx: { maxWidth: 230 } },
          MenuListProps: {
            sx: {
              "& .MuiMenuItem-root": {
                whiteSpace: "normal",
              },
            },
          },
        }}
        renderValue={(selected) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {!loading ? (
              (selected as number[]).map((id, index) => (
                <SquareChip
                  size="small"
                  key={id}
                  label={`${policyMap[id]?.name ?? `#${id}`}${index === 0 ? ` · ${t("group.defaultPolicy")}` : ""}`}
                />
              ))
            ) : (
              <FacebookCircularProgress size={20} sx={{ mt: "1px" }} />
            )}
          </Box>
        )}
      >
        {policies.length > 0 &&
          policies.map((policy) => (
            <SquareMenuItem key={policy.id} value={policy.id}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography variant={"body2"} fontWeight={600}>
                  {policy.name}
                </Typography>
                <Typography variant={"caption"} color={"textSecondary"}>
                  {t(`policy.${policy.type}`)}
                </Typography>
              </Box>
            </SquareMenuItem>
          ))}
      </DenseSelect>
      {value.length > 1 && (
        <Box sx={{ mt: 1 }}>
          {value.map((id, index) => {
            const name = policyMap[id]?.name ?? `#${id}`;
            return (
              <Box key={id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {name}
                  {index === 0 ? ` · ${t("group.defaultPolicy")}` : ""}
                </Typography>
                <IconButton
                  size="small"
                  disabled={loading || index === 0}
                  aria-label={t("group.movePolicyUp", { name })}
                  onClick={() => movePolicy(index, -1)}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={loading || index === value.length - 1}
                  aria-label={t("group.movePolicyDown", { name })}
                  onClick={() => movePolicy(index, 1)}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}
    </FormControl>
  );
};

export default PolicySelectionInput;
