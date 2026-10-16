import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("..", import.meta.url));
const resolveModule = createRequire(path.join(frontend, "package.json"));
const ts = resolveModule("typescript");
const Code = {
  PermissionDenied: 403,
  NodeFound: 404,
  Conflict: 409,
  ParentNotExist: 40016,
  GroupNotAllowed: 40007,
  OwnerOnly: 40082,
};
class AppError extends Error {
  constructor(code) {
    super("Revoked");
    this.code = code;
  }
  ErrorResponse() {
    return { code: this.code, msg: this.message };
  }
}
const original = {
  id: "private",
  path: "cloudreve://share/link/private.txt",
  name: "private.txt",
  type: 0,
  permission: "Pw==",
  capability: "//////////8=",
  metadata: { "props:note": "value" },
  extended_info: { entities: [] },
};
const parent = { id: "root", path: "cloudreve://share/link", name: "root", type: 1, permission: "IQ==" };
const listing = (files) => ({ parent, files, pagination: { page: 0, page_size: 20, total_items: files.length } });
// Execute the real Sidebar, action projection, Redux reducer and navigation.
// Only React rendering, HTTP and unrelated visual boundaries are controlled.
function fixture(propertyType = "text", variant = "desktop", thumbnailFailure = false) {
  let state;
  let actor = "viewer";
  const infoRequests = [];
  let thumbnailRequests = 0;
  let hooks;
  let cursor;
  let effects;
  const componentHooks = new Map();
  function render(component, props = {}) {
    hooks = componentHooks.get(component) ?? [];
    componentHooks.set(component, hooks);
    cursor = 0;
    effects = [];
    const result = component(props);
    for (const effect of effects) effect();
    return result;
  }
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    forwardRef: (component) => component,
    useRef(value) {
      const index = cursor++;
      hooks[index] ??= { current: value };
      return hooks[index];
    },
    useState(value) {
      const index = cursor++;
      const values = hooks;
      if (!values[index])
        values[index] = {
          value,
          set: (next) => {
            values[index].value = typeof next === "function" ? next(values[index].value) : next;
          },
        };
      return [values[index].value, values[index].set];
    },
    useMemo(create, deps) {
      const index = cursor++;
      if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { deps, value: create() };
      return hooks[index].value;
    },
    useCallback(create, deps) {
      return react.useMemo(() => create, deps);
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!hooks[index] || !same(hooks[index].deps, deps)) {
        hooks[index]?.cleanup?.();
        const entry = (hooks[index] = { deps });
        effects.push(() => (entry.cleanup = effect()));
      }
    },
  };
  const session = {
    currentLoginOrNull: () => ({ user: { id: actor } }),
    getWithFallback: () => 20,
    currentUser: () => ({ group: {} }),
    currentUserGroup: () => ({}),
    currentUserGroupPermission: () => ({ enabled: () => false }),
  };
  let requestReady = false;
  const requestModule = {
    get Code() {
      // Request imports the router, which imports FilePermissions before its constants initialize.
      assert.ok(requestReady, "a component must not eagerly read request codes during module initialization");
      return Code;
    },
    AppError,
  };
  let nextListing;
  const mutations = [];
  const refreshRequests = [];
  let permissionError;
  const flush = () => new Promise(setImmediate);
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} };
    cache.set(filename, module.exports);
    const compiled = ts.transpileModule(readFileSync(path.join(frontend, filename), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    vm.runInNewContext(
      compiled,
      {
        module,
        exports: module.exports,
        URL,
        atob,
        btoa,
        console: { ...console, warn: () => {} },
        navigator: { platform: "Linux" },
        window: { matchMedia: () => ({ matches: false }) },
        require(id) {
          if (id === "react") return react;
          if (id === "react/jsx-runtime")
            return {
              jsx: (type, props) => ({ type, props }),
              jsxs: (type, props) => ({ type, props }),
              Fragment: "Fragment",
            };
          if (id === "@mui/material") return new Proxy({}, { get: (_, key) => String(key) });
          if (id === "react-i18next") return { useTranslation: () => ({ t: (key) => key }) };
          if (id === "react-transition-group") return { TransitionGroup: "TransitionGroup" };
          if (["dayjs", "path-browserify", "@reduxjs/toolkit"].includes(id)) return resolveModule(id);
          if (id.endsWith("/session")) return { __esModule: true, default: session, UserSettings: {} };
          if (id.endsWith("/hooks.ts") || id.endsWith("/hooks"))
            return { useAppDispatch: () => dispatch, useAppSelector: (select) => select(state) };
          if (id.endsWith("/request.ts")) return requestModule;
          if (id.endsWith("/explorer.ts") || id.endsWith("/explorer")) return load("src/api/explorer.ts");
          if (id.endsWith("/uri.ts") || id.endsWith("/uri")) return load("src/util/uri.ts");
          if (id.endsWith("/boolset.ts") || id.endsWith("/boolset")) return load("src/util/boolset.ts");
          if (id === "./request")
            return {
              defaultOpts: {},
              send: (_endpoint, config) => async () => {
                mutations.push({ ...config.data, ...(config.method === "DELETE" ? { clear: true } : {}) });
                if (permissionError) {
                  const error = permissionError;
                  permissionError = undefined;
                  throw error;
                }
              },
            };
          if (id.endsWith("/api/permission")) return load("src/api/permission.ts");
          if (id.endsWith("/permission")) return load("src/util/permission.ts");
          if (id.endsWith("/FileManager.tsx")) return { FileManagerIndex: { main: 0, selector: 1 } };
          if (id.endsWith("/user.ts")) return { GroupPermission: {} };
          if (id.endsWith("/globalStateSlice.ts") || id.endsWith("/globalStateSlice"))
            return {
              closeSidebar: () => ({ type: "sidebar", payload: { open: false } }),
              setSidebar: (payload) => ({ type: "sidebar", payload }),
              setFilePermissionDialog: (payload) => ({ type: "permission-dialog", payload }),
            };
          if (id.endsWith("/fileManagerSlice.ts")) return load("src/redux/fileManagerSlice.ts");
          if (id.endsWith("/filemanager")) return { refreshFileList: () => ({ type: "refresh-request" }) };
          if (id.endsWith("/file.ts"))
            return thumbnailFailure ? load("src/redux/thunks/file.ts") : { loadFileThumb: () => async () => null };
          if (id.endsWith("/api.ts") || id.endsWith("/api/api"))
            return {
              getFileThumb: () => async () => {
                ++thumbnailRequests;
                throw new Error("thumbnail unavailable");
              },
              getFileList: () => () => Promise.resolve(nextListing),
              getFileInfo: (request) => () =>
                new Promise((resolve, reject) => infoRequests.push({ request, resolve, reject })),
              sendMetadataPatch: (request) => () => {
                mutations.push(request);
                return Promise.resolve();
              },
            };
          if (id.endsWith("/ViewOptionPopover.tsx")) return { MinPageSize: 20 };
          if (id.endsWith("/PaginationFooter.tsx")) return { getPaginationState: () => ({ moreItems: false }) };
          if (id.endsWith("/useActionDisplayOpt.ts"))
            return load("src/component/FileManager/ContextMenu/useActionDisplayOpt.ts");
          if (id.endsWith("/useSidebarDetails.ts"))
            return load("src/component/FileManager/Sidebar/useSidebarDetails.ts");
          if (id.endsWith("/SidebarContent.tsx")) return { __esModule: true, default: "SidebarContent" };
          if (id.endsWith("/Details.tsx")) return { __esModule: true, default: "Details" };
          if (id.endsWith("/Dialogs/FilePermissions")) return { __esModule: true, default: "FilePermissions" };
          if (id.endsWith("/Dialogs/DraggableDialog")) return { __esModule: true, default: "DraggableDialog" };
          if (id.endsWith("/Share/PermissionEditor"))
            return {
              __esModule: true,
              default: "PermissionEditor",
              defaultSharePermissions: () => ({ everyone: "IQ==" }),
            };
          if (id.endsWith("/Common/StyledComponents.tsx")) return { NoLabelFilledTextField: "TextField" };
          if (id.endsWith("/AddButton.tsx")) return { __esModule: true, default: "AddButton" };
          if (id.endsWith("/CustomPropsItem.tsx")) return { __esModule: true, default: "CustomPropsCard" };
          if (id === "../../util" || id === "../../../util")
            return {
              sleep: () => Promise.resolve(),
              fileExtension: () => "txt",
              sizeToString: (size) => String(size),
              getFileLinkedUri: (file) => file.path,
            };
          return {};
        },
      },
      { filename },
    );
    return module.exports;
  }
  const actions = load("src/redux/fileManagerSlice.ts");
  const reducer = actions.default;
  state = {
    fileManager: reducer(undefined, { type: "init" }),
    siteConfig: { explorer: { config: { custom_props: [{ id: "note", name: "Note", type: propertyType }] } } },
    globalState: { sidebarOpen: true, sidebarTarget: original, sidebarTab: "details" },
  };
  function dispatch(action) {
    if (typeof action === "function") return action(dispatch, () => state);
    if (action.type === "sidebar") {
      state = {
        ...state,
        globalState: { ...state.globalState, sidebarOpen: action.payload.open, sidebarTarget: action.payload.target },
      };
    } else if (action.type === "permission-dialog") {
      state = { ...state, globalState: { ...state.globalState, filePermissionDialog: action.payload } };
    } else {
      if (action.type === "refresh-request") refreshRequests.push(action);
      state = { ...state, fileManager: reducer(state.fileManager, action) };
    }
    return action;
  }
  function find(tree, type) {
    if (!tree || typeof tree !== "object") return undefined;
    if (tree.type === type) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
      const result = find(child, type);
      if (result) return result;
    }
  }
  const Sidebar = load(
    `src/component/FileManager/Sidebar/${variant === "mobile" ? "SidebarDialog" : "Sidebar"}.tsx`,
  ).default;
  const SidebarContent = load("src/component/FileManager/Sidebar/SidebarContent.tsx").default;
  const CustomProps = load("src/component/FileManager/Sidebar/CustomProps/CustomProps.tsx").default;
  const Details = load("src/component/FileManager/Sidebar/Details.tsx").default;
  const FilePermissions = load("src/component/FileManager/Dialogs/FilePermissions.tsx").default;
  const FilePermissionMenuDialog = load(
    "src/component/FileManager/Dialogs/FilePermissions.tsx",
  ).FilePermissionMenuDialog;
  const Property = load(
    `src/component/FileManager/Sidebar/CustomProps/${propertyType === "number" ? "Number" : "Text"}PropsContent.tsx`,
  ).default;
  const Data = load("src/component/FileManager/Sidebar/Data.tsx").default;
  const thunks = load("src/redux/thunks/filemanager.ts");
  requestReady = true;
  dispatch(actions.setPathProps({ index: 0, value: { path: parent.path, current_fs: "share" } }));
  dispatch(actions.applyListResponse({ index: 0, value: listing([original]) }));

  let menuComponent;
  return {
    openPermissionMenu(files, listed = true) {
      if (listed) dispatch(actions.applyListResponse({ index: 0, value: listing(files) }));
      dispatch({ type: "permission-dialog", payload: { files, index: 0, owner: actor } });
      return this.menuDialog();
    },
    menuDialog() {
      const tree = render(FilePermissionMenuDialog);
      if (!tree && menuComponent) {
        for (const hook of componentHooks.get(menuComponent) ?? []) hook?.cleanup?.();
        componentHooks.delete(menuComponent);
        menuComponent = undefined;
      }
      if (tree) menuComponent = tree.type;
      return tree && render(tree.type, tree.props);
    },
    async answer(info, request = infoRequests.at(-1)) {
      request.resolve(info);
      await flush();
    },
    async reject(error, request = infoRequests.at(-1)) {
      request.reject(error);
      await flush();
    },
    async refreshMenu(files) {
      nextListing = listing(files);
      await dispatch(thunks.navigateReconcile(0));
      return this.menuDialog();
    },
    infoRequests,
    mutations,
    thumbnailRequests: () => thumbnailRequests,
    async renderDetails(props) {
      render(Details, this.details(props));
      await flush();
      return this.view();
    },
    refreshRequests,
    failPermissionWrite(error) {
      permissionError = error;
    },
    find,
    state: () => state,
    view: () => find(render(Sidebar), "SidebarContent").props,
    invalidateRoot(code) {
      dispatch(actions.setFmError({ index: 0, value: new AppError(code) }));
      return this.view();
    },
    async open() {
      render(Sidebar);
      infoRequests.at(-1).resolve(original);
      await flush();
      return this.view();
    },
    async refresh(files) {
      nextListing = listing(files);
      await dispatch(thunks.navigateReconcile(0));
      return this.view();
    },
    details(props) {
      return find(render(SidebarContent, props), "Details").props;
    },
    permissionView(props) {
      const control = find(render(Details, this.details(props)), "FilePermissions");
      return render(FilePermissions, control.props);
    },
    permissionButton(props) {
      return find(this.permissionView(props), "Button").props;
    },
    permissionDialog(props) {
      const tree = this.permissionView(props);
      const dialog = tree?.props.children.find((node) => node?.type?.name === "PermissionDialog");
      return dialog && render(dialog.type, dialog.props);
    },
    property(props) {
      const details = this.details(props);
      const card = find(
        render(CustomProps, {
          file: details.target,
          setTarget: details.setTarget,
          targetDisplayOptions: details.targetDisplayOptions,
        }),
        "CustomPropsCard",
      ).props;
      return {
        card,
        content: render(Property, {
          prop: card.prop,
          loading: card.loading,
          readOnly: card.readOnly,
          onChange: (value) => card.onPropPatch({ ...card.prop, value }),
        }),
      };
    },
    addButton(props) {
      const details = this.details(props);
      return find(
        render(CustomProps, {
          file: details.target,
          setTarget: details.setTarget,
          targetDisplayOptions: details.targetDisplayOptions,
        }),
        "AddButton",
      ).props;
    },
    dataLinks(props) {
      const details = this.details(props);
      const tree = render(Data, { target: details.target, targetDisplayOptions: details.targetDisplayOptions });
      const links = [];
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (node.type === "Link") links.push(node.props.children);
        for (const child of [node.props?.children].flat(Infinity)) visit(child);
      };
      visit(tree);
      return links;
    },
    async reply(info, request = infoRequests.at(-1)) {
      request.resolve(info);
      await flush();
      return this.view();
    },
    async deny(request = infoRequests.at(-1)) {
      request.reject(new AppError(Code.PermissionDenied));
      await flush();
      return this.view();
    },
    replaceTarget(file) {
      dispatch({ type: "sidebar", payload: { open: true, target: file } });
      return this.view();
    },
    close() {
      dispatch({ type: "sidebar", payload: { open: false } });
      return this.view();
    },
    switchAccount() {
      actor = "another-viewer";
      dispatch(actions.clearSessionCache({ index: 0 }));
      return this.view();
    },
  };
}

