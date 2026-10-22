import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const frontend = fileURLToPath(new URL("..", import.meta.url));
const resolveModule = createRequire(import.meta.url);
const Code = { PermissionDenied: 403, NodeFound: 404, ParentNotExist: 40016 };
class AppError extends Error {
  constructor(code) {
    super("Entry revoked");
    this.code = code;
  }
  ErrorResponse() {
    return { code: this.code, msg: this.message };
  }
}

// Load complete production modules with the installed TypeScript compiler.
// Only browser/session/HTTP and unused UI boundaries are replaced; the thunks,
// URI handling, Redux Toolkit and file-manager reducer run unchanged.
function fixture(uri = "cloudreve://my", mode) {
  let actor = "viewer";
  let disableViewSync = false;
  const requests = [];
  const logs = [];
  const navigations = [];
  const viewWrites = [];
  const UserSettings = { SortBy: "sort_by", SortDirection: "sort_direction" };
  const saved = { sort_by: "created_at", sort_direction: "asc" };
  let respond;
  let fail;
  const response = new Promise((resolve, reject) => {
    respond = resolve;
    fail = reject;
  });
  const session = {
    currentLoginOrNull: () => ({ user: { id: actor, disable_view_sync: disableViewSync } }),
    getWithFallback: (key) => saved[key] ?? 20,
    currentUser: () => ({ group: {} }),
    currentUserGroupPermission: () => ({ enabled: () => false }),
  };
  const cache = new Map();
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} };
    cache.set(filename, module.exports);
    const compiled = ts.transpileModule(readFileSync(path.join(frontend, filename), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(
      compiled,
      {
        module,
        exports: module.exports,
        URL,
        URLSearchParams,
        atob,
        btoa,
        console: { ...console, log: (...args) => logs.push(args) },
        window: { matchMedia: () => ({ matches: false }) },
        require(id) {
          if (id === "../../router") return { router: { navigate: (uri) => navigations.push(uri) } };
          if (["dayjs", "path-browserify", "@reduxjs/toolkit", "react"].includes(id)) return resolveModule(id);
          if (id.endsWith("/session")) return { __esModule: true, default: session, UserSettings };
          if (id.endsWith("/request.ts")) return { Code, AppError };
          if (id.endsWith("/explorer.ts") || id.endsWith("/explorer")) return load("src/api/explorer.ts");
          if (id.endsWith("/uri.ts") || id.endsWith("/uri")) return load("src/util/uri.ts");
          if (id.endsWith("/boolset.ts") || id.endsWith("/boolset")) return load("src/util/boolset.ts");
          if (id.endsWith("/permission")) return load("src/util/permission.ts");
          if (id.endsWith("/FileManager.tsx")) return { FileManagerIndex: { main: 0, selector: 1 } };
          if (id.endsWith("/user.ts")) return { GroupPermission: {} };
          if (id.endsWith("/fileManagerSlice.ts")) return load("src/redux/fileManagerSlice.ts");
          if (id.endsWith("/api.ts"))
            return {
              getFileList: (request) => () => {
                requests.push(request);
                return response;
              },
              sendPatchViewSync: (request) => async () => viewWrites.push(request),
            };
          if (id.endsWith("/ViewOptionPopover.tsx")) return { MinPageSize: 20 };
          if (id.endsWith("/PaginationFooter.tsx")) return { getPaginationState: () => ({ moreItems: false }) };
          if (id === "../../util" || id === "../../../util") {
            return { sleep: () => Promise.resolve(), fileExtension: () => "txt" };
          }
          return {};
        },
      },
      { filename },
    );
    return module.exports;
  };
  const actions = load("src/redux/fileManagerSlice.ts");
  const reducer = actions.default;
  const thunks = load("src/redux/thunks/filemanager.ts");
  let state = {
    fileManager: reducer(undefined, { type: "init" }),
    siteConfig: { explorer: { config: { shared_with_me_acl: mode } } },
    globalState: {},
  };
  const dispatch = (action) => {
    if (typeof action === "function") return action(dispatch, () => state);
    state = { ...state, fileManager: reducer(state.fileManager, action) };
    return action;
  };
  dispatch(actions.setPathProps({ index: 0, value: { path: uri, pure_path: uri, current_fs: new URL(uri).hostname } }));
  return {
    actions,
    thunks,
    dispatch,
    respond,
    fail,
    requests,
    logs,
    navigations,
    viewWrites,
    manager: () => state.fileManager[0],
    getActionOpt: load("src/component/FileManager/ContextMenu/useActionDisplayOpt.ts").getActionOpt,
    setMode: (value) => {
      state = { ...state, siteConfig: { explorer: { config: { shared_with_me_acl: value } } } };
    },
    setActor: (value) => {
      actor = value;
    },
    setDisableViewSync: (value) => {
      disableViewSync = value;
    },
    setSavedSort: (order, direction) => {
      saved.sort_by = order;
      saved.sort_direction = direction;
    },
    savedSort: () => [saved.sort_by, saved.sort_direction],
  };
}

