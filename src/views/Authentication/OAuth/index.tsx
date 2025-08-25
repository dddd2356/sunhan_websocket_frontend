// src/components/OAuth.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import { scheduleTokenRefresh } from '../Services/AuthService';

export default function OAuth() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const expirationTime = params.get("expiresIn");
    const kakaoToken = params.get("kakaoToken");
    const naverToken = params.get("naverToken");
    const refreshToken = params.get("refreshToken");

    const [cookies, setCookie] = useCookies(['accessToken', 'refreshToken', 'kakaoAccessToken', 'naverAccessToken']);
    const navigate = useNavigate();
    const [isProcessed, setIsProcessed] = useState(false); // 처리 상태 관리

    useEffect(() => {
        if (isProcessed) {
            console.log("🔍 OAuth already processed, skipping...");
            return;
        }

        console.log("🔍 OAuth 실행 - 쿼리 파라미터:", { token, expirationTime, kakaoToken, naverToken, refreshToken });

        if (!token || !refreshToken) {
            console.error("❌ Missing token or refresh token in query params");
            navigate("/auth/sign-in");
            return;
        }

        let expiresInSeconds = expirationTime ? Number(expirationTime) : 3600;
        if (isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
            console.warn("⚠️ Invalid expiresIn, defaulting to 3600 seconds:", expirationTime);
            expiresInSeconds = 3600;
        } else if (expiresInSeconds < 60) {
            console.warn("⚠️ expiresIn too short, using 3600 seconds instead:", expiresInSeconds);
            expiresInSeconds = 3600; // 1시간 강제 적용
        }


        const expiresInMs = expiresInSeconds * 1000;
        const expires = new Date(Date.now() + expiresInMs);
        const isSecure = window.location.protocol === "https:";

        const isWebLogin = !kakaoToken && !naverToken;
        console.log(`✅ ${isWebLogin ? '웹' : '소셜'} 로그인 - JWT 토큰 저장:`, token.substring(0, 10) + "...");
        setCookie("accessToken", token, {
            expires,
            path: "/",
            secure: isSecure,
            sameSite: isSecure ? "none" : "lax",
        });

        console.log(`✅ ${isWebLogin ? '웹' : '소셜'} 로그인 - Refresh Token 저장:`, refreshToken.substring(0, 10) + "...");
        setCookie("refreshToken", refreshToken, {
            expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14일
            path: "/",
            secure: isSecure,
            sameSite: isSecure ? "none" : "lax",
        });

        if (kakaoToken) {
            console.log("✅ 카카오 액세스 토큰 저장:", kakaoToken.substring(0, 10) + "...");
            setCookie("kakaoAccessToken", kakaoToken, { expires, path: "/", secure: isSecure, sameSite: isSecure ? "none" : "lax" });
        }

        if (naverToken) {
            console.log("✅ 네이버 액세스 토큰 저장:", naverToken.substring(0, 10) + "...");
            setCookie("naverAccessToken", naverToken, { expires, path: "/", secure: isSecure, sameSite: isSecure ? "none" : "lax" });
        }

        console.log("🔍 Calling scheduleTokenRefresh with expiresIn:", expiresInSeconds);
        scheduleTokenRefresh(refreshToken, expiresInSeconds);

        console.log("🔍 Navigating to /detail/main-page");
        setIsProcessed(true);
        navigate("/detail/main-page", { replace: true });
    }, [token, expirationTime, kakaoToken, naverToken, refreshToken, navigate, setCookie, isProcessed]);

    return <div>OAuth 처리 중...</div>;
}