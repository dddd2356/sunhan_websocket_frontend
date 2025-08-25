import axiosInstance from '../../axiosInstance';
import Cookies from 'universal-cookie';

const cookies = new Cookies();

let refreshTokenTimeout: NodeJS.Timeout | null = null;

export const scheduleTokenRefresh = (refreshToken: string, expiresIn: number) => {
    // Clear existing timeout
    if (refreshTokenTimeout) {
        clearTimeout(refreshTokenTimeout);
    }

    console.log("🔍 scheduleTokenRefresh 시작", {
        refreshToken: refreshToken ? refreshToken.substring(0, 10) + '...' : 'No Token',
        expiresIn
    });

    const expiresInMs = expiresIn * 1000; // 초를 밀리초로 변환 (3600초 → 3,600,000ms)
    const refreshThreshold = 10 * 60 * 1000; // 5분 전 리프레시 (300,000ms)로 조정 (선택적)
    const refreshTime = expiresInMs - refreshThreshold;

    if (refreshTime <= 0) {
        console.warn("⚠️ 토큰 만료 시간이 너무 짧음:", expiresIn, "초");
        return null;
    }

    console.log("🕒 토큰 리프레시 타이밍", {
        expiresInMs,
        refreshThreshold,
        refreshTime: `${Math.floor(refreshTime / 60000)}분 ${Math.floor((refreshTime % 60000) / 1000)}초`
    });
// 디버깅 로그 추가: 타이머가 스케줄된 정확한 시간 출력
    console.log("🕒 Refresh scheduled at:", new Date(Date.now() + expiresInMs - refreshThreshold));

    refreshTokenTimeout = setTimeout(async () => {
        // 타이머 트리거 시점 로그
        console.log("🔄 Token refresh triggered!");

        try {
            console.log("⏳ 토큰 proactive 리프레시 시작");

            if (!refreshToken) {
                throw new Error("리프레시 토큰 없음");
            }

            const response = await axiosInstance.post('/api/v1/auth/refresh', { refreshToken });

            console.log("📥 리프레시 응답 수신", {
                status: response.status,
                data: response.data
            });

            const { accessToken: newAccessToken, expiresIn: newExpiresIn } = response.data;

            if (!newAccessToken) {
                throw new Error("새 액세스 토큰 없음");
            }
            if (!newExpiresIn) {
                throw new Error("새 토큰 만료 시간 없음");
            }

            const isSecure = window.location.protocol === "https:";
            cookies.set("accessToken", newAccessToken, {
                expires: new Date(Date.now() + newExpiresIn * 1000),
                path: "/",
                secure: isSecure,
                sameSite: isSecure ? "none" : "lax",
            });

            console.log("✅ 토큰 리프레시 성공", {
                newTokenPreview: newAccessToken.substring(0, 10) + '...',
                newExpiresIn
            });

            // Optional: Re-fetch user profile to maintain state
            try {
                const userProfileResponse = await axiosInstance.get('/api/v1/user/me');
                console.log("👤 프로필 정보 유지:", userProfileResponse.data);
            } catch (profileError) {
                console.error("❌ 프로필 정보 가져오기 실패", profileError);
            }

            // 새로운 토큰으로 다시 스케줄링
            scheduleTokenRefresh(refreshToken, newExpiresIn);
        } catch (error: any) {
            console.error("❌ 토큰 리프레시 실패", {
                errorMessage: error.message,
                responseData: error.response?.data,
                responseStatus: error.response?.status
            });

            cancelTokenRefresh();
            cookies.remove("accessToken", { path: "/" });
            cookies.remove("refreshToken", { path: "/" });
            window.location.href = "/auth/sign-in";
        }
    }, refreshTime);

    return refreshTokenTimeout;
};

export const cancelTokenRefresh = () => {
    if (refreshTokenTimeout) {
        console.log("🛑 토큰 리프레시 타이머 취소");
        clearTimeout(refreshTokenTimeout);
        refreshTokenTimeout = null;
    }
};