const listing = (files = []) => ({
  files,
  props: { max_page_size: 100 },
  pagination: { page: 0, page_size: 20, total_items: files.length },
});
const child = { id: "child", path: "cloudreve://share/link/private", name: "private", type: 1 };

for (const mode of [false, true]) {
  for (const tree of [false, true]) {
    for (const order of ["size", "updated_at", "name", "created_at"]) {
      test(`${mode ? "ACL" : "manual"} catalog ${
        tree ? "tree" : "navigation"
      } projects saved ${order} sorting`, async () => {
        const f = fixture(tree ? "cloudreve://my" : "cloudreve://shared_with_me", mode);
        f.setDisableViewSync(true);
        f.setSavedSort(order, "desc");
        f.dispatch(f.actions.setSortOption({ index: 0, value: [order, "desc"] }));
        const request = f.dispatch(
          tree ? f.thunks.loadChild(0, "cloudreve://shared_with_me") : f.thunks.navigateReconcile(0),
        );
        const expected = mode && ["size", "updated_at"].includes(order) ? "created_at" : order;
        assert.equal(f.requests[0].order_by, expected);
        assert.equal(f.requests[0].order_direction, "desc");
        f.respond({ ...listing(), view: { order: expected, order_direction: "desc", page_size: 20 } });
        await request;
        assert.equal(f.viewWrites.length, 0, "request projection must not save a view");
        assert.deepEqual(f.savedSort(), [order, "desc"], "request projection must not replace the saved preference");
        if (!tree) assert.equal(f.manager().sortBy, expected, "the displayed sort must match the effective view");
      });
    }
  }
}

test("a disabled-sync catalog restores saved sorting after a real ACL view response and a manual-mode return", async () => {
  const f = fixture("cloudreve://shared_with_me", true);
  f.setDisableViewSync(true);
  f.setSavedSort("size", "desc");
  f.dispatch(f.actions.setSortOption({ index: 0, value: ["size", "desc"] }));
  const catalog = f.dispatch(f.thunks.navigateReconcile(0));
  assert.equal(f.requests[0].order_by, "created_at");
  f.respond({ ...listing(), view: { order: "created_at", order_direction: "desc", page_size: 20 } });
  await catalog;
  assert.equal(f.manager().sortBy, "created_at");
  f.setMode(false);
  await f.dispatch(f.thunks.navigateReconcile(0));
  assert.equal(f.requests[1].order_by, "size");
  assert.equal(f.requests[1].order_direction, "desc");
  assert.deepEqual(f.savedSort(), ["size", "desc"]);
  assert.equal(f.viewWrites.length, 0);
});

test("ACL catalog request projection preserves its local manual view across continuation and mode changes", async () => {
  const f = fixture("cloudreve://shared_with_me", false);
  f.setDisableViewSync(true);
  f.dispatch(f.actions.applyListResponse({ index: 0, value: listing() }));
  f.dispatch(f.actions.setSortOption({ index: 0, value: ["size", "desc"] }));
  await f.dispatch(f.thunks.syncViewSettings(0));
  f.setDisableViewSync(false);
  f.setMode(true);
  const catalog = f.dispatch(f.thunks.navigateReconcile(0));
  assert.equal(f.requests[0].order_by, "created_at");
  f.respond({
    ...listing(),
    pagination: { page: 0, page_size: 20, next_token: "opaque-acl-cursor" },
    view: { order: "created_at", order_direction: "desc", page_size: 20 },
  });
  await catalog;
  await f.dispatch(f.thunks.navigateReconcile(0, { next_page: true }));
  assert.equal(f.requests[1].next_page_token, "opaque-acl-cursor");
  assert.equal(f.requests[1].order_by, "created_at");
  assert.equal(f.requests[1].order_direction, "desc");
  f.setMode(false);
  await f.dispatch(f.thunks.navigateReconcile(0));
  assert.equal(f.requests[2].order_by, "size");
  assert.equal(f.requests[2].order_direction, "desc");
  assert.equal(f.viewWrites.length, 0);
});

