import { send, defaultOpts, ThunkResponse } from "./request.ts";
import { LoginResponse } from "./user.ts";
import SessionManager from "../session";

export interface LoginProvider {
  id: number;
  type: string;
  name: string;
  icon?: string;
  enabled: boolean;
}
export interface OpenIDBinding {
  provider: number;
  linked_at: string;
}
export interface ExternalProvider {
  id: number;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  wellknown?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface ProviderRegistry {
  version: number;
  next_id: number;
  providers: ExternalProvider[];
  [key: string]: unknown;
}
const anonymous = () => ({ ...defaultOpts, noCredential: true, bypassSnackbar: () => true });
export const beginOpenID = (provider: number, hint?: string, linking = false): ThunkResponse<string> =>
  send(
    "/session/openid",
    { method: "PUT", data: { provider, hint, linking } },
    linking ? { ...defaultOpts, bypassSnackbar: () => true } : anonymous(),
  );
export const finishOpenID = (
  provider_id: number,
  code: string,
  session_id: string,
): ThunkResponse<LoginResponse | undefined> =>
  send(
    "/session/openid",
    {
      method: "POST",
      data: { provider_id, code, session_id },
      headers: {
        Authorization: SessionManager.currentLoginOrNull()
          ? `Bearer ${SessionManager.currentLogin().token.access_token}`
          : undefined,
      },
    },
    anonymous(),
  );
export const unlinkOpenID = (provider: number): ThunkResponse<void> =>
  send(`/session/openid/${provider}`, { method: "DELETE" });
export const completeOpenIDMFA = (otp: string, session_id: string): ThunkResponse<LoginResponse> =>
  send("/session/token/2fa", { method: "POST", data: { otp, session_id } }, anonymous());
export const discoverOpenID = (endpoint: string): ThunkResponse<string> =>
  send("/admin/tool/oidc", { params: { endpoint } });
export const releaseManagedAccount = (id: number): ThunkResponse<void> =>
  send(`/admin/user/${id}/release-managed`, { method: "POST" });
