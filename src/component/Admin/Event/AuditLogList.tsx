import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  DialogContent,
  IconButton,
  Tooltip,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { cleanupAuditLogs, deleteAuditLogs, getAuditLog, getAuditLogs } from "../../../api/audit";
import { AuditLog } from "../../../api/dashboard";
import { useAppDispatch } from "../../../redux/hooks";
import { confirmOperation } from "../../../redux/thunks/dialog";
import { getEventName } from "../../../util/audit";
import { LoadingButton } from "@mui/lab";
import DraggableDialog, { StyledDialogActions } from "../../Dialogs/DraggableDialog";
import ArrowSync from "../../Icons/ArrowSync";
import Filter from "../../Icons/Filter";
import Download from "../../Icons/Download";
import Broom from "../../Icons/Broom";
import Delete from "../../Icons/Delete";
import Info from "../../Icons/Info";
import MoreHorizontal from "../../Icons/MoreHorizontal";
import { SecondaryButton, NoWrapTypography, StyledTableContainerPaper } from "../../Common/StyledComponents";
import PageContainer from "../../Pages/PageContainer";
import PageHeader from "../../Pages/PageHeader";
import AuditArchiveDialog from "./AuditArchiveDialog";
import AuditCategorySelect from "./AuditCategorySelect";
import TablePagination from "../Common/TablePagination";

const boundedInt = (value: string | null, fallback: number, max: number) =>
  Math.min(max, Math.max(1, Number.parseInt(value ?? "", 10) || fallback));
const dateTime = (value?: string) => (value ? new Date(value).toLocaleString() : "—");
const fields = ["user", "file", "ip", "correlation_id"] as const;