for (const mode of [false, true]) {
  test(`initial explorer configuration (${mode}) cannot strand My Files loading`, async () => {
    const f = fixture();
    const request = f.dispatch(f.thunks.navigateReconcile(0));
    f.setMode(mode);
    f.respond(listing());
    await request;
    assert.equal(f.manager().loading, false);
    assert.ok(f.manager().list);
  });
}

test("missing discovery mode and explicit false both mean manual mode", async () => {
  const f = fixture("cloudreve://shared_with_me");
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.setMode(false);
  f.respond(listing());
  await request;
  assert.equal(f.manager().loading, false);
  assert.ok(f.manager().list);
});

for (const code of [Code.NodeFound, Code.ParentNotExist]) {
  test(`a confirmed missing current root ${code} clears cached rows and actions`, async () => {
    const uri = "cloudreve://my/current";
    const f = fixture(uri);
    const selected = { ...fullChild, path: `${uri}/private.txt` };
    selectWithMenu(f, [selected]);
    f.dispatch(f.actions.appendTreeCache({ index: 0, value: [[selected], uri] }));
    const generation = f.manager().cacheGeneration;
    const request = f.dispatch(f.thunks.navigateReconcile(0));
    f.fail(new AppError(code));
    await request;
    assert.equal(f.manager().loading, false);
    assert.equal(f.manager().showError, true);
    assert.equal(f.manager().list, undefined);
    assert.equal(f.manager().listPath, undefined);
    assert.deepEqual(Object.keys(f.manager().tree), []);
    assert.deepEqual(Object.keys(f.manager().selected), []);
    assert.equal(f.manager().contextMenuOpen, false);
    assert.equal(f.manager().contextMenuTargets, undefined);
    assert.ok(f.manager().cacheGeneration > generation);
  });
}

test("late list and tree replies cannot restore a missing current root", async () => {
  const uri = "cloudreve://my/current";
  const f = fixture(uri);
  selectWithMenu(f, [{ ...fullChild, path: `${uri}/private.txt` }]);
  const list = f.dispatch(f.thunks.navigateReconcile(0));
  const tree = f.dispatch(f.thunks.loadChild(0, `${uri}/pending`));
  f.dispatch(f.actions.setFmError({ index: 0, value: new AppError(40016) }));
  f.respond(listing([fullChild]));
  await Promise.all([list, tree]);
  assert.equal(f.manager().loading, false);
  assert.equal(f.manager().list, undefined);
  assert.equal(f.manager().listPath, undefined);
  assert.deepEqual(Object.keys(f.manager().tree), []);
  assert.deepEqual(Object.keys(f.manager().selected), []);
  assert.equal(f.manager().contextMenuOpen, false);
});

test("transient root failures keep the current snapshot available for retry", async () => {
  const f = fixture("cloudreve://my/current");
  selectWithMenu(f, [fullChild]);
  const previous = f.manager().list;
  const generation = f.manager().cacheGeneration;
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.fail(new AppError(50005));
  await request;
  assert.equal(f.manager().loading, false);
  assert.equal(f.manager().list, previous);
  assert.equal(f.manager().cacheGeneration, generation);
  assert.equal(Object.keys(f.manager().selected).length, 1);
});

test("a real discovery-mode switch rejects the older listing", async () => {
  const f = fixture("cloudreve://shared_with_me", false);
  const old = f.dispatch(f.thunks.navigateReconcile(0));
  f.setMode(true);
  f.respond(listing([child]));
  await old;
  assert.equal(f.manager().list, undefined);
  await f.dispatch(f.thunks.navigateReconcile(0));
  assert.equal(f.manager().loading, false);
  assert.equal(f.manager().list.files.length, 1);
});

for (const invalidate of ["revoke", "session", "reset"]) {
  test(`an old tree response cannot repopulate the cache after ${invalidate}`, async () => {
    const f = fixture("cloudreve://share/link", false);
    const old = f.dispatch(f.thunks.loadChild(0, "cloudreve://share/link"));
    if (invalidate === "revoke") {
      f.dispatch(f.actions.setFmError({ index: 0, value: new AppError(Code.PermissionDenied) }));
    } else if (invalidate === "session") {
      f.dispatch(f.actions.clearSessionCache({ index: 0 }));
    } else {
      f.dispatch(f.actions.resetFileManager(0));
    }
    f.respond(listing([child]));
    await old;
    assert.equal(Object.keys(f.manager().tree).length, 0);
  });
}

test("a current tree response still populates its children", async () => {
  const f = fixture("cloudreve://share/link", false);
  const request = f.dispatch(f.thunks.loadChild(0, "cloudreve://share/link"));
  f.respond(listing([child]));
  await request;
  assert.equal(f.manager().tree["cloudreve://share/link"].children[0], child.path);
});

