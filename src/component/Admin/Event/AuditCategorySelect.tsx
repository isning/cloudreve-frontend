import React from "react";
import { Checkbox, ListItemText, ListSubheader, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getEventName } from "../../../util/audit";
import { eventCategories } from "../Settings/Event/Events";
import { DenseFilledTextField } from "../../Common/StyledComponents";

export default function AuditCategorySelect({
  value,
  onChange,
  dense = false,
}: {
  value: number[];
  onChange: (value: number[]) => void;
  dense?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const Field = dense ? DenseFilledTextField : TextField;
  return (
    <Field
      select
      fullWidth
      size="small"
      label={dense ? undefined : t("audit.categories")}
      helperText={!dense && value.length === 0 ? t("audit.allCategories") : undefined}
      value={value}
      SelectProps={{
        multiple: true,
        displayEmpty: dense,
        inputProps: { "aria-label": t("audit.categories") },
        renderValue: (selected) =>
          dense && (selected as number[]).length === 0
            ? t("audit.allCategories")
            : (selected as number[]).map((id) => t(`settings.event.${getEventName(id)}`)).join(", "),
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
    </Field>
  );
}
