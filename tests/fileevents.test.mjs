import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const frontend = fileURLToPath(new URL("..", import.meta.url));
const resolveModule = createRequire(import.meta.url);
const flush = () => new Promise(setImmediate);

function businessError(code, status = 200) {
  return new Response(JSON.stringify({ code, msg: "Native API error" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function subscribed() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: subscribed\ndata: {}\n\n"));
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

// Execute the complete production hook, URI and permission modules. The React
// lifecycle, clock and transport are controlled so reconnect/cleanup races do
// not require wall-clock sleeps or an external identity provider.
function fixture(fetcher, onReload = () => {}) {
  let actor = "viewer";
  let authorization = "Bearer initial-token";
  let dependencies;
  let cleanup;
  let ref;
  let nextTimer = 0;
  let reloads = 0;
  const timers = new Map();
  const requests = [];
  const tokens = [];
  const state = {
    fileManager: [
      {
        path: "cloudreve://share/link",
        listPath: "cloudreve://share/link",
        list: { parent: { id: "root", type: 1, permission: "IQ==" } },
      },
    ],
  };
  const dispatch = (action) => action(dispatch, () => state);
  const cache = new Map();
  const load = (filename) => {
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
        AbortController,
        TextDecoder,
        atob,
        btoa,
        setTimeout(callback, delay) {
          const id = ++nextTimer;
          timers.set(id, { callback, delay });
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
        async fetch(url, options) {
          requests.push({ url, ...options });
          return fetcher(requests.length);
        },
        require(id) {
          if (id === "react") {
            return {
              useRef(value) {
                ref ??= { current: value };
                return ref;
              },
              useEffect(effect, next) {
                if (dependencies && next.every((value, i) => Object.is(value, dependencies[i]))) return;
                cleanup?.();
                dependencies = next;
                cleanup = effect();
              },
            };
          }
          if (id === "path-browserify") return resolveModule(id);
          if (id.endsWith("/request")) {
            return {
              ApiPrefix: "/api/v4",
              Code: { LockConflict: 40073, CodeLoginRequired: 401, CredentialInvalid: 40020 },
              getAccessToken: () => async () => {
                tokens.push(authorization);
                return authorization;
              },
            };
          }
          if (id.endsWith("/hooks")) {
            return { useAppDispatch: () => dispatch, useAppSelector: (select) => select(state) };
          }
          if (id.endsWith("/filemanager")) {
            return {
              navigateReconcile: () => async () => {
                reloads++;
                await onReload(state);
                render();
              },
            };
          }
          if (id.endsWith("/session")) {
            return { __esModule: true, default: { currentLoginOrNull: () => actor && { user: { id: actor } } } };
          }
          if (id.endsWith("/permission")) return load("src/util/permission.ts");
          if (id.endsWith("/boolset")) return load("src/util/boolset.ts");
          if (id.endsWith("/uri")) return load("src/util/uri.ts");
          if (id.endsWith("/explorer") || id.endsWith("/explorer.ts")) return load("src/api/explorer.ts");
          if (id.endsWith("/util")) return { uuidv4: () => "stable-client" };
          throw new Error(`Unexpected dependency: ${id}`);
        },
      },
      { filename },
    );
    return module.exports;
  };
  const hook = load("src/hooks/useFileEvents.ts").default;
  function render(enabled = true) {
    hook(0, enabled);
  }
  return {
    state,
    requests,
    tokens,
    reloads: () => reloads,
    delays: () => [...timers.values()].map((timer) => timer.delay),
    render,
    async tick(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        timers.delete(id);
        await timer.callback();
      }
      await flush();
    },
    setAuthorization(value) {
      authorization = value;
    },
    setActor(value) {
      actor = value;
    },
    unmount() {
      cleanup?.();
      cleanup = undefined;
      dependencies = undefined;
    },
  };
}

for (const [code, status] of [
  [401, 200],
  [40020, 200],
  [50005, 200],
  [50005, 503],
  [401, 401],
  [40073, 200],
]) {
  test(`SSE retries HTTP ${status}/business ${code} and resubscribes with current credentials`, async (t) => {
    const f = fixture((attempt) => (attempt === 1 ? businessError(code, status) : subscribed()));
    t.after(() => f.unmount());
    f.render();
    await flush();
    assert.equal(f.delays().filter((delay) => delay === 5000).length, 1);
    await f.tick(100);
    f.setAuthorization("Bearer fresh-token");
    // A successful listing preserves account, URI and root ID. It must not be
    // necessary to remount the effect to recover the event subscription.
    f.render();
    assert.equal(f.requests.length, 1);
    await f.tick(5000);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].headers.Authorization, "Bearer fresh-token");
    assert.equal(f.requests[1].headers["X-Cr-Client-Id"], f.requests[0].headers["X-Cr-Client-Id"]);
    await f.tick(100);
    assert.ok(f.reloads() >= 1);
    assert.equal(f.delays().includes(5000), false);
  });
}

