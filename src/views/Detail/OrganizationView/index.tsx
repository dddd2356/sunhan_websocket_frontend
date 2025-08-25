import Layout from '../../../components/Layout';
import React, { useEffect, useState } from "react";
import "./style.css";
import { useCookies } from "react-cookie";
import axios from "axios";

// Department 타입 정의
interface Department {
    id: number;
    departmentName: string;
    flag: string;
}


const OrganizationView = () => {
    const [employees, setEmployees] = useState<any[]>([]); // 직원 상태
    const [sections, setSections] = useState<string[]>([]); // 구역 목록 상태
    const [selectedDepartment, setSelectedDepartment] = useState<string>(""); // 선택된 부서
    const [selectedSection, setSelectedSection] = useState<string>(""); // 선택된 구역
    const [error, setError] = useState<string>(""); // 에러 상태
    const [cookies, setCookie] = useCookies(['accessToken', 'refreshToken']);
    const [departments, setDepartments] = useState<Department[]>([]); // 부서 상태
    const [useSections, setUseSections] = useState<boolean>(true); // 구역 사용 여부 상태

    // 부서 목록 가져오기
    const fetchDepartments = () => {
        axios.get("http://localhost:4040/api/v1/detail/department/departments", {
            headers: {
                Authorization: `Bearer ${cookies.accessToken}`,
            },
        })
            .then((response) => {
                console.log("부서 데이터:", response.data);
                setDepartments(response.data);
            })
            .catch((error) => {
                console.error("부서 목록을 가져오는데 실패했습니다:", error);
                setError("부서 목록을 불러오는데 실패했습니다.");
            });
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
                setUseSections(true); // 기본값 true
            });
    };

    // 구역 클릭 시 처리 함수 수정
    const fetchSectionsByDepartment = (department: string) => {
        if (!useSections) {
            setSections([]); // 구역 사용 안함 설정이면 구역 목록 비우기
            return;
        }

        axios.get("http://localhost:4040/api/v1/detail/employment/department/sections", {
            params: { department },
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => {
                console.log("구역 데이터 원본:", response.data);

                // 각 섹션 이름이 JSON 문자열인지 확인하고 처리
                const processedSections = response.data.map((section: string) => {
                    try {
                        if (section && section.startsWith('{"sectionName":')) {
                            const parsed = JSON.parse(section);
                            return parsed.sectionName;
                        }
                        return section;
                    } catch (e) {
                        return section;
                    }
                });

                console.log("처리된 구역 데이터:", processedSections);
                setSections(processedSections);
            })
            .catch((error) => {
                console.error("구역 목록을 가져오는데 실패했습니다.", error);
            });
    };

    // 직원 목록 조회
    const fetchEmployees = (department: string, section?: string) => {
        let url = "http://localhost:4040/api/v1/detail/employment/department/employees";
        let params: any = { department };

        if (useSections && section) {
            url = "http://localhost:4040/api/v1/detail/employment/department/section/employees";
            params.section = section;
        }

        // 먼저 토큰 존재 여부 확인
        if (!cookies.accessToken) {
            console.error("Access token is missing");
            setError("인증 토큰이 없습니다. 다시 로그인해주세요.");
            return;
        }

        axios.get(url, {
            params,
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => {
                console.log("직원 데이터:", response.data);
                setEmployees(response.data);
            })
            .catch((error) => {
                if (error.response && error.response.status === 403) {
                    // 토큰이 만료되었을 경우 리프레시 시도
                    try {
                        // 리프레시 토큰으로 새 액세스 토큰 발급 로직 추가
                        axios.post('http://localhost:4040/api/v1/auth/refresh', {
                            refreshToken: cookies.refreshToken
                        })
                            .then((refreshResponse) => {
                                // 새 액세스 토큰으로 쿠키 업데이트
                                setCookie('accessToken', refreshResponse.data.accessToken, { path: '/' });

                                // 새 토큰으로 다시 요청
                                return axios.get(url, {
                                    params,
                                    headers: { Authorization: `Bearer ${refreshResponse.data.accessToken}` },
                                });
                            })
                            .then((retryResponse) => {
                                setEmployees(retryResponse.data);
                            })
                            .catch((refreshError) => {
                                console.error("토큰 갱신 실패", refreshError);
                                setError("인증에 실패했습니다. 다시 로그인해주세요.");
                                // 로그아웃 처리 또는 로그인 페이지로 리다이렉트
                            });
                    } catch (refreshError) {
                        console.error("토큰 갱신 중 오류 발생", refreshError);
                        setError("인증 중 문제가 발생했습니다.");
                    }
                } else {
                    console.error("직원 목록을 가져오는데 실패했습니다.", error);
                    setError("직원 목록을 가져오는데 실패했습니다.");
                }
            });
    };


    // 부서 클릭 시 처리
    const handleDepartmentClick = (department: string) => {
        setSelectedDepartment(department);
        setSelectedSection(""); // 구역 초기화
        setEmployees([]);       // 직원 목록 초기화

        if (useSections) {
            fetchSectionsByDepartment(department); // 구역 목록 로드
        }

        fetchEmployees(department); // 부서 기준으로 직원 목록 로드
    };

    // 구역 클릭 시 처리
    const handleSectionChange = (section: string) => {
        setSelectedSection(section);
        setError(""); // 에러 초기화
        if (selectedDepartment) {
            fetchEmployees(selectedDepartment, section); // 구역에 맞는 직원만 조회
        }
    };

    useEffect(() => {
        fetchDepartments();
        fetchSectionSettings();
    }, [cookies.accessToken]);

    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="box-container">
                    <div className="organization-container">
                        <div className="form-container1">
                            <div className="org-header">
                                <h3>조직도</h3>
                            </div>
                            <ul>
                                {departments.map((dept, index) => (
                                    <li key={index} onClick={() => handleDepartmentClick(dept.departmentName)}
                                        style={{cursor: "pointer", marginBottom: "10px"}}>
                                        {dept.departmentName}
                                        {useSections && selectedDepartment === dept.departmentName && sections.length > 0 && (
                                            <div className="section-container">
                                                <ul>
                                                    {sections.map((section, idx) => (
                                                        <li
                                                            key={idx}
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // 이벤트 버블링 방지
                                                                handleSectionChange(section); // 구역 클릭 시 해당 구역 직원만 표시
                                                            }}
                                                            style={{cursor: "pointer", marginBottom: "6px"}}
                                                        >
                                                            {section}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="employee-list-container">
                        <h2 style={{textAlign: "center"}}>
                            {selectedDepartment
                                ? `${selectedDepartment} ${selectedSection ? '- ' + selectedSection : ''} 직원 목록`
                                : "부서를 선택하세요"}
                        </h2>
                        {error && <p className="error-message">{error}</p>}
                        {employees.length === 0 ? (
                            <div>등록된 직원이 없습니다.</div>
                        ) : (
                            <>
                                <div style={{textAlign: "right", marginRight: "20px", fontWeight: "bold"}}>
                                    {`총 직원 수: ${employees.length}명`}
                                </div>
                                <div className="divider">
                                    <div className="employee-cards">
                                        {employees.map((emp) => (
                                            <div key={emp.id} className="employee-card">
                                                <img
                                                    src={`data:image/png;base64,${emp.profileImage}`}
                                                    alt={emp.name}
                                                    className="employee-profile"
                                                />
                                                <div className="employee-info">
                                                    <div className="employee-name">name: {emp.name}</div>
                                                    <div className="employee-position">position: {emp.position}</div>
                                                    <div className="employee-phone">phone: {emp.phone}</div>
                                                    <div
                                                        className="employee-dept">dept: {emp.departmentName || "부서 없음"}</div>
                                                    {useSections && (
                                                        <div
                                                            className="employee-section">section: {emp.sectionName || "구역 없음"}</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
);
};

export default OrganizationView;