const listOnly = { ...original, permission: "IA==" };

for (const variant of ["desktop", "mobile"]) {
  const detailsFixture = (type) => fixture(type, variant);
  const testDetails = (name, run) => test(`${variant}: ${name}`, run);

  testDetails("a list refresh invalidates Details actions until current info is loaded", async () => {
    const f = detailsFixture();
    assert.equal(f.addButton(await f.open()).disabled, false);
    const loading = await f.refresh([listOnly]);
    assert.equal(loading.target.id, original.id);
    assert.equal(f.addButton(loading).disabled, true);
    const fresh = await f.reply(listOnly);
    assert.equal(fresh.target.permission, "IA==");
    assert.equal(f.addButton(fresh).disabled, true);
  });

  testDetails("a denied Details target closes without leaving the old action snapshot", async () => {
    const f = detailsFixture();
    await f.open();
    await f.refresh([]);
    const result = await f.deny();
    assert.ok(result.target == null);
    assert.equal(f.state().globalState.sidebarOpen, false);
    assert.equal(f.state().globalState.sidebarTarget, undefined);
  });

  for (const code of [Code.NodeFound, Code.ParentNotExist]) {
    testDetails(`a confirmed missing current root ${code} closes cached Details immediately`, async () => {
      const f = detailsFixture();
      assert.equal(f.addButton(await f.open()).disabled, false);
      const current = f.invalidateRoot(code);
      assert.ok(current.target == null);
      assert.equal(f.state().globalState.sidebarOpen, false);
      assert.equal(f.state().globalState.sidebarTarget, undefined);
      assert.equal(f.mutations.length, 0);
    });
  }

  testDetails("an older extended-info reply cannot restore grants after a list refresh", async () => {
    const f = detailsFixture();
    f.view();
    const old = f.infoRequests.at(-1);
    await f.refresh([listOnly]);
    await f.reply(original, old);
    assert.equal(f.view().target, undefined);
    const fresh = await f.reply(listOnly);
    assert.equal(f.addButton(fresh).disabled, true);
  });

  testDetails("an earlier property save cannot restore grants after a refreshed Details response", async () => {
    const f = detailsFixture();
    const old = f.details(await f.open());
    await f.refresh([listOnly]);
    await f.reply(listOnly);
    old.setTarget({ ...original, metadata: { "props:note": "accepted before revocation" } });
    const fresh = f.view();
    assert.equal(fresh.target.permission, "IA==");
    assert.equal(f.addButton(fresh).disabled, true);
  });

  for (const end of ["close", "account"]) {
    testDetails(`${end} discards an outstanding Details reply`, async () => {
      const f = detailsFixture();
      f.view();
      const old = f.infoRequests.at(-1);
      if (end === "close") f.close();
      else f.switchAccount();
      await f.reply(original, old);
      assert.ok(f.view().target == null);
    });
  }
}

