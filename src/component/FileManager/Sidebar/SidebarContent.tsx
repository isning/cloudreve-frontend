import React from "react";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { setSidebarTab } from "../../../redux/globalStateSlice";
import Activities from "./Activities";
import { Box, Tabs, Tab } from "@mui/material";
import { useTranslation } from "react-i18next";
import { FileResponse } from "../../../api/explorer.ts";
import useActionDisplayOpt from "../ContextMenu/useActionDisplayOpt.ts";
import Details from "./Details.tsx";
import Header from "./Header.tsx";
import SessionManager from "../../../session";

export interface SidebarContentProps {
  target: FileResponse | undefined | null;
  inPhotoViewer?: boolean;
  validating?: boolean;
  setTarget: (target: FileResponse | undefined | null) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={index === 0 ? "file-details-panel" : "file-activity-panel"}
      aria-labelledby={index === 0 ? "file-details-tab" : "file-activity-tab"}
      {...other}
    >
      {value === index && <Box sx={{ px: 2, py: 1 }}>{children}</Box>}
    </div>
  );
}

const SidebarContent = ({ target, inPhotoViewer, setTarget, validating = false }: SidebarContentProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const tab = useAppSelector((state) => state.globalState.sidebarTab) === "activity" ? 1 : 0;
  const targetDisplayOptions = useActionDisplayOpt(target && !validating ? [target] : []);
  const canViewActivities =
    !!SessionManager.currentLoginOrNull() && targetDisplayOptions.showInfo && targetDisplayOptions.allUpdatable;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header target={target} />
      {target != null && (
        <>
          <Box
            sx={{
              width: "100%",
              bgcolor: "background.paper",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Tabs
              value={canViewActivities ? tab : 0}
              onChange={(_, value) => dispatch(setSidebarTab(value === 1 ? "activity" : "details"))}
              variant="fullWidth"
            >
              <Tab
                label={t("application:fileManager.viewDetails")}
                id="file-details-tab"
                aria-controls="file-details-panel"
              />
              {canViewActivities && (
                <Tab
                  label={t("application:fileManager.activity")}
                  id="file-activity-tab"
                  aria-controls="file-activity-panel"
                />
              )}
            </Tabs>
          </Box>
          <Box sx={{ overflow: "auto" }}>
            <TabPanel value={canViewActivities ? tab : 0} index={0}>
              <Details
                inPhotoViewer={inPhotoViewer}
                target={target}
                setTarget={setTarget}
                targetDisplayOptions={targetDisplayOptions}
                validating={validating}
              />
            </TabPanel>
            {canViewActivities && (
              <TabPanel value={tab} index={1}>
                <Activities key={target.id} target={target} />
              </TabPanel>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

export default SidebarContent;