export default function AuditLogList() {
  const { t } = useTranslation("dashboard");
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const page = boundedInt(params.get("page"), 1, 1000000);
  const pageSize = boundedInt(params.get("page_size"), 10, 500);
  const orderBy = params.get("order_by") === "created_at" ? "created_at" : "id";
  const direction = params.get("order_direction") === "asc" ? "asc" : "desc";
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acceptedQuery, setAcceptedQuery] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<number[]>([]);
  const [detail, setDetail] = useState<AuditLog>();
  const [exportOpen, setExportOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [cutoff, setCutoff] = useState("");
  const currentCategories = (params.get("category") ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 62);
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };
  const reload = () => setRefresh((value) => value + 1);
  const rowsCurrent = acceptedQuery === query && !loading && !error;
  const mounted = useRef(true);
  const currentView = useRef({ query, refresh, rowsCurrent, selected });
  currentView.current = { query, refresh, rowsCurrent, selected };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const search = new URLSearchParams(query);
    const conditions: Record<string, string> = {};
    for (const key of [...fields, "category"]) conditions[`audit_log_${key}`] = search.get(key) ?? "";
    setLoading(true);
    setError(false);
    setSelected([]);
    setLogs([]);
    setTotal(0);
    dispatch(getAuditLogs({ page, page_size: pageSize, order_by: orderBy, order_direction: direction, conditions }))
      .then((result) => {
        if (active) {
          setLogs(result.logs);
          setTotal(result.pagination.total_items ?? 0);
          setSelected([]);
          setAcceptedQuery(query);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch, query, page, pageSize, orderBy, direction, refresh]);
  const remove = async () => {
    if (!rowsCurrent || busy || selected.length === 0) return;
    try {
      await dispatch(confirmOperation(t("audit.confirmDelete", { count: selected.length })));
    } catch {
      return;
    }
    const view = currentView.current;
    if (
      !mounted.current ||
      !view.rowsCurrent ||
      view.query !== query ||
      view.refresh !== refresh ||
      view.selected !== selected
    )
      return;
    setBusy(true);
    try {
      await dispatch(deleteAuditLogs(selected));
      reload();
    } catch {
      /* The shared API handler displays the failure. */
    } finally {
      setBusy(false);
    }
  };
  const cleanup = async () => {
    if (!Number.isFinite(Date.parse(cutoff))) return;
    try {
      await dispatch(confirmOperation(t("audit.confirmCleanup")));
    } catch {
      return;
    }
    setBusy(true);
    try {
      await dispatch(cleanupAuditLogs(new Date(cutoff).toISOString(), currentCategories));
      setCleanupOpen(false);
      reload();
    } catch {
      /* The shared API handler displays the failure. */
    } finally {
      setBusy(false);
    }
  };
  const showFilters = () => {
    setDraft(Object.fromEntries(fields.map((key) => [key, params.get(key) ?? ""])));
    setCategories(currentCategories);
    setFiltersOpen(true);
  };
  const sort = (field: string) =>
    change({ order_by: field, order_direction: orderBy === field && direction === "desc" ? "asc" : "desc", page: "1" });
  return (
    <PageContainer>
      <Container maxWidth="xl">
        <PageHeader title={t("nav.events")} />
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          <SecondaryButton variant="contained" startIcon={<ArrowSync />} onClick={reload} disabled={loading}>
            {t("node.refresh")}
          </SecondaryButton>
          <SecondaryButton variant="contained" startIcon={<Filter />} onClick={showFilters}>
            {t("audit.filters")}
          </SecondaryButton>
          <Button variant="contained" startIcon={<Download />} onClick={() => setExportOpen(true)}>
            {t("audit.export")}
          </Button>
          <SecondaryButton
            variant="contained"
            startIcon={<MoreHorizontal />}
            disabled={busy}
            aria-haspopup="menu"
            aria-controls={moreAnchor ? "audit-more-menu" : undefined}
            aria-expanded={moreAnchor ? true : undefined}
            onClick={(event) => setMoreAnchor(event.currentTarget)}
          >
            {t("application:fileManager.moreActions")}
          </SecondaryButton>
          <Menu id="audit-more-menu" anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
            <MenuItem
              disabled={busy}
              onClick={() => {
                setMoreAnchor(null);
                setCleanupOpen(true);
              }}
            >
              <ListItemIcon>
                <Broom fontSize="small" />
              </ListItemIcon>
              {t("audit.cleanup")}
            </MenuItem>
          </Menu>
          {rowsCurrent && selected.length > 0 && (
            <LoadingButton variant="contained" startIcon={<Delete />} color="error" loading={busy} onClick={remove}>
              <span>{t("audit.deleteSelected", { count: selected.length })}</span>
            </LoadingButton>
          )}
          {fields
            .filter((key) => params.get(key))
            .map((key) => (
              <Chip
                key={key}
                label={`${t(`audit.${key}`)}: ${params.get(key)}`}
                onDelete={() => change({ [key]: "", page: "1" })}
              />
            ))}
          {currentCategories.length > 0 && (
            <Chip
              label={t("audit.categoryCount", { count: currentCategories.length })}
              onDelete={() => change({ category: "", page: "1" })}
            />
          )}
        </Stack>
        {error && (
          <Alert
            severity="error"
            action={
              <Button size="small" color="inherit" onClick={reload}>
                {t("audit.retry")}
              </Button>
            }
          >
            {t("audit.loadFailed")}
          </Alert>
        )}
        <TableContainer component={StyledTableContainerPaper}>
          {loading && <LinearProgress />}
          <Table
            size="small"
            stickyHeader
            sx={{ minWidth: 1120, tableLayout: "fixed", width: "100%" }}
            aria-label={t("nav.events")}
          >
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 36 }}>
                  <Checkbox
                    size="small"
                    disabled={!rowsCurrent || busy}
                    inputProps={{ "aria-label": t("audit.selectAll") }}
                    checked={logs.length > 0 && selected.length === logs.length}
                    indeterminate={selected.length > 0 && selected.length < logs.length}
                    onChange={(_, checked) => setSelected(checked ? logs.map((row) => row.id) : [])}
                  />
                </TableCell>
                <TableCell sx={{ width: 80 }}>
                  <TableSortLabel active={orderBy === "id"} direction={direction} onClick={() => sort("id")}>
                    ID
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 240 }}>{t("audit.event")}</TableCell>
                <TableCell sx={{ width: 160 }}>{t("audit.user")}</TableCell>
                <TableCell sx={{ width: 180 }}>{t("audit.file")}</TableCell>
                <TableCell sx={{ width: 140 }}>IP</TableCell>
                <TableCell sx={{ width: 200 }}>
                  <TableSortLabel
                    active={orderBy === "created_at"}
                    direction={direction}
                    onClick={() => sort("created_at")}
                  >
                    {t("audit.time")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 60 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {(rowsCurrent ? logs : []).map((row) => (
                <TableRow key={row.id} hover selected={selected.includes(row.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      disabled={!rowsCurrent || busy}
                      inputProps={{ "aria-label": t("audit.selectEvent", { id: row.id }) }}
                      checked={selected.includes(row.id)}
                      onChange={(_, checked) =>
                        setSelected((ids) => (checked ? [...ids, row.id] : ids.filter((id) => id !== row.id)))
                      }
                    />
                  </TableCell>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <NoWrapTypography
                        variant="inherit"
                        title={t(`settings.event.${getEventName(row.type ?? row.content?.category ?? 0)}`)}
                      >
                        {t(`settings.event.${getEventName(row.type ?? row.content?.category ?? 0)}`)}
                      </NoWrapTypography>
                      {row.content?.failed && <Chip color="error" size="small" label={t("audit.failed")} />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <NoWrapTypography variant="inherit" title={row.edges.user?.nick}>
                      {row.edges.user?.nick ?? (row.content?.is_system ? t("audit.system") : t("audit.anonymous"))}
                    </NoWrapTypography>
                  </TableCell>
                  <TableCell>
                    <NoWrapTypography variant="inherit" title={row.edges.file?.name ?? row.content?.name}>
                      {row.edges.file?.name ?? row.content?.name ?? "—"}
                    </NoWrapTypography>
                  </TableCell>
                  <TableCell>{row.ip || "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dateTime(row.created_at)}</TableCell>
                  <TableCell>
                    <Tooltip title={t("audit.details")}>
                      <IconButton
                        size="small"
                        aria-label={t("audit.details")}
                        onClick={() => {
                          dispatch(getAuditLog(row.id))
                            .then(setDetail)
                            .catch(() => {});
                        }}
                      >
                        <Info fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {rowsCurrent && logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography sx={{ py: 4 }} color="text.secondary" align="center">
                      {t("audit.empty")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {rowsCurrent && total > 0 && (
          <Box sx={{ mt: 1 }}>
            <TablePagination
              totalItems={total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[10, 25, 50, 100, 200, 500]}
              onChange={(_, value) => change({ page: String(Math.max(1, value)) })}
              onRowsPerPageChange={(value) => change({ page_size: String(value), page: "1" })}
            />
          </Box>
        )}
        <DraggableDialog
          title={t("audit.filters")}
          showActions
          showCancel
          okText={t("audit.apply")}
          dialogProps={{ open: filtersOpen, onClose: () => setFiltersOpen(false), fullWidth: true, maxWidth: "sm" }}
          onAccept={() => {
            change({ ...draft, category: categories.join(","), page: "1" });
            setFiltersOpen(false);
          }}
          secondaryAction={
            <Button
              onClick={() => {
                change({ ...Object.fromEntries(fields.map((key) => [key, ""])), category: "", page: "1" });
                setFiltersOpen(false);
              }}
            >
              {t("audit.reset")}
            </Button>
          }
        >
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {fields.map((key) => (
                <TextField
                  key={key}
                  label={t(`audit.${key}`)}
                  value={draft[key] ?? ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                  size="small"
                />
              ))}
              <AuditCategorySelect value={categories} onChange={setCategories} />
            </Stack>
          </DialogContent>
        </DraggableDialog>
        <DraggableDialog
          title={`${t("audit.details")} #${detail?.id ?? ""}`}
          showActions
          showCancel
          hideOk
          cancelText={t("audit.close")}
          dialogProps={{ open: !!detail, onClose: () => setDetail(undefined), fullWidth: true, maxWidth: "md" }}
        >
          <DialogContent>
            {detail && (
              <Stack spacing={1}>
                <Typography>
                  {t(`settings.event.${getEventName(detail.type ?? detail.content?.category ?? 0)}`)}
                </Typography>
                <Typography variant="body2">{dateTime(detail.created_at)}</Typography>
                <Typography variant="body2">
                  {t("audit.user")}: {detail.edges.user?.email ?? detail.user_hash_id ?? t("audit.anonymous")}
                </Typography>
                <Typography variant="body2">IP: {detail.ip || "—"}</Typography>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {t("audit.correlation_id")}: {detail.correlation_id || "—"}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontSize: "0.8rem",
                    bgcolor: "action.hover",
                    p: 2,
                    borderRadius: 1,
                  }}
                >
                  {JSON.stringify(detail.content, null, 2)}
                </Box>
              </Stack>
            )}
          </DialogContent>
        </DraggableDialog>
        <DraggableDialog
          title={t("audit.cleanup")}
          loading={busy}
          dialogProps={{ open: cleanupOpen, onClose: () => setCleanupOpen(false), fullWidth: true, maxWidth: "sm" }}
        >
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="warning">{t("audit.cleanupDescription")}</Alert>
              <TextField
                label={t("audit.notAfter")}
                type="datetime-local"
                value={cutoff}
                onChange={(event) => setCutoff(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Typography variant="body2">
                {currentCategories.length
                  ? t("audit.categoryCount", { count: currentCategories.length })
                  : t("audit.allCategories")}
              </Typography>
            </Stack>
          </DialogContent>
          <StyledDialogActions>
            <Box />
            <Stack direction="row" spacing={1}>
              <Button disabled={busy} onClick={() => setCleanupOpen(false)}>
                {t("audit.close")}
              </Button>
              <LoadingButton
                variant="contained"
                color="error"
                loading={busy}
                disabled={!Number.isFinite(Date.parse(cutoff))}
                onClick={cleanup}
              >
                <span>{t("audit.cleanup")}</span>
              </LoadingButton>
            </Stack>
          </StyledDialogActions>
        </DraggableDialog>
        <AuditArchiveDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          onPurged={reload}
          categories={currentCategories}
        />
      </Container>
    </PageContainer>
  );
}
