import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'universal-cookie';

const cookies = new Cookies();
const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:4040";

const axiosInstance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
});

axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const accessToken = cookies.get('accessToken');
        if (accessToken) {
            config.headers = config.headers || {};
            config.headers['Authorization'] = `Bearer ${accessToken}`;
            console.log("📤 Request with token:", accessToken.substring(0, 10) + "...", "URL:", config.url);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null) => {
    failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve(token));
    failedQueue = [];
};

axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig<any> & { _retry?: boolean };

        console.log("📥 Response error - Status:", error.response?.status, "Data:", error.response?.data, "URL:", originalRequest?.url);

        if (!error.response || error.response.status !== 401 || originalRequest?._retry) {
            console.log("❌ Skipping refresh - Status:", error.response?.status);
            return Promise.reject(error);
        }

        if (isRefreshing) {
            return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
                .then(token => {
                    originalRequest.headers['Authorization'] = `Bearer ${token}`;
                    return axiosInstance(originalRequest);
                })
                .catch(err => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const refreshToken = cookies.get("refreshToken");
            if (!refreshToken) throw new Error("No refresh token available");

            console.log("⏳ Refreshing with token:", refreshToken.substring(0, 10) + "...");
            const refreshResponse = await axios.post(
                `${BASE_URL}/api/v1/auth/refresh`,
                { refreshToken },
                { headers: { 'Content-Type': 'application/json' }, withCredentials: true }
            );

            const { accessToken: newAccessToken, expiresIn } = refreshResponse.data;
            if (!newAccessToken || !expiresIn) throw new Error("Invalid refresh response");

            console.log("✅ Refresh successful - New token:", newAccessToken.substring(0, 10) + "...", "Expires in:", expiresIn);
            const isSecure = window.location.protocol === "https:";
            cookies.set("accessToken", newAccessToken, {
                path: "/",
                expires: new Date(Date.now() + expiresIn * 1000),
                secure: isSecure,
                sameSite: isSecure ? "none" : "lax",
            });

            console.log('🚀 Dispatching tokenRefreshed event');
            window.dispatchEvent(new Event('tokenRefreshed'));

            originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
            processQueue(null, newAccessToken);
            isRefreshing = false;
            return axiosInstance(originalRequest);
        } catch (refreshError: any) {
            console.error("❌ Refresh failed:", refreshError.response?.data || refreshError.message);
            cookies.remove("accessToken", { path: "/" });
            cookies.remove("refreshToken", { path: "/" });
            processQueue(refreshError, null);
            isRefreshing = false;
            window.location.href = "/auth/sign-in";
            return Promise.reject(refreshError);
        }
    }
);

export default axiosInstance;