import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

test("reselecting a resumed file retains its resolved policy without changing new uploads", async () => {
  const inputs = [];
  class Uploader {
    constructor(task) {
      this.task = task;
    }
  }
  class Logger {
    info() {}
    warn() {}
  }
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL("../src/component/Uploader/core/index.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    console,
    Event,
    window: { addEventListener() {} },
    require(name) {
      if (name === "./logger") return { __esModule: true, default: Logger };
      if (name === "./types") return { TaskType: { file: 0, resumeHint: 1 } };
      if (name.endsWith("api/explorer.ts")) return { PolicyType: { local: "local", load_balance: "load_balance" } };
      if (name === "./utils/pool")
        return {
          Pool: class {
            processing = [];
          },
        };
      if (name === "./utils")
        return {
          getFileInput() {
            const input = { click() {}, setAttribute() {}, removeAttribute() {} };
            inputs.push(input);
            return input;
          },
          getDirectoryUploadDst: (dst) => dst,
        };
      return { __esModule: true, default: Uploader };
    },
  });
  const manager = new module.exports.default({ logLevel: "INFO", concurrentLimit: 1, onToast() {} });
  const pool = { id: "pool", type: "load_balance" },
    child = { id: "child", type: "local" };
  manager.setPolicy(pool, "cloudreve://my/", true);
  const original = { policy: child, automaticPolicy: true, overwrite: false };
  const file = { name: "report.bin", size: 17 };
  async function select(resume) {
    const pending = manager.select("cloudreve://my/", 0, resume);
    const event = new Event("change");
    Object.defineProperty(event, "target", { value: { files: [file] } });
    inputs[0].onchange(event);
    return (await pending)[0].task;
  }
  const resumed = await select(original);
  assert.equal(resumed.policy.id, "child");
  assert.equal(resumed.file, file);
  assert.equal(resumed.size, 17);
  assert.equal(resumed.overwrite, false);
  assert.equal((await select()).policy.id, "pool");
});
