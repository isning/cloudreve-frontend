import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { LoginResponse } from "../../../../api/user.ts";
import { completeOpenIDMFA, finishOpenID } from "../../../../api/openid.ts";
import { AppError, Code } from "../../../../api/request.ts";
import { useAppDispatch } from "../../../../redux/hooks.ts";
import { refreshUserSession } from "../../../../redux/thunks/session.ts";
import SessionManager from "../../../../session";
import { forgetOpenID, readOpenID } from "../../../../session/openid.ts";
import Phase2FA from "../Phases/Phase2FA.tsx";

export default function OpenIDCallback() {
  const { provider_id } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [query] = useState(() => new URLSearchParams(window.location.search));
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState("");
  const [otp, setOTP] = useState("");
  const [loading, setLoading] = useState(true);
  const started = useRef(false);
  const state = query.get("state") ?? "";
  const finish = async (response: LoginResponse | undefined) => {
    const context = readOpenID(state);
    if (context.linking) {
      if (response || SessionManager.currentLoginOrNull()?.user.id !== context.userID)
        throw new Error("Return to the original account to review the association.");
      forgetOpenID(state);
      navigate(context.returnTo, { replace: true });
      return;
    }
    if (!response?.token || !response.user) throw new Error("Missing login response");
    forgetOpenID(state);
    await dispatch(refreshUserSession(response, context.returnTo));
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Keep codes and external state out of the address bar and referrers.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const run = async () => {
      try {
        const context = readOpenID(state);
        if (!provider_id || !/^\d+$/.test(provider_id) || !Number.isSafeInteger(Number(provider_id)))
          throw new Error("Invalid provider identifier");
        if (query.getAll("state").length !== 1 || query.getAll("code").length > 1)
          throw new Error("Ambiguous login callback");
        if (!state || !query.get("code") || query.get("error"))
          throw new Error(query.get("error_description") ?? query.get("error") ?? "Incomplete login callback");
        if (context.provider !== Number(provider_id)) throw new Error("Provider does not match this login");
        if (
          context.linking &&
          SessionManager.currentLoginOrNull() &&
          SessionManager.currentLogin().user.id !== context.userID
        )
          throw new Error("The active account changed. Restart association from the original account.");
        await finish(await dispatch(finishOpenID(Number(provider_id), query.get("code")!, state)));
      } catch (e) {
        if (e instanceof AppError && e.code === Code.Continue) setChallenge(e.response.data);
        else {
          forgetOpenID(state);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);
  const complete = async () => {
    setLoading(true);
    setError("");
    try {
      await finish(await dispatch(completeOpenIDMFA(otp, challenge)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setOTP("");
    }
  };
  return (
    <Box sx={{ maxWidth: 440, mx: "auto", py: 5 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t("openid.completing")}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {challenge ? (
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void complete();
          }}
        >
          <Phase2FA
            otp={otp}
            onOtpChange={setOTP}
            loading={loading}
            control={{
              back: <></>,
              submit: (
                <Button type="submit" variant="contained" fullWidth disabled={loading || otp.length !== 6}>
                  {t("login.signIn")}
                </Button>
              ),
            }}
          />
        </Box>
      ) : (
        loading && <CircularProgress />
      )}
      {!loading && (
        <Button
          sx={{ mt: 2 }}
          onClick={() => {
            forgetOpenID(state);
            navigate("/session", { replace: true });
          }}
        >
          {t("login.back")}
        </Button>
      )}
    </Box>
  );
}
