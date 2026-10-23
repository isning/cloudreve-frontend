import dayjs from "dayjs";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { getAvailableStoragePolicies } from "../../api/api.ts";
import { StoragePolicy } from "../../api/explorer.ts";
import CrUri, { Filesystem } from "../../util/uri";
import { useSnackbar } from "notistack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenuTypes } from "../../redux/fileManagerSlice.ts";
import {
  closeUploadTaskList,
  openUploadTaskList,
  setUploadProgress,
  setUploadRawFiles,
} from "../../redux/globalStateSlice.ts";
import { useAppDispatch, useAppSelector } from "../../redux/hooks.ts";
import { refreshFileList, updateUserCapacity } from "../../redux/thunks/filemanager.ts";
import SessionManager, { UserSettings } from "../../session";
import useActionDisplayOpt from "../FileManager/ContextMenu/useActionDisplayOpt.ts";
import { FileManagerIndex } from "../FileManager/FileManager.tsx";
import UploadManager, { SelectType } from "./core";
import { UploaderError } from "./core/errors";
import Base, { Status } from "./core/uploader/base.ts";
import { DropFileBackground } from "./DropFile.tsx";
import PasteUploadDialog from "./PasteUploadDialog.tsx";
import TaskList from "./Popup/TaskList.tsx";

let totalProgressCollector: NodeJS.Timeout | null = null;
let lastProgressStart = -1;
let dragCounter = 0;

const defaultClipboardImageName = "image.png";