const permissionFile = { ...original, owned: true, extended_info: { permissions: { everyone: "IQ==" } } };
const secondPermissionFile = { ...permissionFile, id: "second", path: original.path + "-second" };
const offListFolder = {
  ...permissionFile,
  id: "off-list-folder",
  path: "cloudreve://my/another/deep",
  name: "deep",
  type: 1,
};

for (const path of [offListFolder.path, "cloudreve://share/link/ancestor"]) {
  test(`permission menu opens an off-list folder ${path} after fresh identity checks`, async () => {
    const f = fixture();
    const folder = { ...offListFolder, path };
    assert.ok(f.openPermissionMenu([folder], false));
    assert.equal(f.menuDialog().props.disabled, true);
    assert.equal(f.infoRequests.length, 1);
    await f.answer(folder);
    assert.equal(f.menuDialog().props.disabled, false);
    f.find(f.menuDialog(), "PermissionEditor").props.onChange({ everyone: "IA==" });
    const refreshed = await f.refreshMenu([original]);
    assert.deepEqual(f.find(refreshed, "PermissionEditor").props.value, { everyone: "IA==" });
    const saving = f.menuDialog().props.onAccept();
    await f.answer(folder);
    await saving;
    assert.equal(f.mutations.length, 1);
    assert.deepEqual(Array.from(f.mutations[0].expected_ids), [folder.id]);
    assert.equal(f.menuDialog(), null);
  });
}

