import { useMemo } from "react";
import { FilePermission, FileResponse, FileType, Metadata, NavigatorCapability } from "../../../api/explorer.ts";
import { canList, hasPermission } from "../../../util/permission";
import { GroupPermission } from "../../../api/user.ts";
import { ContextMenuTypes } from "../../../redux/fileManagerSlice.ts";
import { Viewers, ViewersByID } from "../../../redux/siteConfigSlice.ts";
import { ExpandedViewerSetting } from "../../../redux/thunks/viewer.ts";
import SessionManager from "../../../session";
import { fileExtension } from "../../../util";
import Boolset from "../../../util/boolset.ts";
import CrUri, { Filesystem } from "../../../util/uri.ts";
import { FileManagerIndex } from "../FileManager.tsx";

const supportedArchiveTypes = ["zip", "gz", "xz", "tar", "rar", "7z", "bz2"];

export const canManageVersion = (file: FileResponse, bs: Boolset) => {
  return (
    file.type == FileType.file &&
    (!file.metadata || !file.metadata[Metadata.share_redirect]) &&
    bs.enabled(NavigatorCapability.version_control)
  );
};

export const canShowInfo = (cap: Boolset) => {
  return cap.enabled(NavigatorCapability.info);
};

export const canUpdate = (opt: DisplayOption) => {
  return !!(
    opt.allUpdatable &&
    opt.hasFile &&
    opt.orCapability?.enabled(NavigatorCapability.upload_file) &&
    opt.allUpdatable
  );
};

export interface DisplayOption {
  hasDeletable?: boolean;
  allReadable: boolean;
  allUpdatable: boolean;

  hasReadable?: boolean;
  hasUpdatable?: boolean;

  hasTrashFile?: boolean;
  hasFile?: boolean;
  hasFolder?: boolean;
  hasOwned?: boolean;
  hasFailedThumb?: boolean;

  showEnter?: boolean;
  showOpen?: boolean;
  showOpenWithCascading?: () => boolean;
  showOpenWith?: () => boolean;
  showDownload?: boolean;
  showGoToSharedLink?: boolean;
  showExtractArchive?: boolean;
  showTorrentRemoteDownload?: boolean;
  showGoToParent?: boolean;

  showDelete?: boolean;
  showRestore?: boolean;
  showRename?: boolean;
  showPin?: boolean;
  showOrganize?: boolean;
  showCopy?: boolean;
  showShare?: boolean;
  showInfo?: boolean;
  showDirectLink?: boolean;

  showMove?: boolean;
  showTags?: boolean;
  showChangeFolderColor?: boolean;
  showChangeIcon?: boolean;
  showCustomProps?: boolean;

  showMore?: boolean;
  showVersionControl?: boolean;
  showDirectLinkManagement?: boolean;
  showManageShares?: boolean;
  showCreateArchive?: boolean;
  showResetThumb?: boolean;
  showBindPolicy?: boolean;
  showRelocate?: boolean;

  andCapability?: Boolset;
  orCapability?: Boolset;

  showCreateFolder?: boolean;
  showCreateFile?: boolean;
  showRefresh?: boolean;
  showNewFileFromTemplate?: boolean;
  showUpload?: boolean;
  showRemoteDownload?: boolean;
}

const capabilityMap: { [key: string]: Boolset } = {};

