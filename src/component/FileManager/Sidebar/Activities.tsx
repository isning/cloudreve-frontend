import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityFilter, FileActivity, getFileActivities } from "../../../api/audit";
import { FilePermission, FileResponse } from "../../../api/explorer";
import { setVersionControlDialog } from "../../../redux/globalStateSlice";
import { useAppDispatch } from "../../../redux/hooks";
import { getEventName } from "../../../util/audit";
import { hasPermission } from "../../../util/permission";
import CrUri from "../../../util/uri";

const locationLabel = (value: string) => {
  try {
    return new CrUri(value).path() || "/";
  } catch {
    return value;
  }
};

export default function Activities({ target }: { target: FileResponse }) {
  const { t } = useTranslation(["application", "dashboard"]);
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState<ActivityFilter>("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [activities, setActivities] = useState<FileActivity[]>([]);
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    const controller = new AbortController();
    setActivities([]);
    setNext(undefined);
    setFailed(false);
    setLoading(true);
    dispatch(
      getFileActivities({ uri: target.path, page_size: 20, order_direction: direction, filter }, controller.signal),
    )
      .then((result) => {
        if (id === request.current) {
          setActivities(result.activities);
          setNext(result.pagination.next_token);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && id === request.current) setFailed(true);
      })
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
    return () => {
      ++request.current;
      controller.abort();
    };
  }, [target.path, filter, direction, revision, dispatch]);
  const more = async () => {
    if (!next || loading) return;
    const id = request.current;
    setLoading(true);
    setFailed(false);
    try {
      const result = await dispatch(
        getFileActivities({
          uri: target.path,
          page_size: 20,
          order_direction: direction,
          filter,
          next_page_token: next,
        }),
      );
      if (id === request.current) {
        setActivities((prev) => [...prev, ...result.activities]);
        setNext(result.pagination.next_token);
      }
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <TextField
          select
          fullWidth
          size="small"
          label={t("audit.filter")}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true, renderValue: (value) => t(`audit.${value || "all"}`) }}
          value={filter}
          onChange={(event) => setFilter(event.target.value as ActivityFilter)}
        >
          {(["", "my", "updates", "reads"] as const).map((value) => (
            <MenuItem key={value} value={value}>
              {t(`audit.${value || "all"}`)}
            </MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          onClick={() => setDirection((prev) => (prev === "desc" ? "asc" : "desc"))}
          aria-label={t("audit.order")}
        >
          {t(direction === "desc" ? "audit.newest" : "audit.oldest")}
        </Button>
      </Stack>
      <Button size="small" onClick={() => setRevision((prev) => prev + 1)} disabled={loading}>
        {t("fileManager.refresh")}
      </Button>
      {failed && <Alert severity="error">{t("audit.loadFailed")}</Alert>}
      {activities.map((activity) => (
        <Box key={activity.id}>
          <Stack direction="row" spacing={1} alignItems="start">
            <Avatar sx={{ width: 28, height: 28, fontSize: 14 }}>{activity.user?.nickname?.slice(0, 1) ?? "?"}</Avatar>
            <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                {activity.user?.nickname ?? t("audit.anonymous")}
              </Typography>
              <Typography variant="body2">
                {t(`dashboard:settings.event.${getEventName(activity.content.category)}`)}
              </Typography>
              {activity.content.original_name && (
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {activity.content.original_name} → {activity.content.new_name}
                </Typography>
              )}
              {(["from", "to"] as const).map(
                (key) =>
                  activity.content[key] && (
                    <Typography key={key} variant="caption" sx={{ overflowWrap: "anywhere" }} color="text.secondary">
                      {t(`audit.${key}`)}:{" "}
                      {activity.content[key] === "redacted"
                        ? t("audit.redacted")
                        : locationLabel(activity.content[key]!)}
                    </Typography>
                  ),
              )}
              {activity.content.storage_policy && (
                <Typography variant="caption" color="text.secondary">
                  {activity.content.storage_policy}
                </Typography>
              )}
              {activity.content.entity_create_time && (
                <Typography variant="caption" color="text.secondary">
                  {new Date(activity.content.entity_create_time).toLocaleString()}
                </Typography>
              )}
              {activity.version_id && hasPermission(target, FilePermission.read) && (
                <Button
                  size="small"
                  sx={{ alignSelf: "start" }}
                  onClick={() =>
                    dispatch(setVersionControlDialog({ open: true, file: target, highlight: activity.version_id }))
                  }
                >
                  {t("audit.openVersion")}
                </Button>
              )}
              <Typography variant="caption" component="time" dateTime={activity.created_at} color="text.secondary">
                {new Date(activity.created_at).toLocaleString()}
              </Typography>
            </Stack>
          </Stack>
          <Divider sx={{ mt: 2 }} />
        </Box>
      ))}
      {loading && <LinearProgress />}
      {!loading && !failed && activities.length === 0 && (
        <Typography color="text.secondary" variant="body2" sx={{ py: 3 }} textAlign="center">
          {t("audit.empty")}
        </Typography>
      )}
      {next && (
        <Button onClick={more} disabled={loading}>
          {t(failed ? "audit.retry" : "audit.loadMore")}
        </Button>
      )}
    </Stack>
  );
}
