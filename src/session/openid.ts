export interface OpenIDReturn {
  returnTo: string;
  linking: boolean;
  userID?: string;
  provider: number;
  expires: number;
}
const prefix = "cloudreve:openid:return:";
const ttl = 10 * 60 * 1000;
export function safeReturn(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/home";
  const target = new URL(value, window.location.origin);
  return target.origin === window.location.origin && !target.pathname.startsWith("/callback/")
    ? target.pathname + target.search + target.hash
    : "/home";
}
export function rememberOpenID(state: string, context: Omit<OpenIDReturn, "expires">) {
  const now = Date.now();
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(prefix)) {
      try {
        if (JSON.parse(sessionStorage.getItem(key)!).expires <= now) sessionStorage.removeItem(key);
      } catch {
        sessionStorage.removeItem(key);
      }
    }
  }
  sessionStorage.setItem(
    prefix + state,
    JSON.stringify({ ...context, returnTo: safeReturn(context.returnTo), expires: now + ttl }),
  );
}
export function readOpenID(state: string): OpenIDReturn {
  const context = JSON.parse(sessionStorage.getItem(prefix + state) ?? "null");
  if (
    !context ||
    context.expires <= Date.now() ||
    !Number.isSafeInteger(context.provider) ||
    context.provider < 0 ||
    typeof context.linking !== "boolean" ||
    typeof context.returnTo !== "string"
  )
    throw new Error("Login context expired. Please restart sign in.");
  return { ...context, returnTo: safeReturn(context.returnTo) };
}
export function extendOpenIDForMFA(state: string, context: OpenIDReturn) {
  sessionStorage.setItem(
    prefix + state,
    JSON.stringify({ ...context, returnTo: safeReturn(context.returnTo), expires: Date.now() + 5 * 60 * 1000 }),
  );
}
export function forgetOpenID(state: string) {
  sessionStorage.removeItem(prefix + state);
}
