import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture } from "./component-fixture.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  let actor = "one";
  const requests = [],
    state = {
      globalState: {},
      fileManager: [{ pure_path: "cloudreve://my/", list: { parent: {}, storage_policy: { id: "old" } } }],
    };
  const dispatch = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  class Manager {
    resumeTasks() {
      return [];
    }
    setPolicy() {}
    destroy() {}
  }
  class Uri {
    fs() {
      return "my";
    }
  }
  const f = componentFixture(
    "src/component/Uploader/Uploader.tsx",
    {},
    {
      dayjs: { __esModule: true, default() {} },
      "../../api/api.ts": { getAvailableStoragePolicies: () => ({}) },
      "../../util/uri": { __esModule: true, default: Uri, Filesystem: { share: "share" } },
      notistack: { useSnackbar: () => ({ enqueueSnackbar() {} }) },
      "../../redux/fileManagerSlice.ts": { ContextMenuTypes: { empty: 0 } },
      "../../redux/globalStateSlice.ts": {},
      "../../redux/hooks.ts": { useAppDispatch: () => dispatch, useAppSelector: (select) => select(state) },
      "../../redux/thunks/filemanager.ts": {},
      "../../session": {
        __esModule: true,
        default: { currentLoginOrNull: () => ({ user: { id: actor } }), getWithFallback: () => "1" },
        UserSettings: {},
      },
      "../FileManager/ContextMenu/useActionDisplayOpt.ts": { __esModule: true, default: () => ({ showUpload: true }) },
      "../FileManager/FileManager.tsx": { FileManagerIndex: { main: 0 } },
      "./core": { __esModule: true, default: Manager, SelectType: { File: 0, Directory: 1 } },
      "./core/errors": { UploaderError: Error },
      "./core/uploader/base.ts": { Status: {} },
      "./DropFile.tsx": { DropFileBackground: "DropFileBackground" },
      "../Dialogs/DraggableDialog.tsx": { __esModule: true, default: "DraggableDialog" },
      "./PasteUploadDialog.tsx": { __esModule: true, default: "PasteUploadDialog" },
      "./Popup/TaskList.tsx": { __esModule: true, default: "TaskList" },
    },
    { document: { querySelector() {} }, setInterval: () => 1, setTimeout },
  );
  return {
    ...f,
    requests,
    open() {
      state.globalState.uploadFileSignal = (state.globalState.uploadFileSignal ?? 0) + 1;
      f.render();
      f.render();
    },
    actor(value) {
      actor = value;
      f.render();
    },
    options: () => f.findAll((node) => node.type === "MenuItem").map((node) => node.props.value),
  };
}

test("opening upload selection refreshes changed grants for the same account", async () => {
  const f = fixture();
  f.requests.shift().resolve([{ id: "old", name: "old" }]);
  await tick();
  f.render();
  f.open();
  assert.equal(f.requests.length, 1);
  f.requests.shift().resolve([{ id: "new", name: "new" }]);
  await tick();
  f.render();
  assert.deepEqual(f.options(), ["", "new"]);
});

test("failed policy loads have a retry and old-account responses cannot replace its result", async () => {
  const f = fixture();
  f.requests.shift().reject(Error("temporary database outage"));
  await tick();
  f.render();
  const retry = f.find((node) => node.type === "Button" && node.props.children === "uploader.retryPolicies");
  assert.ok(retry);
  retry.props.onClick();
  const old = f.requests.shift();
  f.actor("two");
  const current = f.requests.shift();
  current.resolve([{ id: "two-policy" }]);
  await tick();
  old.resolve([{ id: "one-policy" }]);
  await tick();
  f.render();
  assert.deepEqual(f.options(), ["", "two-policy"]);
});
