import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute production components; only rendering, session and HTTP are controlled.
function fixture(filename, props = {}) {
  let actor = "one",
    cursor = 0,
    tree,
    effects = [];
  const hooks = [],
    requests = [],
    timers = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      hooks[i] ??= { value: initial };
      return [
        hooks[i].value,
        (v) => {
          hooks[i].value = v;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      hooks[i] ??= { current: initial };
      return hooks[i];
    },
    useEffect(fn, deps) {
      const i = cursor++,
        old = hooks[i];
      if (!old || !same(deps, old.deps))
        effects.push(() => {
          old?.cleanup?.();
          hooks[i] = { deps, cleanup: fn() };
        });
    },
  };
  const dispatch = (args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "@mui/lab": { LoadingButton: "LoadingButton" },
    "@mui/material": Object.fromEntries(
      ["Alert", "Button", "Stack", "Typography", "Autocomplete", "Chip"].map((n) => [n, n]),
    ),
    "react-i18next": { useTranslation: () => ({ t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }) },
  };
  const code = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (modules[name]) return modules[name];
      if (name.endsWith("api.ts"))
        return { sendAddDefaultShares: () => ({ kind: "add" }), getShareList: (args) => args };
      if (name.endsWith("hooks.ts")) return { useAppDispatch: () => dispatch };
      if (name.endsWith("session"))
        return { __esModule: true, default: { currentLoginOrNull: () => ({ user: { id: actor } }) } };
      if (name.includes("StyledComponents")) return { DenseFilledTextField: "TextField" };
      if (name.includes("SettingForm")) return { __esModule: true, default: "SettingForm" };
      throw Error(name);
    },
    setTimeout(fn) {
      const id = timers.size + 1;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  const render = () => {
    cursor = 0;
    effects = [];
    tree = module.exports.default(props);
    for (const fn of effects) fn();
  };
  const find = (type, node = tree) => {
    if (!node || typeof node !== "object") return;
    if (node.type === type) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      if (!child || typeof child !== "object") continue;
      const found = find(type, child);
      if (found) return found;
    }
  };
  render();
  return {
    requests,
    render,
    find,
    actor(v) {
      actor = v;
    },
    unmount() {
      for (const hook of hooks) hook?.cleanup?.();
    },
    flushTimers() {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const user = "src/component/Pages/Setting/DefaultShares.tsx";
const admin = "src/component/Admin/Common/SharesInput.tsx";

test("explicit add prevents double submit and displays server counts", async () => {
  const f = fixture(user),
    click = f.find("LoadingButton").props.onClick;
  const pending = click();
  await click();
  assert.equal(f.requests.length, 1);
  f.render();
  assert.equal(f.find("LoadingButton").props.loading, true);
  f.requests[0].resolve({ added: 2, existing: 1, skipped: 3 });
  await pending;
  f.render();
  assert.equal(f.find("LoadingButton").props.loading, false);
  assert.match(f.find("Alert").props.children, /"added":2/);
});
test("failed add permits retry and switched account discards old result", async () => {
  const f = fixture(user);
  let pending = f.find("LoadingButton").props.onClick();
  f.requests[0].reject(Error("business error"));
  await pending;
  f.render();
  assert.equal(f.find("Alert").props.severity, "error");
  pending = f.find("LoadingButton").props.onClick();
  f.actor("two");
  f.requests[1].resolve({ added: 1, existing: 0, skipped: 0 });
  await pending;
  f.render();
  assert.equal(f.find("Alert"), undefined);
});
test("unmounted settings discard a late success", async () => {
  const f = fixture(user),
    pending = f.find("LoadingButton").props.onClick();
  f.unmount();
  f.requests[0].resolve({ added: 1, existing: 0, skipped: 0 });
  await pending;
  f.render();
  assert.equal(f.find("Alert"), undefined);
});
test("selector preserves unavailable IDs and only changes on explicit selection", async () => {
  const changes = [],
    f = fixture(admin, { value: [7, 9], onChange: (ids) => changes.push(Array.from(ids)) });
  assert.equal(changes.length, 0);
  f.requests[0].resolve({ shares: [{ id: 7, edges: { file: { name: "Welcome" } } }] });
  await tick();
  f.render();
  const input = f.find("Autocomplete");
  assert.match(input.props.getOptionLabel(7), /Welcome/);
  assert.match(input.props.getOptionLabel(9), /unavailableShare/);
  assert.deepEqual(Array.from(input.props.value), [7, 9]);
  input.props.onChange(null, [7, 7]);
  assert.deepEqual(changes, [[7]]);
});
test("selector error preserves IDs and a new search retries", async () => {
  const f = fixture(admin, { value: [9], onChange: () => {} });
  f.requests[0].reject(Error("network"));
  await tick();
  f.render();
  assert.equal(f.find("Alert").props.severity, "warning");
  f.find("Autocomplete").props.onInputChange(null, "12", "input");
  f.render();
  f.flushTimers();
  f.requests[1].resolve({ shares: [{ id: 12, edges: { file: { name: "New" } } }] });
  await tick();
  f.render();
  assert.equal(f.find("Alert").props.severity, "warning");
  f.find("Button").props.onClick();
  f.render();
  f.requests[2].resolve({ shares: [{ id: 9, edges: { file: { name: "Recovered selection" } } }] });
  await tick();
  f.render();
  assert.equal(f.find("Alert"), undefined);
  assert.deepEqual(Array.from(f.find("Autocomplete").props.value), [9]);
});
test("unused pinned-share stub stays disabled without HTTP", () => {
  const f = fixture(admin);
  f.flushTimers();
  assert.equal(f.requests.length, 0);
  assert.equal(f.find("Autocomplete").props.disabled, true);
});

test("selector labels expired and exhausted saved shares without removing them", async () => {
  const f = fixture(admin, { value: [7, 8, 9], onChange() {} });
  f.requests[0].resolve({
    shares: [
      { id: 7, expires: "2000-01-01T00:00:00Z", edges: { file: { name: "Expired" } } },
      { id: 8, remain_downloads: 0, edges: { file: { name: "Exhausted" } } },
      { id: 9, remain_downloads: 1, edges: { file: { name: "Available" } } },
    ],
  });
  await tick();
  f.render();
  const input = f.find("Autocomplete");
  assert.match(input.props.getOptionLabel(7), /unavailableShare/);
  assert.match(input.props.getOptionLabel(8), /unavailableShare/);
  assert.match(input.props.getOptionLabel(9), /Available/);
  assert.deepEqual(Array.from(input.props.value), [7, 8, 9]);
});
