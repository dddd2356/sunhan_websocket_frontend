import Layout from '../../../components/Layout';
import React, { useEffect, useState } from "react";
import "./style.css";
import { useCookies } from "react-cookie";
import axios from "axios";

interface Section {
    sectionName: string;
    id: number;
    is_visible: boolean;
}

interface Department {
    id: number;
    departmentName: string;
    flag: string;
    sections: Section[];
}

const EmploymentSignUp: React.FC = () => {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [department, setDepartment] = useState("");
    const [section, setSection] = useState("");
    const [position, setPosition] = useState("");
    const [profileImage, setProfileImage] = useState<File | null>(null);
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [users, setUsers] = useState<{ userId: string, email: string }[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [sections, setSections] = useState<Section[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    const [positions, setPositions] = useState<string[]>(["사원", "간호사", "과장", "팀장", "부장", "원장"]);
    const [departmentsWithSections, setDepartmentsWithSections] = useState<{ [key: string]: Section[] }>({});
    const [useSections, setUseSections] = useState<boolean>(true); // 구역 사용 여부 상태
    const [cookies] = useCookies(["accessToken"]);

    // 부서 목록 가져오기
    const fetchDepartments = async () => {
        try {
            const response = await axios.get("http://localhost:4040/api/v1/detail/department/departments", {
                headers: {
                    Authorization: `Bearer ${cookies.accessToken}`,
                },
            });

            console.log("부서 데이터:", response.data);

            const departmentNames = response.data.map((dept: Department) => dept.departmentName);
            setDepartments(departmentNames);

            const sectionsMap: { [key: string]: Section[] } = {};
            response.data.forEach((dept: Department) => {
                sectionsMap[dept.departmentName] = dept.sections;
            });

            setDepartmentsWithSections(sectionsMap);
        } catch (error) {
            console.error("부서 목록을 가져오는데 실패했습니다:", error);
            setError("부서 목록을 불러오는데 실패했습니다.");
        }
    };

    // 구역 사용 여부 설정 가져오기
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
                // 기본값으로 true 설정
                setUseSections(true);
            });
    };

    // 구역 목록 가져오기
    const fetchSectionsByDepartment = (department: string) => {
        if (!department || !useSections) {
            setSections([]);
            return;
        }

        if (departmentsWithSections[department]) {
            setSections(departmentsWithSections[department]);
        } else {
            axios.get("http://localhost:4040/api/v1/detail/employment/department/sections", {
                params: { department },
                headers: { Authorization: `Bearer ${cookies.accessToken}` },
            })
                .then((response) => {
                    console.log("구역 데이터:", response.data);
                    setSections(response.data);
                })
                .catch((error) => {
                    console.error("구역 목록을 가져오는데 실패했습니다.", error);
                    setError("구역 목록을 가져오는데 실패했습니다.");
                });
        }
    };

    // API로 사용자 목록 가져오기
    const fetchUsers = async () => {
        try {
            const usersResponse = await axios.get(
                "http://localhost:4040/api/v1/admin/users",
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );
            const allUsers = usersResponse.data.map((user: { userId: string; email: string }) => ({
                userId: user.userId,
                email: user.email,
            }));
            console.log("✅ 모든 사용자 목록:", allUsers);

            const employeesResponse = await axios.get(
                "http://localhost:4040/api/v1/detail/employment/all",
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            console.log("✅ 직원 데이터:", employeesResponse.data);

            const registeredEmployeeIds = new Set(
                employeesResponse.data
                    .filter((emp: any) => emp.user && emp.user.userId)
                    .map((emp: any) => emp.user.userId)
            );

            console.log("✅ 등록된 직원 ID 목록:", registeredEmployeeIds);

            const availableUsers = allUsers.filter((user: { userId: string; email: string }) =>
                !registeredEmployeeIds.has(user.userId)
            );
            console.log("✅ 직원이 아닌 사용자 목록:", availableUsers);

            setUsers(availableUsers);
        } catch (error) {
            console.error("직원 목록 가져오기 실패:", error);
            setError("직원 목록을 가져오는데 실패했습니다.");
        }
    };

    // 구역 사용 여부 토글
    const toggleSectionUsage = async () => {
        try {
            const response = await axios.put(
                `http://localhost:4040/api/v1/detail/department/settings/sections`,
                { useSections: !useSections },
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );
            console.log("구역 사용 설정 변경:", response.data);
            setUseSections(!useSections);

            // 구역을 사용하지 않는 경우 구역 초기화
            if (useSections) {
                setSection("");
            }
        } catch (error) {
            console.error("구역 사용 설정 변경 실패:", error);
            setError("구역 사용 설정 변경에 실패했습니다.");
        }
    };

    useEffect(() => {
        if (department && useSections) {
            fetchSectionsByDepartment(department);
        } else {
            setSections([]);
        }
    }, [department, useSections]);


    useEffect(() => {
        if (cookies.accessToken) {
            fetchDepartments();
            fetchUsers();
            fetchSectionSettings();
        }
    }, [cookies.accessToken]);

    const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedDepartment = e.target.value;
        setDepartment(selectedDepartment);
        setSection(""); // 부서 변경 시 구역 초기화
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setProfileImage(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (loading) return;

        setLoading(true);

        const formData = new FormData();
        formData.append("userId", selectedUserId);
        formData.append("name", name);
        formData.append("phone", phone);
        formData.append("department", department);

        // 구역 사용 설정이 켜져 있을 때만 구역 정보 추가
        if (useSections && section) {
            formData.append("section", section);
        }

        formData.append("position", position);
        if (profileImage) {
            formData.append("profileImage", profileImage);
        }

        try {
            const response = await axios.post("http://localhost:4040/api/v1/detail/employment/sign-up", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${cookies.accessToken}`,
                },
                withCredentials: true,
            });
            alert("직원이 등록되었습니다!");
            console.log(response.data);

            setName("");
            setPhone("");
            setDepartment("");
            setSection("");
            setPosition("");
            setProfileImage(null);
            setSelectedUserId("");

            fetchUsers();
        } catch (error) {
            console.error(error);
            setError("직원 등록에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="form-container">
                    <h2>직원 등록</h2>
                    {error && <p className="error-message">{error}</p>}
                    <div className="section-container">
                        <h4>조직 구조 설정</h4>
                        <button
                            type="button"
                            onClick={toggleSectionUsage}
                            className="toggle-section-btn"
                        >
                            {useSections ? "구역 사용 안함" : "구역 사용"}
                        </button>
                        <p className="section-info">
                            {useSections
                                ? "현재 부서와 구역을 모두 사용하고 있습니다."
                                : "현재 부서만 사용하고 있습니다."}
                        </p>
                    </div>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>회원 선택</label>
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="input-field"
                                required
                            >
                                <option value="">사용자를 선택하세요</option>
                                {users.map((user) => (
                                    <option key={user.userId} value={user.userId}>
                                        {user.email} ({user.userId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>이름</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input-field"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>핸드폰 번호</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="input-field"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>부서</label>
                            <select
                                value={department}
                                onChange={handleDepartmentChange}
                                className="input-field"
                                required
                            >
                                <option value="">소속을 선택하세요</option>
                                {departments.map((dept) => (
                                    <option key={dept} value={dept}>
                                        {dept}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 구역 사용 설정이 켜져 있을 때만 구역 선택 표시 */}
                        {useSections && (
                            <div className="form-group">
                                <label>구역</label>
                                <select
                                    value={section}
                                    onChange={(e) => setSection(e.target.value)}
                                    className="input-field"
                                    required
                                >
                                    <option value="">소속을 선택하세요</option>
                                    {sections.map((sec) => (
                                        <option key={sec.id} value={sec.sectionName}>
                                            {sec.sectionName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="form-group">
                            <label>직급</label>
                            <select
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                                className="input-field"
                                required
                            >
                                <option value="">직급을 선택하세요</option>
                                {positions.map((pos) => (
                                    <option key={pos} value={pos}>
                                        {pos}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>프로필 사진</label>
                            <input
                                type="file"
                                onChange={handleImageChange}
                                className="input-field"
                            />
                        </div>

                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? "등록 중..." : "직원 등록"}
                        </button>
                    </form>
                </div>
            </div>
        </Layout>
);
};

export default EmploymentSignUp;