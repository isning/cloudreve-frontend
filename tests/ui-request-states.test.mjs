import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture } from "./component-fixture.mjs";

const tick = () => new Promise(setImmediate);
const visual = new Proxy({}, { get: (_, key) => String(key) });
const icon = { __esModule: true, default: "Icon" };
const dialog = { __esModule: true, default: "DraggableDialog", StyledDialogActions: "DialogActions" };
function auditFixture() {
  let query = "";
  const requests = [];
  const dispatch = (request) => new Promise((resolve, reject) => requests.push({ request, resolve, reject }));
  const modules = {
    "../../../api/audit": {
      getAuditLogs: (args) => ({ kind: "list", args }),
      deleteAuditLogs: (ids) => ({ kind: "delete", ids }),
    },
    "../../../redux/hooks": { useAppDispatch: () => dispatch },
    "../../../redux/thunks/dialog": { confirmOperation: () => ({ kind: "confirm" }) },
    "../../../util/audit": { getEventName: () => "event" },
    "../../Common/StyledComponents": visual,
    "../../Pages/PageContainer": icon,
    "../../Pages/PageHeader": icon,
    "./AuditArchiveDialog": icon,
    "./AuditFilterPopover": {
      __esModule: true,
      default: "AuditFilterPopover",
      auditFilterFields: ["user", "file", "ip", "correlation_id"],
    },
    "../Common/TablePagination": { __esModule: true, default: "TablePagination" },
    "../../Dialogs/DraggableDialog": dialog,
    "@mui/lab": { LoadingButton: "LoadingButton" },
    "react-router-dom": {
      useSearchParams: () => [
        new URLSearchParams(query),
        (next) => {
          query = next.toString();
        },
      ],
    },
  };
  for (const name of ["ArrowSync", "Filter", "Download", "Broom", "Delete", "Info", "MoreHorizontal"])
    modules[`../../Icons/${name}`] = icon;
  const f = componentFixture("src/component/Admin/Event/AuditLogList.tsx", {}, modules, { URLSearchParams });
  return {
    ...f,
    requests,
    query: () => query,
    page: (page) => {
      query = `page=${page}`;
      f.render();
      f.render();
    },
    selectable: () =>
      f.findAll(
        (node) =>
          node.type === "Checkbox" &&
          node.props.inputProps?.["aria-label"] === "audit.selectEvent" &&
          !node.props.disabled,
      ),
  };
}
const pageA = { logs: [{ id: 11, edges: {}, content: { category: 0 } }], pagination: { total_items: 30 } };
test("audit filter application and reset preserve sort while returning to page one", () => {
  const f = auditFixture();
  f.find((node) => node.type === "AuditFilterPopover").props.onApply(
    { user: "u1", file: "", ip: "127.0.0.1", correlation_id: "trace" },
    [1, 2],
  );
  f.render();
  const params = new URLSearchParams(f.query());
  assert.equal(params.get("user"), "u1");
  assert.equal(params.get("ip"), "127.0.0.1");
  assert.equal(params.get("category"), "1,2");
  assert.equal(params.get("page"), "1");
  assert.equal(f.find((node) => node.type === "Badge").props.invisible, false);
  f.find((node) => node.type === "TableSortLabel").props.onClick();
  f.render();
  const order = new URLSearchParams(f.query()).get("order_direction");
  f.find((node) => node.type === "AuditFilterPopover").props.onReset();
  f.render();
  const reset = new URLSearchParams(f.query());
  assert.equal(reset.get("user"), null);
  assert.equal(reset.get("category"), null);
  assert.equal(reset.get("order_direction"), order);
  assert.equal(reset.get("page"), "1");
  assert.equal(f.find((node) => node.type === "Badge").props.invisible, true);
  f.unmount();
});
test("audit page replacement never leaves old rows selectable or selected", async () => {
  const f = auditFixture();
  f.requests.shift().resolve(pageA);
  await tick();
  f.render();
  assert.equal(f.selectable().length, 1);
  f.selectable()[0].props.onChange(null, true);
  f.render();
  f.page(2);
  assert.equal(f.selectable().length, 0);
  f.requests.shift().resolve({ ...pageA, logs: [{ ...pageA.logs[0], id: 22 }] });
  await tick();
  f.render();
  assert.equal(f.selectable().length, 1);
  assert.equal(f.selectable()[0].props.checked, false);
  f.page(3);
  f.requests.shift().reject(Error("network"));
  await tick();
  f.render();
  assert.equal(f.selectable().length, 0);
  assert.ok(f.find((node) => node.type === "Alert" && node.props.children === "audit.loadFailed"));
  f.unmount();
});
test("failed audit load does not also claim a successful empty result", async () => {
  const f = auditFixture();
  f.requests.shift().reject(Error("network"));
  await tick();
  f.render();
  assert.ok(f.find((node) => node.type === "Alert"));
  assert.equal(
    f.find((node) => node.props.children === "audit.empty"),
    undefined,
  );
  f.unmount();
});