for (const end of ["recreated", "account", "revoked-root"]) {
  test(`permission menu discards an off-list target after ${end}`, async () => {
    const f = fixture();
    assert.ok(f.openPermissionMenu([offListFolder], false));
    const pending = f.infoRequests.at(-1);
    if (end === "account") f.switchAccount();
    if (end === "revoked-root") f.invalidateRoot(Code.PermissionDenied);
    await f.answer(end === "recreated" ? { ...offListFolder, id: "replacement" } : offListFolder, pending);
    assert.equal(f.menuDialog(), null);
    assert.equal(f.mutations.length, 0);
  });
}

test("an off-list permission target becomes list-bound when its current listing arrives", async () => {
  const f = fixture();
  assert.ok(f.openPermissionMenu([offListFolder], false));
  await f.answer(offListFolder);
  assert.ok(await f.refreshMenu([offListFolder]));
  assert.equal(await f.refreshMenu([]), null);
  assert.equal(f.mutations.length, 0);
});

async function openPermissionMenu(f, files = [permissionFile]) {
  f.openPermissionMenu(files);
  assert.equal(f.infoRequests.length, files.length, "load must check every selected object");
  const requests = [...f.infoRequests];
  for (const [index, file] of files.entries()) await f.answer(file, requests[index]);
  return f.menuDialog();
}