test("temporary business failures retain exactly one delayed retry per attempt", async (t) => {
  const f = fixture(() => businessError(50005));
  t.after(() => f.unmount());
  f.render();
  await flush();
  for (let i = 0; i < 3; i++) {
    await f.tick(100);
    assert.deepEqual(f.delays(), [5000]);
    await f.tick(5000);
  }
  assert.equal(f.requests.length, 4);
  assert.equal(f.delays().filter((delay) => delay === 5000).length, 1);
});

for (const code of [403, 404, 40001, 40007, 40069]) {
  test(`permanent SSE business error ${code} reloads without a retry loop`, async (t) => {
    const f = fixture(() => businessError(code));
    t.after(() => f.unmount());
    f.render();
    await flush();
    await f.tick(100);
    await f.tick(5000);
    assert.equal(f.reloads(), 1);
    assert.equal(f.requests.length, 1);
    assert.equal(f.delays().length, 0);
  });
}

test("a list reload that confirms root revocation cancels the pending retry", async (t) => {
  const f = fixture(
    () => businessError(50005),
    (state) => {
      state.fileManager[0].list = undefined;
    },
  );
  t.after(() => f.unmount());
  f.render();
  await flush();
  await f.tick(100);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.delays().length, 0);
  await f.tick(5000);
  assert.equal(f.requests.length, 1);
});

for (const end of ["unmount", "sign-out", "disabled", "create-only"]) {
  test(`${end} cancels SSE business-error reload and retry timers`, async () => {
    const f = fixture(() => businessError(50005));
    f.render();
    await flush();
    if (end === "sign-out") f.setActor(null);
    if (end === "create-only") f.state.fileManager[0].list.parent.permission = "BA==";
    if (end === "unmount") f.unmount();
    else f.render(end !== "disabled");
    assert.equal(f.requests[0].signal.aborted, true);
    assert.equal(f.delays().length, 0);
    await f.tick(100);
    await f.tick(5000);
    assert.equal(f.requests.length, 1);
    assert.equal(f.reloads(), 0);
    f.unmount();
  });
}

test("a late business-error response from the previous directory cannot schedule work", async (t) => {
  let finishOld;
  const oldResponse = new Promise((resolve) => {
    finishOld = resolve;
  });
  const f = fixture((attempt) => (attempt === 1 ? oldResponse : subscribed()));
  t.after(() => f.unmount());
  f.render();
  await flush();
  f.state.fileManager[0].path += "/next";
  f.state.fileManager[0].listPath = f.state.fileManager[0].path;
  f.state.fileManager[0].list.parent.id = "next-root";
  f.render();
  await flush();
  finishOld(businessError(50005));
  await flush();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.requests.length, 2);
  await f.tick(100);
  assert.equal(f.reloads(), 1);
  assert.equal(f.delays().length, 0);
});

test("SSE waits for the current navigation's accepted list before connecting", async (t) => {
  const f = fixture(() => subscribed());
  t.after(() => f.unmount());
  f.state.fileManager[0].path += "/next";
  f.render();
  await flush();
  assert.equal(f.requests.length, 0);
  f.state.fileManager[0].listPath = f.state.fileManager[0].path;
  f.state.fileManager[0].list.parent.id = "next-root";
  f.render();
  await flush();
  assert.equal(f.requests.length, 1);
});
