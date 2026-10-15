import React from "react";
import { Checkbox, ListItemText, ListSubheader, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getEventName } from "../../../util/audit";
import { eventCategories } from "../Settings/Event/Events";

export default function AuditCategorySelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={t("audit.categories")}
      helperText={value.length === 0 ? t("audit.allCategories") : undefined}
      value={value}
      SelectProps={{
        multiple: true,
        renderValue: (selected) =>
          (selected as number[]).map((id) => t(`settings.event.${getEventName(id)}`)).join(", "),
      }}
      onChange={(event) =>
        onChange(
          typeof event.target.value === "string"
            ? event.target.value.split(",").filter(Boolean).map(Number)
            : event.target.value,
        )
      }
    >
      {Object.entries(eventCategories).flatMap(([key, category]) => [
        <ListSubheader key={key}>{t(category.title)}</ListSubheader>,
        ...category.events.map((id) => (
          <MenuItem key={id} value={id}>
            <Checkbox size="small" checked={value.includes(id)} />
            <ListItemText primary={t(`settings.event.${getEventName(id)}`)} />
          </MenuItem>
        )),
      ])}
    </TextField>
  );
}