test("an authorized share refresh removes cached descendants no longer returned", async () => {
  const f = fixture("cloudreve://share/link", false);
  f.dispatch(f.actions.appendTreeCache({ index: 0, value: [[child], "cloudreve://share/link"] }));
  f.dispatch(
    f.actions.appendTreeCache({
      index: 0,
      value: [
        [
          {
            ...child,
            id: "grandchild",
            path: child.path + "/nested",
          },
        ],
        child.path,
      ],
    }),
  );
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.respond(listing());
  await request;
  assert.equal(f.manager().list.files.length, 0);
  assert.equal(f.manager().tree["cloudreve://share/link"].children.length, 0);
  assert.equal(f.manager().tree[child.path], undefined);
  assert.equal(f.manager().tree[child.path + "/nested"], undefined);
});

test("an old main listing cannot repopulate cleared session caches", async () => {
  const f = fixture();
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.dispatch(f.actions.clearSessionCache({ index: 0 }));
  f.respond(listing([child]));
  await request;
  assert.equal(f.manager().list, undefined);
  assert.equal(Object.keys(f.manager().tree).length, 0);
});

test("revoked main navigation clears its own loading indicator", async () => {
  const f = fixture("cloudreve://share/link", false);
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.fail(new AppError(Code.PermissionDenied));
  await request;
  assert.equal(f.manager().loading, false);
  assert.equal(f.manager().showError, true);
  assert.equal(f.manager().list, undefined);
});

test("appending a share page retains authorized folders from previous pages", async () => {
  const f = fixture("cloudreve://share/link", false);
  f.dispatch(
    f.actions.applyListResponse({
      index: 0,
      value: {
        ...listing([child]),
        pagination: { next_token: "next", page_size: 20 },
      },
    }),
  );
  f.dispatch(f.actions.appendTreeCache({ index: 0, value: [[child], "cloudreve://share/link"] }));
  const next = { ...child, id: "second", path: "cloudreve://share/link/second" };
  const request = f.dispatch(f.thunks.navigateReconcile(0, { next_page: true }));
  f.respond(listing([next]));
  await request;
  assert.equal(f.manager().list.files.length, 2);
  assert.equal(f.manager().tree["cloudreve://share/link"].children.length, 2);
});

test("resetting the selector cannot invalidate the main file manager request", async () => {
  const f = fixture();
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.dispatch(f.actions.clearSessionCache({ index: 1 }));
  f.respond(listing());
  await request;
  assert.ok(f.manager().list);
  assert.equal(f.manager().loading, false);
});

const fullChild = { ...child, type: 0, permission: "Pw==", capability: "//////////8=" };

function selectWithMenu(f, files, overwrite = true) {
  f.dispatch(f.actions.applyListResponse({ index: 0, value: listing(files) }));
  f.dispatch(f.actions.setSelected({ index: 0, value: files }));
  f.dispatch(
    f.actions.setContextMenu({
      index: 0,
      value: {
        open: true,
        type: "file",
        targets: overwrite ? Object.fromEntries(files.map((file) => [file.path, file])) : undefined,
        pos: { x: 0, y: 0 },
        fmIndex: 0,
      },
    }),
  );
}

for (const overwrite of [false, true]) {
  test(`refresh removes denied selections and closes their ${overwrite ? "explicit" : "selection"} menu`, async () => {
    const f = fixture("cloudreve://share/link");
    selectWithMenu(f, [fullChild], overwrite);
    const request = f.dispatch(f.thunks.navigateReconcile(0));
    f.respond(listing());
    await request;
    assert.equal(Object.keys(f.manager().selected).length, 0);
    assert.equal(f.manager().contextMenuOpen, false);
    assert.equal(f.manager().contextMenuTargets, undefined);
  });

  test(`refresh downgrades both selection and ${overwrite ? "explicit" : "selection"} menu actions`, async () => {
    const f = fixture("cloudreve://share/link");
    selectWithMenu(f, [fullChild], overwrite);
    const fresh = { ...fullChild, permission: "IA==" };
    const request = f.dispatch(f.thunks.navigateReconcile(0));
    f.respond(listing([fresh]));
    await request;
    const fm = f.manager();
    assert.equal(fm.selected[fullChild.path].permission, fresh.permission);
    assert.equal(fm.contextMenuOpen, true);
    const targets = Object.values(fm.contextMenuTargets ?? fm.selected);
    const opt = f.getActionOpt(targets, undefined, "file");
    assert.equal(!!opt.showDownload, false);
    assert.equal(!!opt.showRename, false);
    assert.equal(!!opt.showDelete, false);
  });
}

