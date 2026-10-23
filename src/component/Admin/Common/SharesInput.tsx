import { Alert, Autocomplete, Button, Chip } from "@mui/material";
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
  const [selectedFailed, setSelectedFailed] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const ids = value.join(",");
  const enabled = Boolean(onChange);

  useEffect(() => {
    let active = true;
    if (!ids || !enabled) {
      setSelected([]);
      setSelectedFailed(false);
      setSelectedLoading(false);
      return;
    }
    setSelectedLoading(true);
    dispatch(
      getShareList({ page: 1, page_size: 100, order_by: "id", order_direction: "asc", conditions: { share_id: ids } }),
    )
      .then((res) => {
        if (active) {
          setSelected(res.shares);
          setSelectedFailed(false);
        }
      })
      .catch(() => {
        if (active) setSelectedFailed(true);
      })
      .finally(() => {
        if (active) setSelectedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ids, dispatch, enabled, retryVersion]);

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
            setSearchFailed(false);
          }
        })
        .catch(() => {
          if (active) setSearchFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, dispatch, enabled, retryVersion]);

  const label = (id: number) => {
    const share = [...selected, ...options].find((s) => s.id === id);
    const unavailable =
      !share?.edges.file ||
      (share.expires && new Date(share.expires).getTime() <= Date.now()) ||
      share.remain_downloads === 0;
    return share && !unavailable
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
        loading={loading || selectedLoading}
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
      {(selectedFailed || searchFailed) && (
        <Alert
          severity="warning"
          action={
            <Button size="small" color="inherit" onClick={() => setRetryVersion((current) => current + 1)}>
              {t("settings.retryDefaultShares")}
            </Button>
          }
        >
          {t("settings.defaultSharesLoadError")}
        </Alert>
      )}
    </>
  );
};

export default SharesInput;
