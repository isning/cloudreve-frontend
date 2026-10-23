import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

export function loadTS(filename, modules = {}, globals = {}) {
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
    atob,
    btoa,
    Uint8Array,
    ...globals,
    require(name) {
      if (!(name in modules)) throw Error(`Missing fixture dependency: ${name}`);
      return modules[name];
    },
  });
  return module.exports;
}

export function componentFixture(filename, props, modules, globals = {}, context = {}) {
  let cursor = 0,
    effects = [],
    tree;
  const hooks = [];
  const changed = (old, deps) => !old || !deps || deps.some((value, index) => !Object.is(value, old.deps[index]));
  const react = {
    useContext: () => context,
    useState(initial) {
      const index = cursor++;
      hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        hooks[index].value,
        (next) => {
          hooks[index].value = typeof next === "function" ? next(hooks[index].value) : next;
        },
      ];
    },
    useRef(initial) {
      return (hooks[cursor++] ??= { current: initial });
    },
    useEffect(effect, deps) {
      const index = cursor++,
        old = hooks[index];
      if (changed(old, deps))
        effects.push(() => {
          old?.cleanup?.();
          hooks[index] = { deps, cleanup: effect() };
        });
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changed(hooks[index], deps)) hooks[index] = { deps, value: factory() };
      return hooks[index].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const material = new Proxy({}, { get: (_, name) => String(name) });
  const component = loadTS(
    filename,
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
      "@mui/material": material,
      "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
      ...modules,
    },
    globals,
  ).default;
  const render = (next = props) => {
    props = next;
    cursor = 0;
    effects = [];
    tree = component(props);
    effects.forEach((effect) => effect());
  };
  const findAll = (predicate, node = tree) => {
    if (!node || typeof node !== "object") return [];
    return [
      ...(predicate(node) ? [node] : []),
      ...[node.props?.children, node.props?.control, node.props?.action, node.props?.secondaryAction]
        .flat(Infinity)
        .flatMap((child) => (child && typeof child === "object" ? findAll(predicate, child) : [])),
    ];
  };
  render();
  return {
    render,
    findAll,
    find: (predicate) => findAll(predicate)[0],
    unmount: () => hooks.forEach((hook) => hook.cleanup?.()),
  };
}
