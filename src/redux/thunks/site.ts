import { getSiteConfig } from "../../api/api.ts";
import SessionManager from "../../session";
import { applySetting } from "../siteConfigSlice.ts";
import { AppThunk } from "../store.ts";

const configRequests = new Map<string, number>();

export function loadSiteConfig(section: string): AppThunk {
  return async (dispatch, _getState) => {
    const actor = SessionManager.currentLoginOrNull()?.user.id;
    const generation = (configRequests.get(section) ?? 0) + 1;
    configRequests.set(section, generation);
    const siteConfig = await dispatch(getSiteConfig(section));
    if (SessionManager.currentLoginOrNull()?.user.id !== actor || configRequests.get(section) !== generation) return;
    dispatch(
      applySetting({
        section: section,
        config: siteConfig,
      }),
    );
    localStorage.setItem(`siteConfigCache_${section}`, JSON.stringify(siteConfig));
  };
}

export function updateSiteConfig(): AppThunk {
  return async (dispatch, getState) => {
    await dispatch(loadSiteConfig("basic"));
    const {
      siteConfig: { basic },
    } = getState();
    if (basic.config.user) {
      SessionManager.updateUserIfExist(basic.config.user);
    }
  };
}
