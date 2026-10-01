import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getAdminToken, getAuthToken } from './adminSession';
import { clearResponseCache } from './responseCache';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'https://cap-dti.onrender.com/api',
    timeout: 30_000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

type SessionRequestConfig = AxiosRequestConfig & { _adminReauthenticationRetry?: boolean; _adminEpoch?: number };

type PendingReauthenticationRequest = {
    config: SessionRequestConfig;
    resolve: (response: AxiosResponse) => void;
    reject: (reason?: unknown) => void;
};

let pendingReauthenticationRequests: PendingReauthenticationRequest[] = [];
// Every request is stamped with the session it was sent under. A logout advances the epoch, so a late 401/403 from
// the previous user's request can neither log out nor be replayed under the next user's token.
let adminSessionEpoch = 0;
let adminSessionClosing = false;
const isCurrentSession = (config?: SessionRequestConfig) => !adminSessionClosing && config?._adminEpoch === adminSessionEpoch;

const rejectPending = (reason: string) => {
    const pending = pendingReauthenticationRequests;
    pendingReauthenticationRequests = [];
    pending.forEach(({ reject }) => reject(new Error(reason)));
};

(api as any).getAdminSessionEpoch = () => adminSessionEpoch;
(api as any).isAdminSessionActive = (epoch: number) => !adminSessionClosing && epoch === adminSessionEpoch;

(api as any).resumePendingAdminRequests = () => {
    const pending = pendingReauthenticationRequests;
    pendingReauthenticationRequests = [];
    pending.forEach(({ config, resolve, reject }) => {
        if (!isCurrentSession(config)) { reject(new Error('The session that started this action has ended.')); return; }
        api.request({ ...config, _adminReauthenticationRetry: true } as any).then(resolve).catch(reject);
    });
};

(api as any).cancelPendingAdminRequests = () => rejectPending('Sensitive action cancelled before password confirmation.');

/** Logout started: drop queued sensitive actions and refuse new requests (except /logout) until it finishes. */
(api as any).endAdminSession = () => {
    adminSessionEpoch += 1;
    adminSessionClosing = true;
    rejectPending('The session ended before password confirmation.');
};

// Called once the token is cleared; requests in flight from the ended session still carry the old epoch.
(api as any).finishAdminLogout = () => { adminSessionClosing = false; };


api.interceptors.request.use((config) => {
    if (adminSessionClosing && config.url !== '/logout') {
        return Promise.reject(new Error('Signing out.'));
    }
    (config as SessionRequestConfig)._adminEpoch = adminSessionEpoch;
    const token = getAuthToken();
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Any write can change a cached list, so a finished non-GET request drops the whole read cache.
const clearCacheAfterWrite = (config?: AxiosRequestConfig) => {
    if ((config?.method ?? 'get').toLowerCase() !== 'get') clearResponseCache();
};

api.interceptors.response.use(
    (response) => {
        clearCacheAfterWrite(response.config);
        return response;
    },
    (error) => {
        clearCacheAfterWrite(error.config);
        if (error.response?.status === 401 && getAdminToken() && isCurrentSession(error.config)) {
            window.dispatchEvent(new Event('admin-auth-expired'));
        }
        if (error.response?.status === 403
            && error.response?.data?.status === 'REAUTHENTICATION_REQUIRED'
            && getAdminToken()
            && isCurrentSession(error.config)) {
            const config = error.config as SessionRequestConfig;
            if (!config?._adminReauthenticationRetry) {
                return new Promise<AxiosResponse>((resolve, reject) => {
                    pendingReauthenticationRequests.push({ config, resolve, reject });
                    window.dispatchEvent(new Event('admin-reauthentication-required'));
                });
            }
        }
        return Promise.reject(error);
    }
);

export default api;
