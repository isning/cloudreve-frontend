import { Box, Button, Popover, PopoverProps, Stack } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DenseFilledTextField } from "../../Common/StyledComponents";
import SettingForm from "../../Pages/Setting/SettingForm";
import AuditCategorySelect from "./AuditCategorySelect";

export const auditFilterFields = ["user", "file", "ip", "correlation_id"] as const;
export type AuditFilterValues = Record<(typeof auditFilterFields)[number], string>;

interface AuditFilterPopoverProps extends PopoverProps {
  value: AuditFilterValues;
  categories: number[];
  onApply: (value: AuditFilterValues, categories: number[]) => void;
  onReset: () => void;
}

export default function AuditFilterPopover({
  value,
  categories,
  onApply,
  onReset,
  onClose,
  open,
  ...rest
}: AuditFilterPopoverProps) {
  const { t } = useTranslation("dashboard");
  const [draft, setDraft] = useState(value);
  const [selectedCategories, setSelectedCategories] = useState(categories);

  // Match neighboring filter popovers: start a fresh draft each time it opens.
  useEffect(() => {
    if (open) {
      setDraft(value);
      setSelectedCategories(categories);
    }
  }, [open]);

  const close = () => onClose?.({}, "backdropClick");

  return (
    <Popover
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-label": t("audit.filters"),
          sx: { p: 2, width: 300, maxWidth: "100%" },
        },
      }}
      open={open}
      onClose={onClose}
      {...rest}
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft, selectedCategories);
          close();
        }}
      >
        <Stack spacing={2}>
          {auditFilterFields.map((field) => (
            <SettingForm key={field} title={t(`audit.${field}`)} noContainer lgWidth={12}>
              <DenseFilledTextField
                fullWidth
                size="small"
                value={draft[field]}
                inputProps={{ "aria-label": t(`audit.${field}`) }}
                placeholder={t("user.emptyNoFilter")}
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
              />
            </SettingForm>
          ))}
          <SettingForm title={t("audit.categories")} noContainer lgWidth={12}>
            <AuditCategorySelect dense value={selectedCategories} onChange={setSelectedCategories} />
          </SettingForm>
          <Box display="flex" justifyContent="space-between" gap={1}>
            <Button
              type="button"
              variant="outlined"
              size="small"
              onClick={() => {
                onReset();
                close();
              }}
            >
              {t("audit.reset")}
            </Button>
            <Button type="submit" variant="contained" size="small">
              {t("audit.apply")}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Popover>
  );
}
