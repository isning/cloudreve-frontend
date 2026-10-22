import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL("../src/util/uri.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  {
    module,
    exports: module.exports,
    URL,
    require(name) {
      if (name === "path-browserify") return path.posix;
      if (name.includes("explorer")) return { FileType: { folder: 1, file: 0 }, Metadata: {} };
      if (name.includes("session")) return { currentLoginOrNull: () => null };
      throw Error(name);
    },
  },
);
const CrUri = module.exports.default;
const identity = "42:2026-10-22T00:00:00Z";
const uri = () => new CrUri("cloudreve://link@share/folder/child").addQuery("default_share_identity", identity);
const guarded = (value) => assert.deepEqual(new CrUri(value).query("default_share_identity"), [identity]);

test("share identity survives breadcrumb, root and child navigation without becoming search state", () => {
  const current = uri();
  assert.equal(current.is_search(), false);
  assert.equal(current.searchParams(), undefined);
  guarded(current.pure_uri().toString());
  guarded(current.pure_uri("category").parent().toString());
  guarded(current.base());
  guarded(current.pure_uri("category").base(false));
  guarded(current.join("descendant").toString());
});

test("replacing and clearing search preserves identity and removes every old search field", () => {
  const current = uri().addQuery("name", "old").addQuery("type", "file").addQuery("category", "image");
  current.setSearchParam({ name: ["new"] });
  guarded(current.toString());
  assert.deepEqual(current.query("name"), ["new"]);
  assert.deepEqual(current.query("type"), []);
  assert.deepEqual(current.query("category"), []);
  assert.equal(current.is_search(), true);
  current.setSearchParam({});
  guarded(current.toString());
  assert.equal(current.is_search(), false);
});
