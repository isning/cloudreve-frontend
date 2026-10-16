import { Box, Collapse } from "@mui/material";
import { RadiusFrame } from "../../Frame/RadiusFrame.tsx";
import SidebarContent from "./SidebarContent.tsx";
import useSidebarDetails from "./useSidebarDetails.ts";

export interface SideBarProps {
  inPhotoViewer?: boolean;
}

const Sidebar = ({ inPhotoViewer }: SideBarProps) => {
  const { sidebarOpen, target, setTarget, validating } = useSidebarDetails();

  return (
    <Box
      sx={
        inPhotoViewer
          ? {
              position: "absolute",
              height: "100%",
              right: 0,
              top: 0,
            }
          : {}
      }
    >
      <Collapse
        in={sidebarOpen}
        sx={{ height: "100%" }}
        orientation={"horizontal"}
        unmountOnExit
        timeout={inPhotoViewer ? 0 : "auto"}
      >
        <RadiusFrame
          sx={{
            width: "300px",
            height: "100%",
            ml: 1,
            borderRadius: (theme) => (inPhotoViewer ? 0 : theme.shape.borderRadius / 8),
          }}
          withBorder={!inPhotoViewer}
        >
          <SidebarContent inPhotoViewer={inPhotoViewer} target={target} setTarget={setTarget} validating={validating} />
        </RadiusFrame>
      </Collapse>
    </Box>
  );
};

export default Sidebar;