test("an unchanged refresh preserves the selection and authorized menu actions", async () => {
  const f = fixture("cloudreve://share/link");
  selectWithMenu(f, [fullChild]);
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.respond(listing([fullChild]));
  await request;
  assert.equal(f.manager().selected[fullChild.path].id, fullChild.id);
  assert.equal(f.manager().contextMenuOpen, true);
  const opt = f.getActionOpt(Object.values(f.manager().contextMenuTargets), undefined, "file");
  assert.equal(opt.showDownload, true);
  assert.equal(opt.showRename, true);
  assert.equal(opt.showDelete, true);
});

test("a file recreated at the same path cannot inherit the previous selection or menu", async () => {
  const f = fixture("cloudreve://share/link");
  selectWithMenu(f, [fullChild]);
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.respond(listing([{ ...fullChild, id: "replacement" }]));
  await request;
  assert.equal(Object.keys(f.manager().selected).length, 0);
  assert.equal(f.manager().contextMenuOpen, false);
  assert.equal(f.manager().contextMenuTargets, undefined);
});

test("losing one batch target preserves other selections but closes the old batch menu", async () => {
  const f = fixture("cloudreve://share/link");
  const other = { ...fullChild, id: "other", path: fullChild.path + "-other" };
  selectWithMenu(f, [fullChild, other]);
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.respond(listing([other]));
  await request;
  assert.deepEqual(Object.keys(f.manager().selected), [other.path]);
  assert.equal(f.manager().contextMenuOpen, false);
  assert.equal(f.manager().contextMenuTargets, undefined);
});

test("appending a page preserves earlier selections and refreshes overlapping menu targets", async () => {
  const f = fixture("cloudreve://share/link");
  const first = { ...fullChild, id: "share:first" };
  selectWithMenu(f, [first]);
  const next = { ...fullChild, id: "share:next", path: fullChild.path + "-next" };
  f.dispatch(f.actions.appendListResponse({ index: 0, value: listing([next]) }));
  assert.equal(f.manager().selected[first.path].permission, first.permission);
  assert.equal(f.manager().contextMenuOpen, true);
  f.dispatch(f.actions.appendListResponse({ index: 0, value: listing([{ ...first, permission: "IA==" }]) }));
  assert.equal(f.manager().selected[first.path].permission, "IA==");
  assert.equal(f.manager().contextMenuTargets[first.path].permission, "IA==");
});

test("a menu opened on the current directory uses the fresh parent permissions", async () => {
  const f = fixture("cloudreve://share/link");
  const parent = { ...fullChild, id: "root", path: "cloudreve://share/link", type: 1 };
  selectWithMenu(f, [parent]);
  const fresh = { ...parent, permission: "IA==" };
  const request = f.dispatch(f.thunks.navigateReconcile(0));
  f.respond({ ...listing(), parent: fresh });
  await request;
  assert.equal(f.manager().contextMenuOpen, true);
  assert.equal(f.manager().contextMenuTargets[parent.path].permission, fresh.permission);
});

test("removing a file locally also invalidates its selected and explicit menu targets", () => {
  const f = fixture("cloudreve://share/link");
  selectWithMenu(f, [fullChild]);
  f.dispatch(f.actions.setFileList({ index: 0, value: [] }));
  assert.equal(Object.keys(f.manager().selected).length, 0);
  assert.equal(f.manager().contextMenuOpen, false);
  assert.equal(f.manager().contextMenuTargets, undefined);
});

test("returning to an earlier path cannot mark retained rows as a completed navigation", () => {
  const f = fixture("cloudreve://share/link");
  f.dispatch(f.actions.applyListResponse({ index: 0, value: listing([fullChild]) }));
  assert.equal(f.manager().listPath, "cloudreve://share/link");
  for (const path of ["cloudreve://share/another", "cloudreve://share/link"]) {
    f.dispatch(f.actions.setPathProps({ index: 0, value: { path } }));
    assert.equal(f.manager().listPath, undefined);
  }
  assert.ok(f.manager().list);
});

test("password retry preserves share identity without logging credentials", async () => {
  const f = fixture("cloudreve://link@share/folder?default_share_identity=42%3Astamp");
  await f.dispatch(f.thunks.retrySharePassword(0, "fixture-password"));
  assert.equal(f.navigations.length, 1);
  const target = new URL(new URL(f.navigations[0], "https://example.test").searchParams.get("path"));
  assert.equal(target.password, "fixture-password");
  assert.equal(target.searchParams.get("default_share_identity"), "42:stamp");
  assert.deepEqual(f.logs, []);
});
