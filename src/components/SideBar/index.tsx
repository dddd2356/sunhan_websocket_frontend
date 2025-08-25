import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './style.css';
import defaultProfileImage from './assets/images/profile.png';
import axios from 'axios';
import { useCookies } from 'react-cookie';
import { cancelTokenRefresh } from "../../views/Authentication/Services/AuthService";

interface SidebarProps {
    isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const [isOrganizationMenuOpen, setIsOrganizationMenuOpen] = useState(false);
    const [isMessageMenuOpen, setIsMessageMenuOpen] = useState(false);
    const [cookies, setCookie, removeCookie] = useCookies([
        "accessToken", "kakaoAccessToken", "naverAccessToken", "refreshToken",
    ]);
    const [profileName, setProfileName] = useState<string>(''); // 초기값 빈 문자열
    const [profileSection, setProfileSection] = useState<string>('개발자');
    const [profileImage, setProfileImage] = useState<string>('');
    const [role, setRole] = useState<string>('');
    const navigate = useNavigate();
    const refreshTimeoutRef = useRef<(() => void) | null>(null);

    const toggleOrganizationMenu = () => setIsOrganizationMenuOpen(prev => !prev);
    const toggleMessageMenu = () => setIsMessageMenuOpen(prev => !prev);

    const fetchUserRole = (data: any) => data.authorities?.[0]?.authority || '';

    const fetchProfileData = (user_id: string) => {
        axios
            .get(`http://localhost:4040/api/v1/detail/employment/${user_id}`, {
                headers: { Authorization: `Bearer ${cookies.accessToken}` },
                withCredentials: true,
            })
            .then((employeeRes) => {
                const employeeData = employeeRes.data;
                if (employeeData) {
                    const imageData = employeeData.profile_image;
                    setProfileImage(imageData ? `data:image/png;base64,${imageData}` : defaultProfileImage);
                    setProfileSection(
                        typeof employeeData.section === 'object'
                            ? employeeData.section.sectionName
                            : employeeData.section
                    );
                }
            })
            .catch((error) => {
                console.error('직원 프로필 정보 가져오기 실패:', error.response?.data || error.message);
                setProfileImage(defaultProfileImage);
            });
    };

    const extractNickname = (data: any) => {
        return (
            data.name || // employee.name 우선
            data.nickname || // 네이버 nickname
            (data.properties?.nickname) || // 카카오 properties.nickname
            (data.kakao_account?.profile?.nickname) || // 카카오 nickname
            profileName || // 기존 값 유지
            'Unknown' // 최종 기본값
        );
    };

    const fetchProfile = () => {
        let userData: any;
        let user_id = '';
        let nickname = '';

        // 초기 로그인 시 소셜 API 호출
        if (cookies.kakaoAccessToken && !profileName) {
            axios
                .get('https://kapi.kakao.com/v2/user/me', {
                    headers: { Authorization: `Bearer ${cookies.kakaoAccessToken}` },
                })
                .then((res) => {
                    userData = res.data;
                    user_id = "kakao_" + userData.id;
                    nickname = extractNickname(userData);
                    setProfileName(nickname);
                    fetchRoleAndProfileData(user_id);
                    checkEmployeeStatus(); // employee 확인
                })
                .catch((error) => {
                    console.error('카카오 사용자 정보 가져오기 실패:', error);
                });
        } else if (cookies.naverAccessToken && !profileName) {
        } else if (cookies.naverAccessToken && !profileName) {
            axios
                .get('http://localhost:4040/api/v1/naver/userinfo', {
                    headers: { Authorization: `Bearer ${cookies.naverAccessToken}` },
                })
                .then((res) => {
                    userData = res.data;
                    user_id = userData.userId;
                    nickname = extractNickname(userData);
                    setProfileName(nickname);
                    fetchRoleAndProfileData(user_id);
                    checkEmployeeStatus(); // employee 확인
                })
                .catch((error) => {
                    console.error('네이버 사용자 정보 가져오기 실패', error);
                });
        } else if (cookies.accessToken) {
            checkEmployeeStatus(); // accessToken만 있는 경우 바로 employee 확인
        }
    };

