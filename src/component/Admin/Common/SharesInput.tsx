import { Alert, Autocomplete, Chip } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getShareList } from "../../../api/api.ts";
import { Share } from "../../../api/dashboard.ts";
import { useAppDispatch } from "../../../redux/hooks.ts";
import { DenseFilledTextField } from "../../Common/StyledComponents.tsx";

export interface SharesInputProps {
  value?: number[];
  onChange?: (value: number[]) => void;
}

const SharesInput = ({ value = [], onChange }: SharesInputProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation("dashboard");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Share[]>([]);
  const [selected, setSelected] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const ids = value.join(",");
  const enabled = Boolean(onChange);

  useEffect(() => {
    let active = true;
    if (!ids || !enabled) {
      setSelected([]);
      return;
    }
    dispatch(
      getShareList({ page: 1, page_size: 100, order_by: "id", order_direction: "asc", conditions: { share_id: ids } }),
    )
      .then((res) => {
        if (active) setSelected(res.shares);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [ids, dispatch, enabled]);

  useEffect(() => {
    let active = true;
    const id = search.trim();
    if (!enabled || (id && !/^[1-9]\d*$/.test(id))) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      dispatch(
        getShareList({
          page: 1,
          page_size: 20,
          order_by: "id",
          order_direction: "desc",
          conditions: id ? { share_id: id } : {},
        }),
      )
        .then((res) => {
          if (active) {
            setOptions(res.shares);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, dispatch, enabled]);

  const label = (id: number) => {
    const share = [...selected, ...options].find((s) => s.id === id);
    return share
      ? `${share.edges.file?.name ?? t("settings.unavailableShare")} (#${id})`
      : `#${id} — ${t("settings.unavailableShare")}`;
  };

  return (
    <>
      <Autocomplete<number, true, false, false>
        size="small"
        disabled={!onChange}
        multiple
        value={value}
        options={[...new Set([...value, ...options.map((s) => s.id)])]}
        loading={loading}
        filterOptions={(items) => items}
        getOptionLabel={label}
        onInputChange={(_, input, reason) => {
          if (reason === "input" || reason === "clear") setSearch(input);
        }}
        onChange={(_, next) => onChange?.([...new Set(next)])}
        getOptionDisabled={(id) => value.length >= 100 && !value.includes(id)}
        renderTags={(items, getTagProps) =>
          items.map((id, index) => {
            const { key, ...props } = getTagProps({ index });
            return <Chip key={key} {...props} size="small" label={label(id)} />;
          })
        }
        renderInput={(params) => (
          <DenseFilledTextField {...params} placeholder={t("settings.searchShare")} variant="outlined" fullWidth />
        )}
      />
      {failed && <Alert severity="warning">{t("settings.defaultSharesLoadError")}</Alert>}
    </>
  );
};

export default SharesInput;