test("permission menu rejects a replacement returned by its initial request", async () => {
  const f = fixture();
  f.openPermissionMenu([permissionFile]);
  await f.answer({ ...permissionFile, id: "replacement" });
  const dialog = f.menuDialog();
  if (dialog) await dialog.props.onAccept();
  assert.equal(f.mutations.length, 0);
  assert.equal(f.menuDialog(), null);
});

test("permission menu validates later batch members before enabling edits", async () => {
  const f = fixture();
  f.openPermissionMenu([permissionFile, secondPermissionFile]);
  assert.equal(f.infoRequests.length, 2);
  await f.answer(permissionFile, f.infoRequests[0]);
  assert.equal(f.menuDialog().props.disabled, true);
  await f.answer({ ...secondPermissionFile, id: "replacement" }, f.infoRequests[1]);
  assert.equal(f.menuDialog(), null);
  assert.equal(f.mutations.length, 0);
});

for (const clear of [false, true]) {
  test(`permission menu rechecks every object before ${clear ? "clearing" : "replacing"} a batch ACL`, async () => {
    const f = fixture();
    const dialog = await openPermissionMenu(f, [permissionFile, secondPermissionFile]);
    f.find(dialog, "Button").props.onClick();
    const ready = f.menuDialog();
    const saving = clear ? ready.props.secondaryAction.props.onClick() : ready.props.onAccept();
    assert.equal(f.mutations.length, 0);
    assert.equal(f.menuDialog().props.loading, true);
    assert.equal(f.infoRequests.length, 4);
    await f.answer(permissionFile, f.infoRequests[2]);
    await f.answer({ ...secondPermissionFile, id: "replacement" }, f.infoRequests[3]);
    await saving;
    assert.equal(f.mutations.length, 0, "a replaced member must prevent the whole batch");
    assert.equal(f.menuDialog(), null);
  });
}

test("permission menu submits one batch when all identities still match", async () => {
  const f = fixture();
  const dialog = await openPermissionMenu(f, [permissionFile, secondPermissionFile]);
  f.find(dialog, "Button").props.onClick();
  f.find(f.menuDialog(), "PermissionEditor").props.onChange({ everyone: "IA==" });
  const saving = f.menuDialog().props.onAccept();
  await f.answer(permissionFile, f.infoRequests[2]);
  await f.answer(secondPermissionFile, f.infoRequests[3]);
  await saving;
  assert.equal(f.mutations.length, 1);
  assert.deepEqual([...f.mutations[0].uris], [permissionFile.path, secondPermissionFile.path]);
  assert.deepEqual([...f.mutations[0].expected_ids], [permissionFile.id, secondPermissionFile.id]);
  assert.deepEqual(f.mutations[0].setting, { everyone: "IA==" });
  assert.equal(f.menuDialog(), null);
});

