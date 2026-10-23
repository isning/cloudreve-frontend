import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture } from "./component-fixture.mjs";

const tick = () => new Promise(setImmediate);
const stub = (name) => ({ __esModule: true, default: name });
const visual = new Proxy({}, { get: (_, key) => String(key) });

function tasksFixture() {
  const requests = [];
  const dispatch = (request) => new Promise((resolve, reject) => requests.push({ request, resolve, reject }));
  const f = componentFixture(
    "src/component/Pages/Tasks/TaskList.tsx",
    {},
    {
      "../../../api/workflow.ts": { ListTaskCategory: { general: "general" } },
      "../../../api/api.ts": { getTasks: (args) => args },
      "../../../redux/hooks.ts": { useAppDispatch: () => dispatch, useAppSelector: () => undefined },
      "../../../session": stub({ currentLoginOrNull: () => null }),
      "../PageHeader.tsx": stub("PageHeader"),
      "../PageContainer.tsx": stub("PageContainer"),
      "../../Common/Nothing.tsx": stub("Nothing"),
      "./TaskCard.tsx": stub("TaskCard"),
    },
    { setInterval: () => 1, clearInterval() {} },
  );
  return { ...f, requests };
}

test("task load failure is distinct from empty and retries the original request", async () => {
  const f = tasksFixture();
  f.find((n) => n.type === "TaskCard" && n.props.onLoad).props.onLoad();
  f.requests.shift().reject(Error("offline"));
  await tick();
  f.render();
  assert.ok(f.find((n) => n.type === "Alert"));
  assert.equal(
    f.find((n) => n.type === "Nothing"),
    undefined,
  );
  assert.equal(
    f.find((n) => n.type === "TaskCard" && n.props.onLoad),
    undefined,
  );
  f.find((n) => n.type === "Button" && n.props.children === "uploader.retry").props.onClick();
  f.render();
  assert.equal(
    f.find((n) => n.type === "TaskCard" && n.props.onLoad),
    undefined,
  );
  assert.ok(f.find((n) => n.type === "LinearProgress"));
  f.requests.shift().resolve({ tasks: [], pagination: {} });
  await tick();
  f.render();
  assert.equal(
    f.find((n) => n.type === "Alert"),
    undefined,
  );
  assert.ok(f.find((n) => n.type === "Nothing"));
  f.unmount();
});

test("task pagination failure preserves visible tasks and retries the same cursor", async () => {
  const f = tasksFixture();
  f.find((n) => n.type === "TaskCard" && n.props.onLoad).props.onLoad();
  f.requests.shift().resolve({ tasks: [{ id: "first" }], pagination: { next_token: "cursor-2" } });
  await tick();
  f.render();
  f.find((n) => n.type === "TaskCard" && n.props.onLoad).props.onLoad();
  f.requests.shift().reject(Error("offline"));
  await tick();
  f.render();
  assert.ok(f.find((n) => n.type === "Alert"));
  assert.deepEqual(
    f.findAll((n) => n.type === "TaskCard" && n.props.task).map((n) => n.props.task.id),
    ["first"],
  );
  f.find((n) => n.type === "Button" && n.props.children === "uploader.retry").props.onClick();
  const retry = f.requests.shift();
  assert.equal(retry.request.next_page_token, "cursor-2");
  retry.resolve({ tasks: [{ id: "second" }], pagination: {} });
  await tick();
  f.render();
  assert.deepEqual(
    f.findAll((n) => n.type === "TaskCard" && n.props.task).map((n) => n.props.task.id),
    ["first", "second"],
  );
  f.unmount();
});

test("group policy failure disables edits, preserves selected IDs and retries in place", async () => {
  const requests = [],
    changes = [];
  const dispatch = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  const f = componentFixture(
    "src/component/Admin/Group/EditGroup/PolicySelectionInput.tsx",
    {
      value: [9, 4],
      onChange: (value) => changes.push(value),
    },
    {
      "@mui/icons-material": visual,
      "../../../../api/api": { getStoragePolicyList: () => ({}) },
      "../../../../redux/hooks": { useAppDispatch: () => dispatch },
      "../../../Common/CircularProgress": stub("Progress"),
      "../../../Common/StyledComponents": visual,
      "../../../FileManager/ContextMenu/ContextMenu": visual,
    },
  );
  requests.shift().reject(Error("offline"));
  await tick();
  f.render();
  assert.ok(f.find((n) => n.type === "Alert"));
  assert.equal(f.find((n) => n.type === "DenseSelect").props.disabled, true);
  assert.ok(f.findAll((n) => n.type === "IconButton").every((n) => n.props.disabled));
  assert.deepEqual(changes, []);
  f.find((n) => n.type === "Button").props.onClick();
  f.render();
  requests.shift().resolve({
    policies: [
      { id: 9, name: "Nine" },
      { id: 4, name: "Four" },
    ],
  });
  await tick();
  f.render();
  assert.equal(
    f.find((n) => n.type === "Alert"),
    undefined,
  );
  assert.equal(f.find((n) => n.type === "DenseSelect").props.disabled, false);
  assert.deepEqual(Array.from(f.find((n) => n.type === "DenseSelect").props.value), [9, 4]);
  assert.deepEqual(changes, []);
  f.unmount();
});
