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
const flush = () => new Promise(setImmediate);
const Code = { PermissionDenied: 403, NodeFound: 404 };
class AppError extends Error {
  ErrorResponse() {
    return {};
  }
}

async function scenario(eventsEnabled) {
  let state;
  const requests = [];
  const opened = [];
  const timers = [];
  const finalizers = [];
  let slots;
  let cursor;
  const componentHooks = new Map();
  function render(component, ...args) {
    slots = componentHooks.get(component) ?? [];
    componentHooks.set(component, slots);
    cursor = 0;
    return component(...args);
  }
  const react = {
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      previous?.cleanup?.();
      slots[index] = { deps, cleanup: effect() };
    },
  };
  const fakeWindow = {
    location: { href: "https://cloudreve.test/home?path=cloudreve%3A%2F%2Fmy%2Fnext&open=target" },
    history: {
      replaceState(_state, _title, href) {
        fakeWindow.location.href = href;
      },
    },
    matchMedia: () => ({ matches: false }),
  };
  const session = {
    currentLoginOrNull: () => ({ user: { id: "viewer" } }),
    getWithFallback: () => 20,
    currentUser: () => ({ group: {} }),
    currentUserGroupPermission: () => ({ enabled: () => false }),
  };
  const cache = new Map();
  function load(filename) {
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
        atob,
        btoa,
        console,
        window: fakeWindow,
        AbortController,
        TextDecoder,
        setTimeout(callback, delay) {
          const timer = { callback, delay };
          timers.push(timer);
          return timer;
        },
        clearTimeout(timer) {
          const index = timers.indexOf(timer);
          if (index >= 0) timers.splice(index, 1);
        },
        async fetch() {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("event: subscribed\ndata: {}\n\n"));
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
        require(id) {
          if (["dayjs", "path-browserify", "@reduxjs/toolkit"].includes(id)) return resolveModule(id);
          if (id === "react") return react;
          if (id.endsWith("/session")) return { __esModule: true, default: session, UserSettings: {} };
          if (id.endsWith("/request.ts") || id.endsWith("/request"))
            return {
              Code,
              AppError,
              ApiPrefix: "/api/v4",
              getAccessToken: () => async () => "Bearer same-token",
            };
          if (id.endsWith("/hooks") || id.endsWith("/hooks.ts"))
            return { useAppDispatch: () => dispatch, useAppSelector: (select) => select(state) };
          if (id.endsWith("/explorer.ts") || id.endsWith("/explorer")) return load("src/api/explorer.ts");
          if (id.endsWith("/uri.ts") || id.endsWith("/uri")) return load("src/util/uri.ts");
          if (id.endsWith("/boolset.ts") || id.endsWith("/boolset")) return load("src/util/boolset.ts");
          if (id.endsWith("/permission")) return load("src/util/permission.ts");
          if (id.endsWith("/FileManager.tsx")) return { FileManagerIndex: { main: 0, selector: 1 } };
          if (id.endsWith("/user.ts")) return { GroupPermission: {} };
          if (id.endsWith("/fileManagerSlice.ts")) return load("src/redux/fileManagerSlice.ts");
          if (id.endsWith("/filemanager") || id.endsWith("/filemanager.ts"))
            return load("src/redux/thunks/filemanager.ts");
          if (id.endsWith("/globalStateSlice.ts"))
            return { setShareReadmeDetect: (value) => ({ type: "readme", value }) };
          if (id.endsWith("/api.ts"))
            return { getFileList: (params) => () => new Promise((respond) => requests.push({ params, respond })) };
          if (id.endsWith("/file.ts")) return { openFile: (_index, file) => () => opened.push(file.id) };
          if (id.endsWith("/ViewOptionPopover.tsx")) return { MinPageSize: 20 };
          if (id.endsWith("/PaginationFooter.tsx")) return { getPaginationState: () => ({ moreItems: false }) };
          if (id.endsWith("/util"))
            return {
              sleep: () => Promise.resolve(),
              fileExtension: () => "txt",
              uuidv4: () => "same-client",
              useQuery: () => new URL(fakeWindow.location.href).searchParams,
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
    siteConfig: { explorer: { config: {} } },
    globalState: {},
  };
  function dispatch(action) {
    if (typeof action === "function") return action(dispatch, () => state);
    state = { ...state, fileManager: reducer(state.fileManager, action) };
    return action;
  }
  const listing = (path, files = []) => ({
    parent: { id: path, path, type: 1, permission: "Pw==" },
    files,
    pagination: { page: 0, page_size: 20, total_items: files.length },
  });
  dispatch(actions.applyListResponse({ index: 0, value: listing("cloudreve://my/previous") }));
  dispatch(actions.setPathProps({ index: 0, value: { path: "cloudreve://my/next", current_fs: "my" } }));
  // Execute the complete production call site: on the new path its navigation
  // request is the one completion that consumes the viewer-open query.
  const useNavigation = load("src/hooks/useNavigation.tsx").default;
  render(useNavigation, 0);
  assert.equal(requests.length, 1);
  const fileEvents = load("src/hooks/useFileEvents.ts").default;
  render(fileEvents, 0, eventsEnabled);
  await flush();
  if (eventsEnabled) {
    const reloadIndex = timers.findIndex((timer) => timer.delay === 100);
    if (reloadIndex >= 0) {
      const [timer] = timers.splice(reloadIndex, 1);
      finalizers.push(timer.callback());
    }
  }
  const target = { id: "target", path: "cloudreve://my/next/target.txt", type: 0, name: "target.txt" };
  const result = listing("cloudreve://my/next", [target]);
  requests[0].respond(result);
  await flush();
  if (requests[1]) {
    requests[1].respond(result);
    await Promise.all(finalizers);
  }
  render(useNavigation, 0);
  render(fileEvents, 0, eventsEnabled);
  await flush();
  for (const hooks of componentHooks.values()) {
    for (const hook of hooks) hook?.cleanup?.();
  }
  assert.equal(state.fileManager[0].list.files[0].id, "target");
  assert.equal(new URL(fakeWindow.location.href).searchParams.has("open"), false);
  assert.equal(requests.length, 1, "SSE must wait for the new directory listing before subscribing");
  return opened;
}

for (const enabled of [false, true]) {
  test(`in-app deep-link navigation opens its file with SSE ${enabled ? "enabled" : "disabled"}`, async () => {
    assert.deepEqual(await scenario(enabled), ["target"]);
  });
}
