import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture, loadTS } from "./component-fixture.mjs";

const Boolset = loadTS("src/util/boolset.ts").default;
function fixture(initial) {
  let value = initial;
  const props = () => ({
    value,
    onChange: (next) => {
      value = next;
    },
  });
  const f = componentFixture(
    "src/component/FileManager/Dialogs/Share/PermissionEditor.tsx",
    props(),
    {
      "../../../../api/api": {},
      "../../../../api/permission": {},
      "../../../../api/explorer": { FilePermission: { read: 0, update: 1, create: 2, delete: 3, share: 4, list: 5 } },
      "../../../../api/user": { GroupPermission: { is_admin: 0, set_anonymous_permission: 14 } },
      "../../../../redux/hooks": { useAppDispatch: () => () => Promise.resolve([]) },
      "../../../../session": {
        __esModule: true,
        default: {
          currentLoginOrNull: () => ({ user: { id: "owner" } }),
          currentUserGroupPermission: () => ({ enabled: () => false }),
        },
      },
      "../../../../util/boolset": { __esModule: true, default: Boolset },
    },
    { setTimeout, clearTimeout },
  );
  return {
    checkbox: (audience, capability) =>
      f.find(
        (node) =>
          node.type === "Checkbox" &&
          node.props.inputProps["aria-label"] === `sharing.${audience}: sharing.${capability}`,
      ),
    render: () => f.render(props()),
    value: () => value,
  };
}

test("restricted owners can reduce an existing anonymous grant without changing other audiences", () => {
  const f = fixture({ everyone: "Lw==", anonymous: "Lw==", user_explicit: { visitor: "IQ==" } });
  const update = f.checkbox("anonymous", "update");
  assert.equal(update.props.disabled, false);
  update.props.onChange(null, false);
  f.render();
  assert.equal(new Boolset(f.value().anonymous).enabled(1), false);
  assert.equal(f.value().everyone, "Lw==");
  assert.equal(f.value().user_explicit.visitor, "IQ==");
  assert.equal(f.checkbox("anonymous", "delete").props.disabled, false);
  const readonly = fixture({ everyone: "Lw==", anonymous: "IQ==" });
  assert.equal(readonly.checkbox("anonymous", "update").props.disabled, true);
});

test("authenticated Everyone can delegate while explicit Anonymous stays read-only", () => {
  const f = fixture({ everyone: "IQ==", anonymous: "IQ==" });
  const share = f.checkbox("everyone", "share");
  assert.equal(share.props.disabled, false);
  share.props.onChange(null, true);
  assert.equal(new Boolset(f.value().everyone).enabled(4), true);
  assert.equal(f.value().anonymous, "IQ==");
  assert.equal(f.checkbox("anonymous", "share").props.disabled, true);
});
