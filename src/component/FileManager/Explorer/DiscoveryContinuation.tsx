import { Button, Stack, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch } from "../../../redux/hooks";
import { loadMorePages } from "../../../redux/thunks/filemanager";

// An empty candidate page is not an empty directory while a cursor remains.
export default function DiscoveryContinuation({ index, token }: { index: number; token: string }) {
  const { t } = useTranslation("application");
  const dispatch = useAppDispatch();
  const seen = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (busy) return;
    seen.current.add(token);
    setBusy(true);
    try {
      await dispatch(loadMorePages(index));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!busy && seen.current.size < 4 && !seen.current.has(token)) void load();
  }, [token, busy]);
  return (
    <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", p: 3 }}>
      <Typography role="status" color="text.secondary">
        {t(busy ? "fileManager.findingShares" : "fileManager.moreSharesAvailable")}
      </Typography>
      <Button disabled={busy} onClick={() => void load()}>
        {t("fileManager.continueFindingShares")}
      </Button>
    </Stack>
  );
}
