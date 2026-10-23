import React from "react";
import { Accordion, styled } from "@mui/material";
import MuiAccordionSummary, { AccordionSummaryProps } from "@mui/material/AccordionSummary";

export const AccordionSummary = styled((props: AccordionSummaryProps) => <MuiAccordionSummary {...props} />)(
  ({ theme }) => ({
    fontSize: theme.typography.body2.fontSize,
    paddingLeft: theme.spacing(4),
    "& .MuiFormControlLabel-label": {
      fontSize: theme.typography.body2.fontSize,
    },
    "& .MuiCheckbox-root": {
      marginRight: theme.spacing(2),
    },
  }),
);

export const StyledAccordion = styled(Accordion)(({ theme }) => ({
  boxShadow: "none",
  border: `1px solid ${theme.palette.divider}`,
  "&::before": {
    display: "none",
  },
}));
