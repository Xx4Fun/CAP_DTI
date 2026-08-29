import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getAdminToken, getAuthToken } from './adminSession';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'https://cap-dti.onrender.com/api',
    timeout: 30_000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

type PendingReauthenticationRequest = {
    config: AxiosRequestConfig & { _adminReauthenticationRetry?: boolean };
    resolve: (response: AxiosResponse) => void;
    reject: (reason?: unknown) => void;
};

let pendingReauthenticationRequests: PendingReauthenticationRequest[] = [];

(api as any).resumePendingAdminRequests = () => {
    const pending = pendingReauthenticationRequests;
    pendingReauthenticationRequests = [];
    pending.forEach(({ config, resolve, reject }) => {
        api.request({ ...config, _adminReauthenticationRetry: true } as any).then(resolve).catch(reject);
    });
};

(api as any).cancelPendingAdminRequests = () => {
    const pending = pendingReauthenticationRequests;
    pendingReauthenticationRequests = [];
    pending.forEach(({ reject }) => reject(new Error('Sensitive action cancelled before password confirmation.')));
};


api.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && getAdminToken()) {
            window.dispatchEvent(new Event('admin-auth-expired'));
        }
        if (error.response?.status === 403
            && error.response?.data?.status === 'REAUTHENTICATION_REQUIRED'
            && getAdminToken()) {
            const config = error.config as PendingReauthenticationRequest['config'];
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
