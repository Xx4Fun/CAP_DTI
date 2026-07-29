import axios from 'axios';
import { getAdminToken, getAuthToken } from './adminSession';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'https://cap-dti.onrender.com/api',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});


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
            window.dispatchEvent(new Event('admin-reauthentication-required'));
        }
        return Promise.reject(error);
    }
);

export default api;
