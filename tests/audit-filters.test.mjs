import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture } from "./component-fixture.mjs";

const initial = { user: "u1", file: "f1", ip: "", correlation_id: "" };

function fixture() {
  const applied = [];
  let resets = 0,
    closes = 0;
  const props = {
    open: true,
    value: initial,
    categories: [1],
    onApply: (value, categories) => applied.push({ value, categories }),
    onReset: () => resets++,
    onClose: () => closes++,
  };
  const f = componentFixture("src/component/Admin/Event/AuditFilterPopover.tsx", props, {
    "../../Common/StyledComponents": { DenseFilledTextField: "DenseField" },
    "../../Pages/Setting/SettingForm": { __esModule: true, default: "SettingForm" },
    "./AuditCategorySelect": { __esModule: true, default: "CategorySelect" },
  });
  f.render(props);
  return {
    ...f,
    props,
    applied,
    counts: () => ({ resets, closes }),
    field: (name) =>
      f.find((node) => node.type === "DenseField" && node.props.inputProps["aria-label"] === `audit.${name}`),
  };
}

test("audit filters keep a draft until Apply, including category selection", () => {
  const f = fixture();
  f.field("user").props.onChange({ target: { value: "u2" } });
  f.find((node) => node.type === "CategorySelect").props.onChange([2, 3]);
  f.render(f.props);
  assert.equal(f.applied.length, 0);
  let prevented = false;
  f.find((node) => node.props.component === "form").props.onSubmit({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(f.applied[0].value.user, "u2");
  assert.deepEqual(Array.from(f.applied[0].categories), [2, 3]);
  assert.deepEqual(f.counts(), { resets: 0, closes: 1 });
  f.unmount();
});

test("dismissed audit drafts are discarded on reopen, and Reset is explicit", () => {
  const f = fixture();
  f.field("user").props.onChange({ target: { value: "discarded" } });
  f.render(f.props);
  f.find((node) => node.type === "Popover").props.onClose({}, "escapeKeyDown");
  assert.equal(f.applied.length, 0);
  f.render({ ...f.props, open: false });
  const reopened = { ...f.props, value: { ...initial, user: "u3" }, categories: [4] };
  f.render(reopened);
  f.render(reopened);
  assert.equal(f.field("user").props.value, "u3");
  assert.deepEqual(Array.from(f.find((node) => node.type === "CategorySelect").props.value), [4]);
  f.find((node) => node.type === "Button" && node.props.children === "audit.reset").props.onClick();
  assert.equal(f.applied.length, 0);
  assert.deepEqual(f.counts(), { resets: 1, closes: 2 });
  f.unmount();
});
