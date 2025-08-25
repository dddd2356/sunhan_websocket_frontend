import React, { useEffect, useState, ChangeEvent, FormEvent } from "react";
import Layout from "../../../components/Layout";
import { useCookies } from "react-cookie";
import axios from "axios";
import "./style.css";

interface UserProfile {
    id: number;
    name: string;
    phone: string;
    department: string;
    section: string;
    position: string;
    profileImage: string;
}

const MyPage: React.FC = () => {
    const [cookies] = useCookies(["accessToken"]);

    // 기존 정보 저장 (변경 여부 확인용)
    const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);

    // 수정 가능한 필드 상태값들
    const [name, setName] = useState<string>("");
    const [phone, setPhone] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [profileImage, setProfileImage] = useState<File | null>(null);
    const [currentProfileImage, setCurrentProfileImage] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [useSections, setUseSections] = useState<boolean>(true); // 구역 사용 여부 상태

    const fetchSectionSettings = () => {
        axios.get("http://localhost:4040/api/v1/detail/department/settings/sections", {
            headers: {
                Authorization: `Bearer ${cookies.accessToken}`,
            },
        })
            .then((response) => {
                console.log("구역 설정 데이터:", response.data);
                setUseSections(response.data.useSections);
            })
            .catch((error) => {
                console.error("구역 설정을 가져오는데 실패했습니다:", error);
                setUseSections(true); // 기본값 true
            });
    };

    useEffect(() => {
        fetchSectionSettings();
    }, [cookies.accessToken]);

    // 페이지 로드 시 현재 사용자의 프로필 정보 가져오기
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const token = cookies.accessToken;
                if (!token) {
                    setError("로그인 정보가 없습니다.");
                    return;
                }

                const headers = { Authorization: `Bearer ${token}` };
                const res = await axios.get("http://localhost:4040/api/v1/detail/employment/profile/me", { headers });

                const profile = res.data;
                setOriginalProfile(profile);
                setName(profile.name || "");
                setPhone(profile.phone || "");
                setCurrentProfileImage(profile.profileImage || "");

            } catch (error) {
                console.error("프로필 정보를 가져오는데 실패했습니다.", error);
                setError("프로필 정보를 가져오는데 실패했습니다.");
            }
        };

        fetchProfile();
    }, [cookies]);

    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setProfileImage(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        setError("");

        try {
            const formData = new FormData();
            let hasChanges = false;

            // 변경된 필드만 FormData에 추가
            if (originalProfile && name.trim() && name !== originalProfile.name) {
                formData.append("name", name.trim());
                hasChanges = true;
            }

            if (originalProfile && phone.trim() && phone !== originalProfile.phone) {
                formData.append("phone", phone.trim());
                hasChanges = true;
            }

            // 비밀번호는 입력된 경우에만 전송
            if (password.trim()) {
                formData.append("password", password.trim());
                hasChanges = true;
            }

            // 새 이미지가 선택된 경우
            if (profileImage) {
                formData.append("profileImage", profileImage);
                hasChanges = true;
            }

            if (!hasChanges) {
                alert("변경된 내용이 없습니다.");
                setLoading(false);
                return;
            }

            const token = cookies.accessToken;
            const headers = {
                "Content-Type": "multipart/form-data",
                Authorization: `Bearer ${token}`,
            };

            const res = await axios.put(
                "http://localhost:4040/api/v1/detail/employment/profile/update",
                formData,
                { headers }
            );

            alert("프로필이 성공적으로 수정되었습니다!");
            console.log("업데이트 결과:", res.data);

            // 수정 후 초기화
            setPassword("");
            setProfileImage(null);

            // 업데이트된 정보 다시 가져오기
            window.location.reload();

        } catch (error: any) {
            console.error("프로필 수정에 실패했습니다.", error);
            const errorMessage = error.response?.data || "프로필 수정에 실패했습니다. 다시 시도해주세요.";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="form-container">
                    <h2>내 정보 수정</h2>

                    {/* 현재 프로필 이미지 표시 */}
                    {currentProfileImage && (
                        <div className="current-profile-image" style={{textAlign: 'center', marginBottom: '20px'}}>
                            <img
                                src={`data:image/jpeg;base64,${currentProfileImage}`}
                                alt="현재 프로필"
                                style={{width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover'}}
                            />
                            <p>현재 프로필 사진</p>
                        </div>
                    )}

                    {error && <p className="error-message">{error}</p>}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>이름</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input-field"
                                placeholder={originalProfile?.name || "이름을 입력하세요"}
                            />
                            <small>현재: {originalProfile?.name}</small>
                        </div>

                        <div className="form-group">
                            <label>핸드폰 번호</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="input-field"
                                placeholder={originalProfile?.phone || "전화번호를 입력하세요"}
                            />
                            <small>현재: {originalProfile?.phone}</small>
                        </div>

                        <div className="form-group">
                            <label>비밀번호</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-field"
                                placeholder="새 비밀번호를 입력 (변경하지 않으려면 공백)"
                            />
                        </div>

                        <div className="form-group">
                            <label>프로필 사진</label>
                            <input
                                type="file"
                                onChange={handleImageChange}
                                className="input-field"
                                accept="image/*"
                            />
                            {profileImage && <small>선택된 파일: {profileImage.name}</small>}
                        </div>

                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? "수정 중..." : "정보 수정"}
                        </button>
                    </form>

                    {/* 읽기 전용 정보 표시 */}
                    {originalProfile && (
                        <div className="readonly-info" style={{marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px'}}>
                            <h3>기본 정보</h3>
                            <p><strong>부서:</strong> {originalProfile.department}</p>
                            {useSections && (
                            <p><strong>구역:</strong> {originalProfile.section}</p>
                            )}
                            <p><strong>직급:</strong> {originalProfile.position}</p>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default MyPage;
