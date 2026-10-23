import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture } from "./component-fixture.mjs";

for (const raw of ["null-invalid", "null", "{}", "[0]", JSON.stringify(Array(101).fill(1))]) {
  test(`invalid saved defaults have an explicit repair to empty: ${raw.slice(0, 20)}`, () => {
    const context = {
      values: { default_symbolics: raw },
      setSettings: (patch) => Object.assign(context.values, patch),
    };
    const modules = {
      "react-router-dom": { Link: "Link" },
      "../../../../session/utils.ts": { isTrueVal: () => false },
      "../../../Common/SizeInput.tsx": { default: "SizeInput" },
      "../../../Common/StyledComponents.tsx": { DenseFilledTextField: "TextField", DenseSelect: "Select" },
      "../../../FileManager/ContextMenu/ContextMenu.tsx": { SquareMenuItem: "MenuItem" },
      "../../../Pages/Setting/SettingForm.tsx": { __esModule: true, default: "SettingForm", ProChip: "ProChip" },
      "../../../Common/Code.tsx": { Code: "Code" },
      "../../Common/GroupSelectionInput.tsx": { default: "GroupSelectionInput" },
      "../../Common/SharesInput.tsx": { default: "SharesInput" },
      "../Settings.tsx": {
        NoMarginHelperText: "HelperText",
        SettingSection: "Section",
        SettingSectionContent: "SectionContent",
      },
      "../SettingWrapper.tsx": { SettingContext: "SettingContext" },
      "./SSOSettings.tsx": { default: "SSOSettings" },
    };
    const f = componentFixture("src/component/Admin/Settings/UserSession/UserSession.tsx", {}, modules, {}, context);
    assert.equal(context.values.default_symbolics, raw, "render does not silently rewrite invalid configuration");
    const repair = f.find((node) => node.type === "Button" && node.props.children === "settings.clearDefaultShares");
    assert.ok(repair);
    repair.props.onClick();
    assert.equal(context.values.default_symbolics, "[]");
    f.render();
    assert.equal(
      f.find((node) => node.type === "Button" && node.props.children === "settings.clearDefaultShares"),
      undefined,
    );
  });
}