    const checkEmployeeStatus = () => {
        axios
            .get('http://localhost:4040/api/v1/user/me', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` },
            })
            .then((res) => {
                const userData = res.data;
                const user_id = userData.principal || userData.userId || '';
                const employeeName = userData.name; // employee.name
                if (employeeName) {
                    setProfileName(employeeName); // employee.name이 있으면 업데이트
                }
                setRole(fetchUserRole(userData));
                if (user_id) fetchProfileData(user_id);
            })
            .catch((error) => {
                console.error('웹 사용자 정보 가져오기 실패', error);
            });
    };

    const fetchRoleAndProfileData = (user_id: string) => {
        axios
            .get(`http://localhost:4040/api/v1/user/role/${user_id}`, {
                headers: { Authorization: `Bearer ${cookies.kakaoAccessToken || cookies.naverAccessToken || cookies.accessToken}` },
            })
            .then((roleRes) => {
                setRole(roleRes.data.role);
                fetchProfileData(user_id);
            })
            .catch((error) => {
                console.error('사용자 역할 정보 가져오기 실패', error);
            });
    };

    useEffect(() => {
        if (cookies.kakaoAccessToken || cookies.naverAccessToken || cookies.accessToken) {
            fetchProfile();
        }
    }, [cookies.kakaoAccessToken, cookies.naverAccessToken, cookies.accessToken]);

    useEffect(() => {
        console.log("🔍 Profile Name Change Detected:", {
            newName: profileName,
            stackTrace: new Error().stack
        });
    }, [profileName]);

    const handleLogout = async () => {
        const loginMethod = cookies.kakaoAccessToken ? "kakao" : cookies.naverAccessToken ? "naver" : "web";
        const logoutUrl = `http://localhost:4040/api/v1/auth/logout/${loginMethod}`;
        const accessToken = cookies.accessToken || cookies.kakaoAccessToken || cookies.naverAccessToken;

        try {
            const response = await axios.post(logoutUrl, {}, {
                withCredentials: true,
                headers: { "Authorization": `Bearer ${accessToken}` },
            });
            console.log("✅ 서버 로그아웃 응답:", response.data);
            removeCookie("accessToken", { path: "/", secure: true, sameSite: "none" });
            removeCookie("refreshToken", { path: "/", secure: true, sameSite: "none" });
            removeCookie("kakaoAccessToken", { path: "/", secure: true, sameSite: "none" });
            removeCookie("naverAccessToken", { path: "/", secure: true, sameSite: "none" });

            if (refreshTimeoutRef.current) {
                refreshTimeoutRef.current();
                refreshTimeoutRef.current = null;
                console.log("✅ Refresh 타이머 정리 완료");
            }

            cancelTokenRefresh();
            console.log("✅ 클라이언트 쿠키 삭제 완료");
            navigate("/auth/sign-in");
        } catch (error: any) {
            console.error("❌ 로그아웃 실패:", error.response?.data || error.message);
            removeCookie("accessToken", { path: "/", secure: true, sameSite: "none" });
            removeCookie("refreshToken", { path: "/", secure: true, sameSite: "none" });
            removeCookie("kakaoAccessToken", { path: "/", secure: true, sameSite: "none" });
            removeCookie("naverAccessToken", { path: "/", secure: true, sameSite: "none" });

            if (refreshTimeoutRef.current) {
                refreshTimeoutRef.current();
                refreshTimeoutRef.current = null;
                console.log("✅ Refresh 타이머 정리 완료 (실패 시)");
            }

            console.log("✅ 클라이언트 쿠키 삭제 완료 (실패 시)");
            navigate("/auth/sign-in");
        }
    };

    const handleMypage = () => navigate("/detail/my-page");

    return (
        <div className={`sidebar ${isOpen ? "active" : ""}`}>
            <div className="profile-section">
                <div className="profile-header">
                    <img src={profileImage || defaultProfileImage} alt="Profile" className="profile-img"/>
                    <div className="profile-info">
                        <div className="profile-name">{profileName}</div>
                        {profileSection && <div className="profile-title">{profileSection}</div>}
                    </div>
                </div>
                <div className="profile-buttons">
                    <button className="info-button" onClick={handleMypage}>나의 정보</button>
                    <button className="logout-button" onClick={handleLogout}>로그아웃</button>
                </div>
            </div>
            <hr className="divider"/>
            <ul className="main-menu">
                <li onClick={() => navigate('/detail/main-page')} className="menu-title cursor-pointer">메인 화면</li>
                <li onClick={toggleOrganizationMenu} className="menu-title cursor-pointer">조직도</li>
                {isOrganizationMenuOpen && (
                    <ul className="sub-menu cursor-pointer">
                        <li onClick={() => navigate('/detail/employment/organization-view')}>조직도 조회</li>
                        {role === 'ROLE_ADMIN' && (
                            <li onClick={() => navigate('/detail/employment/organization-edit')}>조직도 수정</li>
                        )}
                    </ul>
                )}
                {role === 'ROLE_ADMIN' && (
                    <li onClick={toggleMessageMenu} className="menu-title cursor-pointer">공지 발송</li>
                )}
                {isMessageMenuOpen && (
                    <ul className="sub-menu cursor-pointer">
                        <li onClick={() => navigate('/detail/message/all-send')}>전체 발송</li>
                        <li onClick={() => navigate('/detail/message/department-send')}>부서별 발송</li>
                        <li onClick={() => navigate('/detail/message/personal-send')}>개인별 발송</li>
                    </ul>
                )}

                <li onClick={() => navigate('/detail/chat/main')} className="menu-title cursor-pointer">채팅</li>

                {role === 'ROLE_ADMIN' && (
                    <li onClick={() => navigate('/detail/employment/sign-up')} className="menu-title cursor-pointer">직원
                        등록</li>
                )}
            </ul>
        </div>
    );
};

export default Sidebar;