test("permission menu binds a clear request to every selected object identity", async () => {
  const f = fixture();
  const dialog = await openPermissionMenu(f, [permissionFile, secondPermissionFile]);
  const saving = dialog.props.secondaryAction.props.onClick();
  await f.answer(permissionFile, f.infoRequests[2]);
  await f.answer(secondPermissionFile, f.infoRequests[3]);
  await saving;
  assert.equal(f.mutations.length, 1);
  assert.equal(f.mutations[0].clear, true);
  assert.deepEqual([...f.mutations[0].expected_ids], [permissionFile.id, secondPermissionFile.id]);
  assert.equal(f.menuDialog(), null);
});

test("permission menu closes a stale draft when the final guarded write conflicts", async () => {
  const f = fixture();
  const dialog = await openPermissionMenu(f);
  f.failPermissionWrite(new AppError(Code.Conflict));
  const saving = dialog.props.onAccept();
  await f.answer(permissionFile);
  await saving;
  assert.equal(f.mutations.length, 1);
  assert.deepEqual([...f.mutations[0].expected_ids], [permissionFile.id]);
  assert.equal(f.menuDialog(), null);
});

for (const files of [[permissionFile], [permissionFile, secondPermissionFile]]) {
  const selection = files.length === 1 ? "single target" : "batch";
  for (const code of [40016, 404, 403, 40082]) {
    for (const clear of [false, true]) {
      test(`permission menu discards a ${selection} after final ${
        clear ? "DELETE" : "POST"
      } error ${code}`, async () => {
        const f = fixture();
        const dialog = await openPermissionMenu(f, files);
        if (files.length > 1) f.find(dialog, "Button").props.onClick();
        f.find(f.menuDialog(), "PermissionEditor").props.onChange({ everyone: "IA==" });
        f.failPermissionWrite(new AppError(code));
        const ready = f.menuDialog();
        const start = f.infoRequests.length;
        const saving = clear ? ready.props.secondaryAction.props.onClick() : ready.props.onAccept();
        const requests = f.infoRequests.slice(start);
        for (const [i, file] of files.entries()) await f.answer(file, requests[i]);
        await saving;
        assert.equal(f.mutations.length, 1, "all preflight GETs must succeed before the actual write fails");
        assert.deepEqual(
          [...f.mutations[0].expected_ids],
          files.map((file) => file.id),
        );
        assert.equal(f.menuDialog(), null);
        assert.equal(f.refreshRequests.length, 1);
      });
    }
  }
}

for (const [reason, error] of [
  ["transport", new Error("network unavailable")],
  ["service", new AppError(50005)],
  ["validation", new AppError(40001)],
  ["anonymous assignment policy", new AppError(40007)],
]) {
  test(`permission menu preserves and retries a draft after a final ${reason} error`, async () => {
    const f = fixture();
    await openPermissionMenu(f);
    f.find(f.menuDialog(), "PermissionEditor").props.onChange({ everyone: "IA==" });
    f.failPermissionWrite(error);
    const saving = f.menuDialog().props.onAccept();
    await f.answer(permissionFile);
    await saving;
    const dialog = f.menuDialog();
    assert.equal(dialog.props.dialogProps.open, true);
    assert.equal(dialog.props.loading, false);
    assert.deepEqual(f.find(dialog, "PermissionEditor").props.value, { everyone: "IA==" });
    assert.equal(f.refreshRequests.length, 0);
    const retry = dialog.props.onAccept();
    await f.answer(permissionFile);
    await retry;
    assert.equal(f.mutations.length, 2);
    assert.deepEqual(f.mutations[1].setting, { everyone: "IA==" });
    assert.equal(f.menuDialog(), null);
  });
}

test("permission menu keeps a draft after a transient identity check failure and can retry", async () => {
  const f = fixture();
  await openPermissionMenu(f);
  f.find(f.menuDialog(), "PermissionEditor").props.onChange({ everyone: "IA==" });
  const saving = f.menuDialog().props.onAccept();
  assert.equal(f.mutations.length, 0);
  await f.reject(new Error("network unavailable"));
  await saving;
  let dialog = f.menuDialog();
  assert.deepEqual(f.find(dialog, "PermissionEditor").props.value, { everyone: "IA==" });
  assert.equal(f.mutations.length, 0);
  const retry = dialog.props.onAccept();
  await f.answer(permissionFile);
  await retry;
  assert.equal(f.mutations.length, 1);
  assert.deepEqual(f.mutations[0].setting, { everyone: "IA==" });
});

