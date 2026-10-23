import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import i18next from "i18next";

// Exercise production components with controlled React state and HTTP promises.
function fixture(filename, initialProps = {}, context = {}) {
  let props = initialProps,
    cursor = 0,
    tree,
    effects = [],
    actor = "one",
    component;
  const hooks = [],
    requests = [];
  const react = {
    useState(initial) {
      const i = cursor++;
      hooks[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        hooks[i].value,
        (value) => {
          hooks[i].value = typeof value === "function" ? value(hooks[i].value) : value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (hooks[i] ??= { current: initial });
    },
    useContext() {
      return context;
    },
    useEffect(effect, deps) {
      const i = cursor++,
        old = hooks[i];
      if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) {
        effects.push(() => {
          old?.cleanup?.();
          hooks[i] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const dispatch = (request) => {
    if (request.kind === "callback") return Promise.resolve("https://cloudreve.example/callback/openid/3");
    if (request.kind === "confirm") return Promise.resolve();
    return new Promise((resolve, reject) => requests.push({ ...request, resolve, reject }));
  };
  const material = new Proxy(
    {
      styled: () => () => "Styled",
      useTheme: () => ({ breakpoints: { down: () => "mobile" }, palette: { action: {} } }),
      useMediaQuery: () => false,
    },
    { get: (target, name) => target[name] ?? String(name) },
  );
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "@mui/material": material,
    "@mui/lab": { LoadingButton: "LoadingButton" },
    "@mui/icons-material": material,
    "@mui/material/AccordionSummary": { __esModule: true, default: "AccordionSummary" },
    "react-i18next": { useTranslation: () => ({ t: (key) => key }), Trans: "Trans" },
    notistack: { useSnackbar: () => ({ enqueueSnackbar() {} }) },
    dayjs: { __esModule: true, default: () => ({ diff: () => 0 }) },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    console,
    navigator: { credentials: { create: async () => null } },
    window: { PublicKeyCredential() {} },
    require(name) {
      if (modules[name]) return modules[name];
      if (name.endsWith("hooks.ts"))
        return {
          useAppDispatch: () => dispatch,
          useAppSelector: (select) => select({ siteConfig: { login: { config: { login_providers: [] } } } }),
        };
      if (name.endsWith("api/openid.ts"))
        return {
          discoverOpenID: (endpoint) => ({ kind: "discovery", endpoint }),
          getOpenIDCallbackURI: () => ({ kind: "callback" }),
          unlinkOpenID: (id) => ({ kind: "unlink", id }),
        };
      if (name.endsWith("api/api.ts")) return { sendPreparePasskeyRegistration: () => ({ kind: "passkey" }) };
      if (name.endsWith("dialog.ts")) return { confirmOperation: () => ({ kind: "confirm" }) };
      if (name.endsWith("session"))
        return { __esModule: true, default: { currentLoginOrNull: () => ({ user: { id: actor } }) } };
      if (name.includes("SettingWrapper")) return { SettingContext: "SettingContext" };
      if (name.includes("StyledComponents"))
        return new Proxy({}, { get: (_, key) => (key === "DenseFilledTextField" ? "TextField" : String(key)) });
      if (name.endsWith("/util")) return {};
      return { __esModule: true, default: name.split("/").at(-1).replace(".tsx", "") };
    },
  });
  const render = (next = props) => {
    props = next;
    cursor = 0;
    effects = [];
    tree = (component ?? module.exports.default)(props);
    for (const effect of effects) effect();
  };
  const findAll = (predicate, node = tree) => {
    if (!node || typeof node !== "object") return [];
    return [
      ...(predicate(node) ? [node] : []),
      ...[node.props?.children, node.props?.secondaryAction, node.props?.settingAction, node.props?.control]
        .flat(Infinity)
        .flatMap((child) => (child && typeof child === "object" ? findAll(predicate, child) : [])),
    ];
  };
  render();
  return {
    requests,
    render,
    find: (predicate) => findAll(predicate)[0],
    findAll,
    actor: (value) => {
      actor = value;
    },
    unmount: () => hooks.forEach((hook) => hook.cleanup?.()),
    mount: (target, next) => {
      hooks.forEach((hook) => hook.cleanup?.());
      hooks.length = 0;
      component = target;
      render(next);
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const admin = "src/component/Admin/Settings/UserSession/SSOSettings.tsx";
const editor = "src/component/Admin/Settings/UserSession/OpenIDProviderEditor.tsx";
const associations = "src/component/Pages/Setting/Security/OpenIDAssociations.tsx";
const provider = () => ({
  id: 3,
  type: "oidc",
  enabled: true,
  config: { client_secret: "old-fixture-value" },
  wellknown: { issuer: "https://idp.example" },
});
const button = (label) => (node) =>
  ["Button", "LoadingButton", "SecondaryLoadingButton"].includes(node.type) &&
  (node.props.children === label || node.props.children?.props?.children === label);

test("discovery preserves current provider edits, other providers and registry counters", async () => {
  const context = {
    values: { external_login_providers: JSON.stringify({ version: 1, next_id: 4, providers: [provider()] }) },
    setSettings: (patch) => {
      context.values = { ...context.values, ...patch };
    },
  };
  const root = fixture(admin, {}, context);
  const childProps = () => root.find((node) => node.type === "OpenIDProviderEditor").props;
  const child = fixture(editor, childProps());
  const pending = child.find(button("openid.discover")).props.onClick();
  const registry = JSON.parse(context.values.external_login_providers);
  registry.providers[0].config.client_secret = "rotated-fixture-value";
  registry.providers[0].enabled = false;
  registry.providers.push({ ...provider(), id: 4 });
  registry.next_id = 5;
  context.setSettings({ external_login_providers: JSON.stringify(registry) });
  root.render();
  child.render(childProps());
  child.requests[0].resolve(
    JSON.stringify({ issuer: "https://idp.example", authorization_endpoint: "https://idp.example/auth" }),
  );
  await pending;
  const saved = JSON.parse(context.values.external_login_providers);
  assert.equal(saved.providers[0].config.client_secret, "rotated-fixture-value");
  assert.equal(saved.providers[0].enabled, false);
  assert.equal(saved.providers.length, 2);
  assert.equal(saved.next_id, 5);
  assert.equal(saved.providers[0].wellknown.authorization_endpoint, "https://idp.example/auth");
});

test("unmounted provider editor discards pending discovery", async () => {
  const changes = [],
    child = fixture(editor, { provider: provider(), onChange: (value) => changes.push(value) });
  const pending = child.find(button("openid.discover")).props.onClick();
  child.unmount();
  child.requests[0].resolve('{"issuer":"https://idp.example"}');
  await pending;
  assert.equal(changes.length, 0);
});

test("unlink merges current associations without restoring stale MFA or passkeys", async () => {
  let setting = { open_id: [{ provider: 3 }, { provider: 4 }], two_fa_enabled: false, passkeys: [] };
  const props = () => ({
    setting,
    setSetting: (value) => {
      setting = typeof value === "function" ? value(setting) : value;
    },
  });
  const child = fixture(associations, props());
  const pending = child.find(button("openid.unlink")).props.onClick();
  await tick();
  setting = { ...setting, two_fa_enabled: true, passkeys: [{ id: "new-authenticator" }] };
  child.render(props());
  child.requests[0].resolve();
  await pending;
  assert.equal(setting.two_fa_enabled, true);
  assert.equal(setting.passkeys.length, 1);
  assert.deepEqual(
    Array.from(setting.open_id, (binding) => binding.provider),
    [4],
  );
});

test("unlink result cannot modify a switched account", async () => {
  let updates = 0;
  const child = fixture(associations, { setting: { open_id: [{ provider: 3 }] }, setSetting: () => updates++ });
  const pending = child.find(button("openid.unlink")).props.onClick();
  await tick();
  child.actor("two");
  child.requests[0].resolve();
  await pending;
  assert.equal(updates, 0);
});

test("managed empty passkey card cannot begin registration", async () => {
  const child = fixture("src/component/Pages/Setting/Security/PasskeyList.tsx", {
    setting: { passkeys: [], credential_capabilities: { passkey_register: false } },
  });
  const card = child.find((node) => node.type === "Box" && node.props.onClick);
  const pending = card?.props.onClick?.();
  assert.equal(child.requests.length, 0);
  await pending;
  const add = child.find((node) => node.type === "SecondaryLoadingButton");
  await add.props.onClick();
  assert.equal(child.requests.length, 0);
});

test("JSON draft survives unrelated renders but Revert clears text and native validity", () => {
  const child = fixture(editor, { provider: provider(), onChange() {} });
  const field = child.find((node) => typeof node.type === "function" && node.type.name === "JSONField");
  const props = { ...field.props, resetVersion: 0 };
  child.mount(field.type, props);
  let validity = "";
  const input = {
    value: "{",
    setCustomValidity(value) {
      validity = value;
    },
  };
  const node = child.find((node) => node.type === "TextField");
  if (node.props.inputRef) node.props.inputRef.current = input;
  node.props.onChange({ target: input });
  child.render(props);
  assert.equal(child.find((node) => node.type === "TextField").props.value, "{");
  assert.notEqual(validity, "");
  child.render({ ...props });
  assert.equal(child.find((node) => node.type === "TextField").props.value, "{");
  child.render({ ...props, resetVersion: 1 });
  child.render({ ...props, resetVersion: 1 });
  assert.equal(child.find((node) => node.type === "TextField").props.value, JSON.stringify(props.value, null, 2));
  assert.equal(validity, "");
});

test("authentication recovery copy is Chinese with real English fallback for other languages", async () => {
  const resource = (locale) =>
    JSON.parse(readFileSync(new URL(`../public/locales/${locale}/application.json`, import.meta.url), "utf8"));
  const en = resource("en-US"),
    zh = resource("zh-CN"),
    fr = resource("fr-FR");
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "zh-CN",
    fallbackLng: "en-US",
    defaultNS: "application",
    resources: { "en-US": { application: en }, "zh-CN": { application: zh }, "fr-FR": { application: fr } },
  });
  for (const key of [
    "invalidJSONObject",
    "contextExpired",
    "reviewAssociation",
    "missingLoginResponse",
    "invalidProvider",
    "ambiguousCallback",
    "incompleteCallback",
    "providerMismatch",
    "accountChanged",
    "invalidConfig",
    "unsupported",
  ]) {
    assert.match(i18n.t(`openid.${key}`), /[\u3400-\u9fff]/);
  }
  await i18n.changeLanguage("fr-FR");
  for (const key of ["invalidJSONObject", "contextExpired", "reviewAssociation", "accountChanged"])
    assert.equal(i18n.t(`openid.${key}`), en.openid[key]);
});

test("missing, expired and malformed per-tab return context use the same recoverable error", () => {
  const code = ts.transpileModule(readFileSync(new URL("../src/session/openid.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let value = null;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    sessionStorage: { getItem: () => value },
    window: { location: { origin: "https://cloudreve.example" } },
    URL,
  });
  const { readOpenID, OpenIDContextError } = module.exports;
  for (const invalid of [null, "{", '{"provider":3,"linking":false,"returnTo":"/home","expires":0}']) {
    value = invalid;
    assert.throws(
      () => readOpenID("fixture-state"),
      (error) => error instanceof OpenIDContextError && error.message === "openid.contextExpired",
    );
  }
});