const Uploader = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const [uploaders, setUploaders] = useState<Base[]>([]);
  const [dropBgOpen, setDropBgOpen] = useState(false);
  const ownerID = SessionManager.currentLoginOrNull()?.user.id ?? "";
  const [destinations, setDestinations] = useState<{ owner: string; policies: StoragePolicy[] }>({
    owner: "",
    policies: [],
  });
  const [choice, setChoice] = useState<{ owner: string; id: string }>({ owner: "", id: "" });
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [policyLoadFailed, setPolicyLoadFailed] = useState(false);
  const policyRequest = useRef(0);
  const [selection, setSelection] = useState<{ path: string; type: SelectType }>();

  const uploadEnabled = useRef<boolean>(false);

  const totalProgress = useAppSelector((state) => state.globalState.uploadProgress);
  const taskListOpen = useAppSelector((state) => state.globalState.uploadTaskListOpen);
  const parent = useAppSelector((state) => state.fileManager[FileManagerIndex.main].list?.parent);
  const path = useAppSelector((state) => state.fileManager[FileManagerIndex.main].pure_path);
  const policy = useAppSelector((state) => state.fileManager[FileManagerIndex.main].list?.storage_policy);
  const sharedDestination = !!path && new CrUri(path).fs() === Filesystem.share;
  const policies = sharedDestination
    ? policy
      ? [policy]
      : []
    : destinations.owner === ownerID
      ? destinations.policies
      : [];
  const choiceID =
    !sharedDestination && choice.owner === ownerID && policies.some((p) => p.id === choice.id) ? choice.id : "";
  const automaticDestination = policies.find((p) => p.id === policy?.id) ?? policies[0];
  const selectFileSignal = useAppSelector((state) => state.globalState.uploadFileSignal);
  const selectFolderSignal = useAppSelector((state) => state.globalState.uploadFolderSignal);
  const uploadRawPromiseId = useAppSelector((state) => state.globalState.uploadRawPromiseId);
  const uploadRawFiles = useAppSelector((state) => state.globalState.uploadRawFiles);

  const displayOpt = useActionDisplayOpt([], ContextMenuTypes.empty, parent, FileManagerIndex.main);
  const exclidrawOpen = useAppSelector((state) => state.globalState.excalidrawViewer?.open);

  useEffect(() => {
    if (!parent || exclidrawOpen) {
      uploadEnabled.current = false;
      return;
    }
    uploadEnabled.current = displayOpt.showUpload ?? false;
  }, [parent, displayOpt.showUpload, exclidrawOpen]);

  const taskAdded = useCallback(
    (original?: Base) => (tasks: Base[]) => {
      if (original !== undefined) {
        if (tasks.length !== 1 || tasks[0].key() !== original.key()) {
          enqueueSnackbar(t("uploader.fileNotMatchError"), {
            variant: "warning",
          });
          return;
        }
      }

      tasks.forEach((t) => t.start());

      dispatch(openUploadTaskList());
      setUploaders((uploaders) => {
        if (original !== undefined) {
          uploaders = uploaders.filter((u) => u.key() !== original.key());
        }

        return [...uploaders, ...tasks];
      });
    },
    [enqueueSnackbar, dispatch, setUploaders],
  );

  const uploadManager = useMemo(() => {
    return new UploadManager({
      logLevel: "INFO",
      concurrentLimit: parseInt(SessionManager.getWithFallback(UserSettings.ConcurrentLimit)),
      overwrite: SessionManager.getWithFallback(UserSettings.UploadOverwrite),
      dropZone: document.querySelector("body"),
      onToast: (type, msg) => {
        enqueueSnackbar(msg, { variant: type });
      },
      onDropOver: (_e) => {
        if (!uploadEnabled.current) {
          return;
        }
        dragCounter++;
        setDropBgOpen((value) => !value);
      },
      onDropLeave: (_e) => {
        if (!uploadEnabled.current) {
          return false;
        }
        dragCounter--;
        setDropBgOpen((value) => !value);
        return true;
      },
      onProactiveFileAdded: taskAdded(),
      onPoolEmpty: () => {
        setTimeout(() => {
          dispatch(refreshFileList(0));
          if (SessionManager.currentLoginOrNull()) dispatch(updateUserCapacity(0));
        }, 1000);
      },
    });
  }, [enqueueSnackbar, taskAdded, dispatch]);

  const loadPolicies = useCallback(() => {
    const request = ++policyRequest.current;
    const isCurrent = () =>
      request === policyRequest.current && (SessionManager.currentLoginOrNull()?.user.id ?? "") === ownerID;
    setLoadingPolicies(true);
    setPolicyLoadFailed(false);
    if (!ownerID || sharedDestination) {
      setDestinations({ owner: ownerID, policies: [] });
      setLoadingPolicies(false);
      return;
    }
    dispatch(getAvailableStoragePolicies())
      .then((available) => {
        if (isCurrent()) setDestinations({ owner: ownerID, policies: available });
      })
      .catch(() => {
        if (isCurrent()) {
          setDestinations({ owner: ownerID, policies: [] });
          setPolicyLoadFailed(true);
        }
      })
      .finally(() => {
        if (isCurrent()) setLoadingPolicies(false);
      });
  }, [ownerID, sharedDestination, dispatch]);

  useEffect(() => {
    setChoice({ owner: ownerID, id: "" });
    setSelection(undefined);
    loadPolicies();
    return () => {
      ++policyRequest.current;
    };
  }, [loadPolicies]);

  useEffect(() => {
    uploadManager.setPolicy(
      policies.length ? policies.find((p) => p.id === choiceID) ?? automaticDestination : undefined,
      path,
      !choiceID,
    );
  }, [policy, path, destinations, choiceID, ownerID, uploadManager]);

  const handleUploaderError = useCallback(
    (e: any) => {
      if (e instanceof UploaderError) {
        enqueueSnackbar(e.Message(), { variant: "warning" });
      } else {
        enqueueSnackbar(t("uploader:unknownError", { msg: e.message }), {
          variant: "error",
        });
      }
    },
    [enqueueSnackbar, t],
  );

  const selectFile = useCallback(
    (path: string, type = SelectType.File, original?: Base) => {
      if (!original) {
        loadPolicies();
        setSelection({ path, type });
        return;
      }
      dispatch(openUploadTaskList());

      const actor = SessionManager.currentLoginOrNull()?.user.id;
      uploadManager
        .select(path, type, original.task)
        .then((tasks) => {
          if (SessionManager.currentLoginOrNull()?.user.id === actor) taskAdded(original)(tasks);
        })
        .catch((e) => {
          handleUploaderError(e);
        });
    },
    [uploadManager, taskAdded, handleUploaderError, dispatch, loadPolicies],
  );

  const confirmSelection = () => {
    if (!selection || !policies.length) return;
    uploadManager.setPolicy(policies.find((p) => p.id === choiceID) ?? automaticDestination, selection.path, !choiceID);
    uploadManager.select(selection.path, selection.type).then(taskAdded()).catch(handleUploaderError);
    setSelection(undefined);
  };

  const getClipboardFileName = useCallback(
    (f: File) => {
      if (f.type.startsWith("image") && f.name == defaultClipboardImageName) {
        return t("uploader.clipboardDefaultFileName", {
          date: dayjs().valueOf(),
        });
      }
      return f.name;
    },
    [t],
  );

  const addRawFiles = useCallback(
    (files: File[]) => {
      uploadManager.addRawFiles(files, getClipboardFileName).catch((e) => {
        handleUploaderError(e);
      });
    },
    [uploadManager, taskAdded, handleUploaderError, dispatch, getClipboardFileName],
  );

  useEffect(() => {
    if (uploadRawFiles && uploadRawFiles.length > 0) {
      uploadManager.addRawFiles(uploadRawFiles, getClipboardFileName, uploadRawPromiseId).catch((e) => {
        handleUploaderError(e);
      });
      dispatch(setUploadRawFiles({ files: [], promiseId: [] }));
    }
  }, [uploadRawFiles, uploadRawPromiseId, handleUploaderError, uploadManager]);

  useEffect(() => {
    const unfinished = uploadManager.resumeTasks();
    setUploaders((uploaders) => [
      ...uploaders,
      ...unfinished.filter((u) => uploaders.find((v) => v.key() === u.key()) === undefined),
    ]);
    if (!totalProgressCollector) {
      totalProgressCollector = setInterval(() => {
        let totalSize = 0;
        let processedSize = 0;
        let total = 0;
        let processed = 0;

        setUploaders((uploaders) => {
          uploaders.forEach((u) => {
            if (u.id <= lastProgressStart) {
              return;
            }

            totalSize += u.task.size;
            total += 1;

            if (u.status === Status.finished || u.status === Status.canceled || u.status === Status.error) {
              processedSize += u.task.size;
              processed += 1;
            }

            if (
              u.status === Status.added ||
              u.status === Status.initialized ||
              u.status === Status.queued ||
              u.status === Status.preparing ||
              u.status === Status.processing ||
              u.status === Status.finishing
            ) {
              processedSize += u.progress ? u.progress.total.loaded : 0;
            }
          });

          if (total > 0 && processed === total) {
            lastProgressStart = uploaders[uploaders.length - 1].id;
          }
          return uploaders;
        });

        dispatch(
          setUploadProgress({
            progress: {
              totalSize,
              processedSize,
            },
            count: total,
          }),
        );
      }, 2000);
    }

    return () => {
      if (uploadManager) {
        uploadManager.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (selectFileSignal && selectFileSignal > 0 && path) {
      selectFile(path);
    }
  }, [selectFileSignal]);

  useEffect(() => {
    if (selectFolderSignal && selectFolderSignal > 0 && path) {
      selectFile(path, SelectType.Directory);
    }
  }, [selectFolderSignal]);

  const deleteTask = useCallback((filter: (b: Base) => boolean) => {
    setUploaders((uploaders) => uploaders.filter(filter));
  }, []);

  return (
    <>
      <Dialog open={!!selection} onClose={() => setSelection(undefined)} fullWidth maxWidth="xs">
        <DialogTitle>
          {t(selection?.type === SelectType.Directory ? "fileManager.uploadFolder" : "fileManager.uploadFiles")}
        </DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            margin="dense"
            label={t("uploader.storagePolicy")}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            helperText={
              !choiceID && automaticDestination
                ? t("uploader.automaticPolicyDestination", { name: automaticDestination.name })
                : undefined
            }
            value={choiceID}
            disabled={sharedDestination || loadingPolicies || !policies.length}
            onChange={(event) => setChoice({ owner: ownerID, id: event.target.value })}
          >
            <MenuItem value="">{t("uploader.automaticPolicy")}</MenuItem>
            {policies.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          {!loadingPolicies && !policies.length && (
            <Typography color="error" variant="body2">
              {t("uploader.noAvailablePolicies")}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelection(undefined)}>{t("cancel", { ns: "common" })}</Button>
          {policyLoadFailed && <Button onClick={loadPolicies}>{t("uploader.retryPolicies")}</Button>}
          <Button disabled={loadingPolicies || !policies.length} onClick={confirmSelection}>
            {t("uploader.chooseFiles")}
          </Button>
        </DialogActions>
      </Dialog>
      <PasteUploadDialog onFilePasted={addRawFiles} />
      <DropFileBackground open={dropBgOpen} />
      <TaskList
        progress={totalProgress}
        uploadManager={uploadManager}
        taskList={uploaders}
        open={!!taskListOpen}
        onCancel={deleteTask}
        selectFile={selectFile}
        onClose={() => dispatch(closeUploadTaskList())}
        setUploaders={setUploaders}
      />
    </>
  );
};

export default Uploader;