for (const name of ["BindPolicy", "Relocate"]) {
  test(`${name} distinguishes a failed policy request, retries in place, and recognizes a true empty list`, async () => {
    const requests = [];
    const target = {
      owner: "one",
      file: { path: "cloudreve://my/folder", extended_info: {} },
      files: [{ path: "cloudreve://my/folder" }],
    };
    const state = { globalState: { bindPolicyDialog: target, relocateDialog: target } };
    const f = componentFixture(
      `src/component/FileManager/Dialogs/${name}.tsx`,
      {},
      {
        "../../../api/api.ts": { getAvailableStoragePolicies: () => ({}) },
        "../../../api/request.ts": { AppError: Error, Code: {} },
        "../../../api/user.ts": { GroupPermission: {} },
        "../../../redux/globalStateSlice.ts": {},
        "../../../redux/hooks.ts": { useAppDispatch: () => dispatch, useAppSelector: (select) => select(state) },
        "../../../redux/thunks/filemanager.ts": {},
        "../../../session": {
          __esModule: true,
          default: {
            currentLoginOrNull: () => ({ user: { id: "one" } }),
            currentUserGroupPermission: () => ({ enabled: () => true }),
          },
        },
        "../../../util/uri.ts": {
          __esModule: true,
          default: class {
            is_root() {
              return false;
            }
          },
        },
        "../../Common/Snackbar/snackbar.tsx": {},
        "../../Dialogs/DraggableDialog.tsx": dialog,
        notistack: { useSnackbar: () => ({ enqueueSnackbar() {} }) },
      },
    );
    function dispatch() {
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    }
    requests.shift().reject(Error("network"));
    await tick();
    f.render();
    assert.ok(f.find((node) => node.type === "Alert" && node.props.severity === "error"));
    assert.equal(
      f.find((node) => node.props.children === "uploader.noAvailablePolicies"),
      undefined,
    );
    f.find((node) => node.type === "Button" && node.props.children === "uploader.retryPolicies").props.onClick();
    f.render();
    f.render();
    requests.shift().resolve([{ id: "new", name: "Current destination" }]);
    await tick();
    f.render();
    assert.equal(
      f.find((node) => node.type === "Alert"),
      undefined,
    );
    assert.ok(f.find((node) => node.type === "MenuItem" && node.props.value === "new"));
    state.globalState[name === "BindPolicy" ? "bindPolicyDialog" : "relocateDialog"] = { ...target };
    f.render();
    f.render();
    requests.shift().resolve([]);
    await tick();
    f.render();
    assert.ok(f.find((node) => node.props.children === "uploader.noAvailablePolicies"));
    assert.equal(
      f.find((node) => node.type === "Alert"),
      undefined,
    );
    f.unmount();
  });
}

for (const transition of ["query", "unmount"]) {
  test(`audit confirmation cannot delete captured rows after ${transition}`, async () => {
    const f = auditFixture();
    f.requests.shift().resolve(pageA);
    await tick();
    f.render();
    f.selectable()[0].props.onChange(null, true);
    f.render();
    const action = f.find(
      (node) => node.type === "LoadingButton" && node.props.children?.props?.children === "audit.deleteSelected",
    );
    const pending = action.props.onClick();
    const confirmation = f.requests.shift();
    assert.equal(confirmation.request.kind, "confirm");
    if (transition === "query") {
      f.page(2);
      f.requests.shift().resolve({ ...pageA, logs: [{ ...pageA.logs[0], id: 22 }] });
      await tick();
      f.render();
    } else f.unmount();
    confirmation.resolve();
    await tick();
    assert.equal(f.requests.filter((r) => r.request.kind === "delete").length, 0);
    await pending;
    if (transition !== "unmount") f.unmount();
  });
}

test("the native paginator does not redirect a requested page while its response is pending", async () => {
  const f = auditFixture();
  f.requests.shift().resolve(pageA);
  await tick();
  f.render();
  const paginationProps = () => f.find((node) => node.type === "TablePagination")?.props;
  const material = new Proxy(
    { useTheme: () => ({ breakpoints: { down: () => "mobile" } }), useMediaQuery: () => false },
    { get: (target, name) => target[name] ?? String(name) },
  );
  const child = componentFixture("src/component/Admin/Common/TablePagination.tsx", paginationProps(), {
    "@mui/material": material,
    "../../Common/StyledComponents": visual,
    "../../FileManager/ContextMenu/ContextMenu": { SquareMenuItem: "MenuItem" },
  });
  f.page(2);
  if (paginationProps()) child.render(paginationProps());
  else child.unmount();
  assert.equal(new URLSearchParams(f.query()).get("page"), "2");
  f.requests.shift().resolve({ ...pageA, logs: [{ ...pageA.logs[0], id: 22 }] });
  await tick();
  f.render();
  assert.equal(paginationProps().page, 2);
  assert.equal(paginationProps().totalItems, 30);
  f.unmount();
});
