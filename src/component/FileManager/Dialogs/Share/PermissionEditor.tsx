import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Collapse,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSearchUser, getUserInfo } from "../../../../api/api";
import { FilePermission, PermissionSetting } from "../../../../api/explorer";
import { getPermissionGroups, PermissionGroup } from "../../../../api/permission";
import { GroupPermission, User } from "../../../../api/user";
import { useAppDispatch } from "../../../../redux/hooks";
import SessionManager from "../../../../session";
import Boolset from "../../../../util/boolset";

export const defaultSharePermissions = (): PermissionSetting => ({ everyone: "IQ==", anonymous: "IQ==" });

type BaseRule = "everyone" | "anonymous" | "same_group" | "other";
type Rule = { key: string; label: string; value?: string; map?: "user_explicit" | "group_explicit"; base?: BaseRule };

const presets: Record<string, PermissionSetting> = {
  readonly: { everyone: "IQ==", anonymous: "IQ==" },
  collaborators: { everyone: "Lw==", anonymous: "IQ==" },
  public: { everyone: "Lw==", anonymous: "Lw==" },
  collection: { everyone: "BA==", anonymous: "BA==" },
};

export default function PermissionEditor({
  value,
  onChange,
  folder = true,
}: {
  value: PermissionSetting;
  onChange: (value: PermissionSetting) => void;
  folder?: boolean;
}) {
  const { t } = useTranslation("application");
  const dispatch = useAppDispatch();
  const [advanced, setAdvanced] = useState(false);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [knownUsers, setKnownUsers] = useState<Record<string, User>>({});
  const owner = SessionManager.currentLoginOrNull()?.user.id;
  const explicitUsers = Object.keys(value.user_explicit ?? {})
    .sort()
    .join(",");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const groupPermission = SessionManager.currentUserGroupPermission();
  const canEscalate =
    groupPermission.enabled(GroupPermission.is_admin) ||
    groupPermission.enabled(GroupPermission.set_anonymous_permission);
  const preset =
    Object.entries(presets).find(
      ([, setting]) =>
        value.everyone === setting.everyone &&
        value.anonymous === setting.anonymous &&
        value.same_group == null &&
        value.other == null &&
        !Object.keys(value.user_explicit ?? {}).length &&
        !Object.keys(value.group_explicit ?? {}).length,
    )?.[0] ?? "custom";

  useEffect(() => {
    if (!advanced) return;
    let active = true;
    dispatch(getPermissionGroups())
      .then((result) => {
        if (active) setGroups(result);
      })
      .catch(() => {
        if (active) setLookupFailed(true);
      });
    return () => {
      active = false;
    };
  }, [advanced, dispatch, owner]);
  useEffect(() => {
    let active = true;
    setKnownUsers({});
    if (advanced && explicitUsers) {
      const ids = explicitUsers.split(",");
      void (async () => {
        for (let i = 0; i < ids.length && active; i += 8) {
          const results = await Promise.allSettled(ids.slice(i, i + 8).map((id) => dispatch(getUserInfo(id))));
          if (!active || SessionManager.currentLoginOrNull()?.user.id !== owner) return;
          const found: Record<string, User> = {};
          results.forEach((result) => {
            if (result.status === "fulfilled") found[result.value.id] = result.value;
          });
          setKnownUsers((current) => ({ ...current, ...found }));
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [advanced, explicitUsers, owner, dispatch]);
  useEffect(() => {
    let active = true;
    setUsers([]);
    if (!advanced || keyword.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      dispatch(getSearchUser(keyword.trim()))
        .then((result) => {
          if (active) setUsers(result);
        })
        .catch(() => {
          if (active) setLookupFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [advanced, keyword, dispatch, owner]);

  const rules = useMemo(() => {
    const result: Rule[] = (["everyone", "anonymous", "same_group", "other"] as BaseRule[]).map((base) => ({
      key: base,
      base,
      label: t(`sharing.${base}`),
      value: value[base],
    }));
    Object.entries(value.group_explicit ?? {}).forEach(([key, grant]) =>
      result.push({
        key,
        map: "group_explicit",
        value: grant,
        label: groups.find((g) => g.id === key)?.name ?? `${t("sharing.group")} ${key}`,
      }),
    );
    Object.entries(value.user_explicit ?? {}).forEach(([key, grant]) =>
      result.push({
        key,
        map: "user_explicit",
        value: grant,
        label: knownUsers[key] ? `${knownUsers[key].nickname} (${key})` : `${t("sharing.user")} ${key}`,
      }),
    );
    return result;
  }, [value, groups, knownUsers, t]);
  const setRule = (rule: Rule, grant?: string) => {
    if (rule.map) {
      const updated = { ...value[rule.map] };
      if (grant == null) delete updated[rule.key];
      else updated[rule.key] = grant;
      onChange({ ...value, [rule.map]: updated });
    } else if (rule.base) {
      const updated = { ...value };
      if (grant == null) delete updated[rule.base];
      else updated[rule.base] = grant;
      onChange(updated);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ py: 1 }}>
      <TextField
        select
        fullWidth
        size="small"
        label={t("sharing.access")}
        value={preset}
        onChange={(event) => {
          const setting = presets[event.target.value];
          if (setting) onChange({ ...setting });
          else setAdvanced(true);
        }}
      >
        <MenuItem value="readonly">{t("sharing.readonly")}</MenuItem>
        <MenuItem value="collaborators">{t("sharing.collaborators")}</MenuItem>
        <MenuItem value="public" disabled={!canEscalate}>
          {t("sharing.public")}
        </MenuItem>
        {folder && (
          <MenuItem value="collection" disabled={!canEscalate}>
            {t("sharing.collection")}
          </MenuItem>
        )}
        <MenuItem value="custom">{t("sharing.custom")}</MenuItem>
      </TextField>
      {preset === "collection" && <Alert severity="info">{t("sharing.collectionDescription")}</Alert>}
      {preset === "public" && <Alert severity="warning">{t("sharing.publicDescription")}</Alert>}
      {!canEscalate && (
        <Typography variant="caption" color="text.secondary">
          {t("sharing.anonymousRestricted")}
        </Typography>
      )}
      <Button size="small" sx={{ alignSelf: "flex-start" }} onClick={() => setAdvanced((current) => !current)}>
        {t("sharing.advanced")}
      </Button>
      <Collapse in={advanced} unmountOnExit>
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary">
            {t("sharing.precedence")}
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label={t("sharing.access")}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("sharing.audience")}</TableCell>
                  {Object.keys(FilePermission).map((name) => (
                    <TableCell key={name} align="center" sx={{ px: 0.5 }}>
                      <Tooltip title={t(`sharing.${name}Description`)}>
                        <span>{t(`sharing.${name}`)}</span>
                      </Tooltip>
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => {
                  const effective = rule.value ?? (rule.base === "everyone" ? "Pw==" : value.everyone ?? "Pw==");
                  const mask = new Boolset(effective);
                  return (
                    <TableRow key={`${rule.map ?? "base"}:${rule.key}`}>
                      <TableCell sx={{ minWidth: 115, maxWidth: 180, overflowWrap: "anywhere" }}>
                        {rule.label}
                        {rule.value == null && (
                          <Typography display="block" variant="caption" color="text.secondary">
                            {t("sharing.inherited")}
                          </Typography>
                        )}
                      </TableCell>
                      {Object.entries(FilePermission).map(([name, bit]) => (
                        <TableCell key={name} align="center" sx={{ px: 0 }}>
                          <Checkbox
                            size="small"
                            checked={mask.enabled(bit)}
                            inputProps={{ "aria-label": `${rule.label}: ${t(`sharing.${name}`)}` }}
                            disabled={
                              (rule.base === "anonymous" &&
                                !canEscalate &&
                                bit !== FilePermission.read &&
                                bit !== FilePermission.list) ||
                              ((rule.base === "everyone" || rule.base === "anonymous") &&
                                bit === FilePermission.share) ||
                              (!folder && bit === FilePermission.create)
                            }
                            onChange={(_, checked) =>
                              setRule(rule, new Boolset(effective).set(bit, checked).toString())
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell sx={{ px: 0 }}>
                        {(rule.map || (rule.base !== "everyone" && rule.base !== "anonymous")) &&
                          rule.value != null && (
                            <Button size="small" onClick={() => setRule(rule)}>
                              {t("sharing.remove")}
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          {lookupFailed && <Alert severity="error">{t("sharing.lookupFailed")}</Alert>}
          <Autocomplete<User>
            options={users}
            value={null}
            loading={loading}
            filterOptions={(options) => options}
            getOptionLabel={(option) => `${option.nickname} (${option.id})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onInputChange={(_, text) => setKeyword(text)}
            onChange={(_, user) => {
              if (user) onChange({ ...value, user_explicit: { ...value.user_explicit, [user.id]: "IQ==" } });
            }}
            renderInput={(params) => (
              <TextField {...params} size="small" label={t("sharing.addUser")} helperText={t("sharing.searchHint")} />
            )}
          />
          <Autocomplete<PermissionGroup>
            options={groups}
            value={null}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, group) => {
              if (group) onChange({ ...value, group_explicit: { ...value.group_explicit, [group.id]: "IQ==" } });
            }}
            renderInput={(params) => <TextField {...params} size="small" label={t("sharing.addGroup")} />}
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