for (const end of ["close", "account", "replacement"]) {
  test(`permission menu cannot save a pending identity check after ${end}`, async () => {
    const f = fixture();
    const dialog = await openPermissionMenu(f);
    const saving = dialog.props.onAccept();
    const pending = f.infoRequests.at(-1);
    if (end === "close") {
      dialog.props.dialogProps.onClose();
      f.menuDialog();
    } else if (end === "account") {
      f.switchAccount();
      f.menuDialog();
    } else {
      await f.refreshMenu([{ ...permissionFile, id: "replacement" }]);
    }
    await f.answer(permissionFile, pending);
    await saving;
    assert.equal(f.mutations.length, 0);
    assert.equal(f.menuDialog(), null);
  });
}

test("permission menu closes when the selected file disappears from a refreshed list", async () => {
  const f = fixture();
  await openPermissionMenu(f);
  assert.equal(await f.refreshMenu([]), null);
  assert.equal(f.mutations.length, 0);
});

test("permission menu retains the draft across an unchanged list refresh", async () => {
  const f = fixture();
  await openPermissionMenu(f);
  f.find(f.menuDialog(), "PermissionEditor").props.onChange({ everyone: "IA==" });
  const refreshed = await f.refreshMenu([{ ...permissionFile }]);
  assert.deepEqual(f.find(refreshed, "PermissionEditor").props.value, { everyone: "IA==" });
  assert.equal(f.mutations.length, 0);
});

test("permission menu closes after a current not-found response", async () => {
  const f = fixture();
  f.openPermissionMenu([permissionFile]);
  await f.reject(new AppError(Code.NodeFound));
  assert.equal(f.menuDialog(), null);
  assert.equal(f.mutations.length, 0);
});

for (const files of [[permissionFile], [permissionFile, secondPermissionFile]]) {
  const selection = files.length === 1 ? "single target" : "batch member";
  test(`permission menu closes and refreshes a missing ${selection} during loading`, async () => {
    const f = fixture();
    f.openPermissionMenu(files);
    const requests = [...f.infoRequests];
    for (let i = 0; i < files.length - 1; i++) await f.answer(files[i], requests[i]);
    // Native FileInfo uses 40016 when a selected file or its parent was moved.
    await f.reject(new AppError(40016), requests.at(-1));
    assert.equal(f.menuDialog(), null);
    assert.equal(f.refreshRequests.length, 1);
    assert.equal(f.mutations.length, 0);
  });

  for (const clear of [false, true]) {
    test(`permission menu closes and refreshes a missing ${selection} before ${
      clear ? "clearing" : "replacing"
    } permissions`, async () => {
      const f = fixture();
      const dialog = await openPermissionMenu(f, files);
      if (files.length > 1) f.find(dialog, "Button").props.onClick();
      const ready = f.menuDialog();
      const start = f.infoRequests.length;
      const saving = clear ? ready.props.secondaryAction.props.onClick() : ready.props.onAccept();
      const requests = f.infoRequests.slice(start);
      assert.equal(requests.length, files.length);
      for (let i = 0; i < files.length - 1; i++) await f.answer(files[i], requests[i]);
      await f.reject(new AppError(40016), requests.at(-1));
      await saving;
      assert.equal(f.menuDialog(), null);
      assert.equal(f.refreshRequests.length, 1);
      assert.equal(f.mutations.length, 0);
    });
  }
}

