import {
  Alert,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { TaskResponse, TaskStatus, TaskType } from "../../../api/workflow.ts";
import { sizeToString } from "../../../util";
import { StyledTableContainerPaper } from "../../Common/StyledComponents.tsx";
import DownloadFileList from "./DownloadFileList.tsx";
import TaskProgress from "./TaskProgress.tsx";
import TaskProps from "./TaskProps.tsx";

export interface TaskDetailProps {
  task: TaskResponse;
  downloading?: boolean;
}

const TaskDetail = ({ task, downloading }: TaskDetailProps) => {
  const { t } = useTranslation();
  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        {task.summary?.props?.download && (
          <>
            <Typography variant={"subtitle1"} fontWeight={600}>
              {t("setting.fileList")}
            </Typography>
            <DownloadFileList downloading={downloading} taskId={task.id} summary={task.summary} />
            <Divider />
          </>
        )}
        <Typography variant={"subtitle1"} fontWeight={600}>
          {t("setting.taskProgress")}
        </Typography>
        {!!task.summary?.props?.failed && (
          <Alert severity={"warning"}>
            {t("setting.partialSuccessWarning", {
              num: task.summary?.props?.failed,
            })}
          </Alert>
        )}
        {task.type === TaskType.relocate && task.summary?.props.entities_total !== undefined && (
          <Stack spacing={0.5}>
            <Typography variant="body2">
              {t("setting.relocatedEntities")}: {task.summary.props.entities_completed ?? 0} /{" "}
              {task.summary.props.entities_total}
            </Typography>
            <Typography variant="body2">
              {t("setting.relocatedBytes")}: {sizeToString(task.summary.props.bytes_copied ?? 0)} /{" "}
              {sizeToString(task.summary.props.bytes_total ?? 0)}
            </Typography>
            {!!task.summary.props.entities_failed && (
              <Alert severity="warning">
                {t("setting.migrationPartialFailure", {
                  completed: task.summary.props.entities_completed ?? 0,
                  failed: task.summary.props.entities_failed,
                })}
              </Alert>
            )}
          </Stack>
        )}
        {task.status == TaskStatus.error && <Alert severity={"error"}>{task.error}</Alert>}
        <TaskProgress
          taskId={task.id}
          taskStatus={task.status}
          taskType={task.type}
          summary={task.summary}
          node={task.node}
        />
        <Divider />
      </Stack>
      <Stack spacing={1}>
        <Typography variant={"subtitle1"} fontWeight={600}>
          {t("setting.taskDetails")}
        </Typography>
        <TaskProps task={task} />
        {task.error_history && <Divider sx={{ pt: 2 }} />}
      </Stack>
      {task.error_history && (
        <Stack spacing={1}>
          <Typography variant={"subtitle1"} fontWeight={600}>
            {t("setting.retryErrorHistory")}
          </Typography>
          <TableContainer component={StyledTableContainerPaper} sx={{ maxHeight: 300 }}>
            <Table sx={{ width: "100%" }} size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>{t("common:error")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {task.error_history.map((error, index) => (
                  <TableRow hover key={index} sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                    <TableCell component="th" scope="row">
                      {index + 1}
                    </TableCell>
                    <TableCell>{error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </Stack>
  );
};

export default TaskDetail;
