import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture, loadTS } from "./component-fixture.mjs";

const FilePermission = { read: 0, update: 1, list: 5 };
const Boolset = loadTS("src/util/boolset.ts").default;
const permissions = loadTS("src/util/permission.ts", {
  "../api/explorer": { FilePermission },
  "./boolset": { __esModule: true, default: Boolset },
  "./uri": {},
});

test("activity remains visible without offering version content to list+update collaborators", async () => {
  const calls = [];
  const dispatch = (action) => {
    calls.push(action);
    return Promise.resolve({ activities: [{ id: "event", version_id: "version", content: {}, created_at: "2026-01-01T00:00:00Z" }], pagination: {} });
  };
  const target = { path: "cloudreve://share/link/file", permission: "Ig==" };
  const f = componentFixture("src/component/FileManager/Sidebar/Activities.tsx", { target }, {
    "../../../api/audit": { getFileActivities: (request) => request },
    "../../../api/explorer": { FilePermission },
    "../../../redux/globalStateSlice": { setVersionControlDialog: (value) => ({ dialog: value }) },
    "../../../redux/hooks": { useAppDispatch: () => dispatch },
    "../../../util/audit": { getEventName: () => "event" },
    "../../../util/permission": permissions,
    "../../../util/uri": {},
    "../../Common/StyledComponents": { SecondaryButton: "SecondaryButton" },
    "../../Icons/ArrowSort": { __esModule: true, default: "Icon" },
    "../../Icons/ArrowSync": { __esModule: true, default: "Icon" },
  }, { AbortController });
  await new Promise(setImmediate);
  const versionButtons = () => f.findAll((node) => node.type === "Button" && node.props.children === "audit.openVersion");
  f.render();
  assert.equal(versionButtons().length, 0);
  assert.ok(f.find((node) => node.type === "time" || node.props.component === "time"));
  f.render({ target: { ...target, permission: "Iw==" } });
  assert.equal(versionButtons().length, 1);
  versionButtons()[0].props.onClick();
  assert.equal(calls.at(-1).dialog.highlight, "version");
  f.render({ target });
  assert.equal(versionButtons().length, 0);
  f.unmount();
});