for (const variant of ["desktop", "mobile"]) {
  const detailsFixture = (type) => fixture(type, variant);
  const testDetails = (name, run) => test(`${variant}: ${name}`, run);

  for (const outcome of ["success", "failure"]) {
    testDetails(`a late ${outcome} for the previous Details target cannot replace the new target`, async () => {
      const f = detailsFixture();
      f.view();
      const old = f.infoRequests.at(-1);
      const second = { ...original, id: "second", path: original.path + "-second" };
      f.replaceTarget(second);
      await f.reply(second);
      if (outcome === "success") await f.reply(original, old);
      else await f.deny(old);
      assert.equal(f.view().target.id, second.id);
      assert.equal(f.state().globalState.sidebarOpen, true);
    });
  }

  testDetails("a recreated file cannot replace the object originally opened in Details", async () => {
    const f = detailsFixture();
    f.view();
    await f.reply({ ...original, id: "replacement" });
    assert.ok(f.view().target == null);
    assert.equal(f.state().globalState.sidebarOpen, false);
  });

  testDetails("Details data actions follow refreshed read permissions", async () => {
    const f = detailsFixture();
    const file = {
      ...original,
      extended_info: {
        entities: [
          { id: "version", type: 0, size: 10 },
          { id: "thumbnail", type: 1, size: 5 },
        ],
      },
    };
    f.view();
    const readable = await f.reply(file);
    assert.deepEqual(f.dataLinks(readable), ["fileManager.manageVersions", "fileManager.download"]);
    await f.refresh([{ ...file, permission: "IA==" }]);
    const listed = await f.reply({ ...file, permission: "IA==" });
    assert.deepEqual(f.dataLinks(listed), []);
  });

  testDetails("an unchanged background refresh retains the permission draft and blocks pending saves", async () => {
    const f = detailsFixture();
    const file = { ...original, owned: true, extended_info: { permissions: { everyone: "IQ==" } } };
    f.view();
    const opened = await f.reply(file);
    f.permissionButton(opened).onClick();
    f.permissionDialog(opened);
    await f.reply(file);
    let dialog = f.permissionDialog(f.view());
    f.find(dialog, "PermissionEditor").props.onChange({ everyone: "Pw==" });

    const pending = await f.refresh([file]);
    assert.equal(pending.target.id, file.id, "Details must stay mounted for the same object during validation");
    dialog = f.permissionDialog(pending);
    assert.ok(dialog, "an unchanged target must retain its open permission editor");
    assert.equal(dialog.props.disabled, true);
    assert.equal(dialog.props.secondaryAction.props.disabled, true);
    assert.deepEqual(f.find(dialog, "PermissionEditor").props.value, { everyone: "Pw==" });
    await dialog.props.onAccept();
    assert.equal(f.mutations.length, 0);

    const fresh = await f.reply(file);
    dialog = f.permissionDialog(fresh);
    assert.equal(dialog.props.disabled, false);
    assert.deepEqual(f.find(dialog, "PermissionEditor").props.value, { everyone: "Pw==" });
    const saving = dialog.props.onAccept();
    await new Promise(setImmediate);
    await f.reply(file);
    assert.equal(f.mutations.length, 1);
    await f.reply({ ...file, extended_info: { permissions: { everyone: "Pw==" } } });
    await saving;
    assert.equal(f.mutations.length, 1);
    assert.deepEqual(f.mutations[0].setting, { everyone: "Pw==" });
    assert.equal(f.permissionDialog(f.view()), undefined);
  });

  for (const type of ["text", "number"]) {
    testDetails(`an unchanged refresh preserves the unsaved ${type} property draft`, async () => {
      const f = detailsFixture(type);
      const file = { ...original, metadata: { "props:note": type === "number" ? "7" : "value" } };
      f.view();
      const opened = await f.reply(file);
      const draft = type === "number" ? "42" : "unsaved draft";
      f.property(opened).content.props.onChange({ target: { value: draft } });
      const pending = await f.refresh([file]);
      assert.equal(pending.target.id, file.id, "Details must stay mounted for a refresh");
      const validating = f.property(pending);
      assert.equal(validating.card.readOnly, true);
      assert.equal(validating.content.props.children, draft);
      validating.card.onPropPatch({ ...validating.card.prop, value: draft });
      assert.equal(f.mutations.length, 0, "pending validation cannot commit a property mutation");
      const fresh = await f.reply(file);
      const property = f.property(fresh);
      assert.equal(property.card.readOnly, false);
      assert.equal(property.content.props.value, draft);
      property.content.props.onBlur();
      await new Promise(setImmediate);
      assert.equal(f.mutations.length, 1);
      assert.equal(f.mutations[0].patches[0].value, draft);
    });
  }
}

for (const variant of ["desktop", "mobile"]) {
  test(`${variant}: a failed thumbnail cannot cause repeated Details and thumbnail requests`, async () => {
    const f = fixture("text", variant, true);
    const pending = await f.renderDetails(await f.open());
    assert.equal(f.thumbnailRequests(), 1);
    assert.equal(pending.validating, true);
    const fresh = await f.reply({ ...original, permission: "IQ==", metadata: { "props:note": "fresh server note" } });
    await f.renderDetails(fresh);
    assert.equal(f.thumbnailRequests(), 1, "a cached thumbnail failure must stop the request feedback loop");
    assert.equal(f.infoRequests.length, 2);
    assert.equal(fresh.target.permission, "IQ==", "current authorization still comes from the server");
    assert.equal(fresh.target.metadata["props:note"], "fresh server note");
    assert.equal(fresh.target.metadata["thumb:disabled"], "");

    await f.refresh([original]);
    await f.renderDetails(await f.reply(original));
    assert.equal(f.thumbnailRequests(), 2, "an accepted HTTP list refresh permits a thumbnail retry");
  });

  test(`${variant}: a new content version does not inherit an old thumbnail failure`, async () => {
    const f = fixture("text", variant, true);
    await f.renderDetails(await f.open());
    const fresh = await f.reply({ ...original, primary_entity: "new-version" });
    assert.equal(fresh.target.metadata?.["thumb:disabled"], undefined);
    await f.renderDetails(fresh);
    assert.equal(f.thumbnailRequests(), 2);
  });
}
