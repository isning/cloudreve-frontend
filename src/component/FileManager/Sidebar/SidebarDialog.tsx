import { Dialog, Slide } from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import { forwardRef } from "react";
import { closeSidebar } from "../../../redux/globalStateSlice.ts";
import { useAppDispatch } from "../../../redux/hooks.ts";
import type { SideBarProps } from "./Sidebar.tsx";
import SidebarContent from "./SidebarContent.tsx";
import useSidebarDetails from "./useSidebarDetails.ts";

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement<unknown>;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const SidebarDialog = ({ inPhotoViewer }: SideBarProps) => {
  const dispatch = useAppDispatch();
  const { sidebarOpen, target, setTarget, validating } = useSidebarDetails();

  return (
    <Dialog
      fullScreen
      TransitionComponent={Transition}
      open={!!sidebarOpen}
      onClose={() => {
        dispatch(closeSidebar());
      }}
    >
      <SidebarContent inPhotoViewer={inPhotoViewer} target={target} setTarget={setTarget} validating={validating} />
    </Dialog>
  );
};

export default SidebarDialog;