export const getActionOpt = (
  targets: FileResponse[],
  viewerSetting?: ExpandedViewerSetting,
  type?: string,
  parent?: FileResponse,
  fmIndex: number = 0,
): DisplayOption => {
  const currentUser = SessionManager.currentLoginOrNull();
  const currentUserAnonymous = SessionManager.currentUser();
  const groupBs = SessionManager.currentUserGroupPermission();
  const display: DisplayOption = {
    allReadable: true,
    allUpdatable: true,
  };
  if (type == ContextMenuTypes.empty || type == ContextMenuTypes.new) {
    display.showRefresh = type == ContextMenuTypes.empty;
    display.showRemoteDownload = groupBs.enabled(GroupPermission.remote_download) && !!currentUser;

    if (!parent || parent.type != FileType.folder) {
      display.showRemoteDownload = display.showRemoteDownload && type == ContextMenuTypes.new;
      return display;
    }

    const parentUri = parent.path ? new CrUri(parent.path) : undefined;
    display.showRelocate =
      type === ContextMenuTypes.empty &&
      fmIndex === FileManagerIndex.main &&
      !!currentUser &&
      groupBs.enabled(GroupPermission.relocate) &&
      parent.owned &&
      !!parent.capability &&
      new Boolset(parent.capability).enabled(NavigatorCapability.relocate) &&
      !parent.metadata?.[Metadata.share_redirect] &&
      !parent.metadata?.[Metadata.restore_uri] &&
      parentUri?.fs() === Filesystem.my &&
      parentUri.is_root() &&
      !parentUri.is_search() &&
      (!parentUri.id() || parentUri.id() === currentUser.user.id);
    const parentCap = new Boolset(parent.capability);
    const canCreate =
      parentCap.enabled(NavigatorCapability.create_file) && hasPermission(parent, FilePermission.create);
    display.showCreateFolder = canCreate && canList(parent);
    display.showCreateFile = display.showCreateFolder && fmIndex == FileManagerIndex.main;
    display.showUpload = canCreate && fmIndex === FileManagerIndex.main;
    if (display.showCreateFile) {
      const allViewers = Object.entries(ViewersByID);
      for (let i = 0; i < allViewers.length; i++) {
        if (allViewers[i][1] && allViewers[i][1].templates) {
          display.showNewFileFromTemplate = true;
          break;
        }
      }
    }

    return display;
  }

  if (type == ContextMenuTypes.searchResult) {
    display.showGoToParent = true;
  }

  targets.forEach((target) => {
    const readable = hasPermission(target, FilePermission.read);
    const updatable = hasPermission(target, FilePermission.update);
    display.hasDeletable ||= hasPermission(target, FilePermission.delete);

    if (display.allReadable && !readable) {
      display.allReadable = false;
    }
    if (display.allUpdatable && !updatable) {
      display.allUpdatable = false;
    }

    if (!display.hasReadable && readable) {
      display.hasReadable = true;
    }
    if (!display.hasUpdatable && updatable) {
      display.hasUpdatable = true;
    }

    if (target.metadata) {
      if (target.metadata[Metadata.restore_uri]) {
        display.hasTrashFile = true;
      }
      if (target.metadata[Metadata.thumbDisabled] !== undefined) {
        display.hasFailedThumb = true;
      }
    }

    if (target.type == FileType.file) {
      display.hasFile = true;
    }

    if (target.type == FileType.folder) {
      display.hasFolder = true;
    }

    if (target.owned) {
      display.hasOwned = true;
    }

    if (target.capability) {
      let bs = capabilityMap[target.capability];
      if (!bs) {
        bs = new Boolset(target.capability);
        capabilityMap[target.capability] = bs;
      }

      if (!display.andCapability) {
        display.andCapability = bs;
      }

      display.andCapability = display.andCapability.and(bs);

      if (!display.orCapability) {
        display.orCapability = bs;
      }
      display.orCapability = display.orCapability.or(bs);
    }
  });

  const firstFileSuffix = fileExtension(targets[0]?.name ?? "");
  display.showPin =
    !display.hasTrashFile && targets.length == 1 && display.hasFolder && !targets[0].id.startsWith("share:");
  display.showDelete =
    display.hasDeletable &&
    display.orCapability &&
    (display.orCapability.enabled(NavigatorCapability.soft_delete) ||
      display.orCapability.enabled(NavigatorCapability.delete_file));
  display.showRestore = display.andCapability?.enabled(NavigatorCapability.restore);
  display.showRename =
    targets.length == 1 &&
    display.allUpdatable &&
    display.orCapability &&
    display.orCapability.enabled(NavigatorCapability.rename_file);
  display.showCopy = display.hasReadable && !!display.orCapability;
  display.showShare =
    targets.length == 1 &&
    !!currentUser &&
    groupBs.enabled(GroupPermission.share) &&
    hasPermission(targets[0], FilePermission.share) &&
    display.orCapability &&
    display.orCapability.enabled(NavigatorCapability.share) &&
    (!targets[0].metadata ||
      (!targets[0].metadata[Metadata.share_redirect] && !targets[0].metadata[Metadata.restore_uri]));
  display.showMove = display.hasDeletable && !!display.orCapability;
  display.showTags =
    display.hasUpdatable && display.orCapability && display.orCapability.enabled(NavigatorCapability.update_metadata);
  display.showChangeFolderColor =
    display.hasUpdatable &&
    !display.hasFile &&
    display.orCapability &&
    display.orCapability.enabled(NavigatorCapability.update_metadata);
  display.showChangeIcon =
    display.hasUpdatable && display.orCapability && display.orCapability.enabled(NavigatorCapability.update_metadata);
  display.showCustomProps = display.showChangeIcon;
  display.showDownload =
    display.hasReadable && display.orCapability && display.orCapability.enabled(NavigatorCapability.download_file);
  display.showDirectLink =
    (display.hasOwned || groupBs.enabled(GroupPermission.is_admin)) &&
    display.orCapability &&
    (currentUserAnonymous?.group?.direct_link_batch_size ?? 0) >= targets.length &&
    display.orCapability.enabled(NavigatorCapability.download_file);
  display.showDirectLinkManagement = display.showDirectLink && targets.length == 1 && display.hasFile;
  display.showOpen =
    targets.length == 1 &&
    display.hasFile &&
    display.showDownload &&
    !!viewerSetting &&
    !!firstFileSuffix &&
    !!viewerSetting?.[firstFileSuffix];
  display.showEnter =
    targets.length == 1 &&
    display.hasFolder &&
    display.orCapability?.enabled(NavigatorCapability.enter_folder) &&
    targets.every(canList);
  display.showExtractArchive =
    targets.length == 1 &&
    display.hasFile &&
    display.showDownload &&
    !!currentUser &&
    groupBs.enabled(GroupPermission.archive_task) &&
    supportedArchiveTypes.includes(firstFileSuffix ?? "");
  display.showTorrentRemoteDownload =
    targets.length == 1 &&
    display.hasFile &&
    display.showDownload &&
    !!currentUser &&
    groupBs.enabled(GroupPermission.remote_download) &&
    firstFileSuffix == "torrent";

  display.showOpenWithCascading = () => false;
  display.showOpenWith = () => targets.length == 1 && !!display.hasFile && !!display.showDownload;
  if (display.showOpen) {
    display.showOpenWithCascading = () =>
      !!(display.showOpen && viewerSetting && viewerSetting[firstFileSuffix ?? ""]?.length >= 1);
    display.showOpenWith = () =>
      !!(display.showOpen && viewerSetting && viewerSetting[firstFileSuffix ?? ""]?.length < 1);
  }
  display.showOrganize = display.showPin || display.showMove || display.showChangeFolderColor || display.showChangeIcon;
  display.showGoToSharedLink =
    targets.length == 1 &&
    (display.hasFile || targets[0].id.startsWith("share:")) &&
    targets[0].metadata &&
    !!targets[0].metadata[Metadata.share_redirect];
  display.showInfo = targets.length == 1 && display.orCapability && canShowInfo(display.orCapability);
  display.showRelocate =
    targets.length > 0 &&
    !!currentUser &&
    groupBs.enabled(GroupPermission.relocate) &&
    targets.every(
      (file) =>
        file.owned &&
        (file.type === FileType.file || file.type === FileType.folder) &&
        !!file.path &&
        !file.metadata?.[Metadata.share_redirect] &&
        !file.metadata?.[Metadata.restore_uri] &&
        new CrUri(file.path).fs() === Filesystem.my &&
        !!file.capability &&
        new Boolset(file.capability).enabled(NavigatorCapability.relocate),
    );
  display.showBindPolicy =
    targets.length === 1 &&
    !!currentUser &&
    targets[0].owned &&
    targets[0].type === FileType.folder &&
    !!targets[0].path &&
    !targets[0].metadata?.[Metadata.share_redirect] &&
    new CrUri(targets[0].path).fs() === Filesystem.my &&
    !new CrUri(targets[0].path).is_root() &&
    display.orCapability?.enabled(NavigatorCapability.bind_policy);
  display.showVersionControl =
    targets.length == 1 &&
    display.orCapability &&
    display.hasReadable &&
    canManageVersion(targets[0], display.orCapability);
  display.showManageShares =
    targets.length == 1 &&
    targets[0].shared &&
    display.orCapability &&
    !!currentUser &&
    groupBs.enabled(GroupPermission.share) &&
    display.orCapability.enabled(NavigatorCapability.share);
  display.showCreateArchive =
    display.hasReadable &&
    !!currentUser &&
    groupBs.enabled(GroupPermission.archive_task) &&
    display.orCapability &&
    display.orCapability.enabled(NavigatorCapability.download_file);
  display.showResetThumb =
    display.hasFile &&
    !display.hasFolder &&
    display.hasFailedThumb &&
    display.allUpdatable &&
    display.orCapability &&
    display.orCapability.enabled(NavigatorCapability.update_metadata);

  display.showMore =
    display.showVersionControl ||
    display.showManageShares ||
    display.showCreateArchive ||
    display.showDirectLinkManagement ||
    display.showResetThumb;
  return display;
};

const useActionDisplayOpt = (targets: FileResponse[], type?: string, parent?: FileResponse, fmIndex: number = 0) => {
  const permission = SessionManager.currentUserGroup()?.permission;
  const opt = useMemo(() => {
    return getActionOpt(targets, Viewers, type, parent, fmIndex);
  }, [targets, type, parent, fmIndex, permission]);

  return opt;
};

export default useActionDisplayOpt;
