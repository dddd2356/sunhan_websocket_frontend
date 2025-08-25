import React, { useEffect, useState } from 'react';
import MessageSender from '../../../components/MessageSender';
import './style.css';
import Layout from "../../../components/Layout";
import { useCookies } from "react-cookie";
import axios from "axios";

// Department 타입 정의
interface Department {
    id: number;
    departmentName: string;
    flag: string;
    sections: any[];  // 섹션 배열
}

interface Employee {
    id: number;
    kakaoUuid: string;
    name: string;
    position: string;
    phone: string;
    departmentName: string;
    section: string;
    profileImage: string | null;
}

const MessageIndividual: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const [selectedDepartment, setSelectedDepartment] = useState<string>("");
    const [selectedSection, setSelectedSection] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [cookies] = useCookies(["accessToken"]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [searchResults, setSearchResults] = useState<Employee[]>([]);
    const [useSections, setUseSections] = useState<boolean>(true); // 구역 사용 여부 상태

    // 전체 직원 목록 가져오기
    useEffect(() => {
        axios.get("http://localhost:4040/api/v1/detail/employment/all", {
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => {
                const updatedEmployees = response.data.map((emp: any) => ({
                    ...emp,
                    section: emp.section ? emp.section.sectionName : "구역 없음",
                    departmentName: emp.departmentName || "부서 없음",
                    kakaoUuid: emp.kakaoUuid || 'no-uuid'
                }));
                setEmployees(updatedEmployees);
            })
            .catch((error) => {
                console.error("직원 목록을 가져오는데 실패했습니다.", error);
                setError("직원 목록을 가져오는데 실패했습니다.");
            });
    }, [cookies.accessToken]);



    // 부서 목록 가져오기
    useEffect(() => {
        axios.get("http://localhost:4040/api/v1/detail/department/departments", {
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => setDepartments(response.data))
            .catch(() => setError("부서 목록을 불러오는데 실패했습니다."));
    }, [cookies.accessToken]);

    // 구역 사용 여부 설정 가져오기
    const fetchSectionSettings = () => {
        axios.get("http://localhost:4040/api/v1/detail/department/settings/sections", {
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
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

    // 부서 클릭 시 구역 목록 조회
    const handleDepartmentClick = (department: string) => {
        if (selectedDepartment === department) {
            setSelectedDepartment(""); // 부서 선택 해제
            setSelectedSection("");    // 섹션 초기화
            setSections([]);           // 섹션 목록 초기화
            fetchEmployees("all");     // 전체 직원 목록 다시 불러오기
            return;
        }

        setSelectedDepartment(department);
        setSelectedSection("");  // 섹션 초기화
        setEmployees([]);        // 기존 직원 목록 초기화

        const departmentObj = departments.find(dept => dept.departmentName === department);
        if (departmentObj && departmentObj.sections.length > 0) {
            const processedSections = departmentObj.sections.map((sec) => {
                try {
                    if (sec.sectionName && sec.sectionName.startsWith('{"sectionName":')) {
                        const parsed = JSON.parse(sec.sectionName);
                        return parsed.sectionName;
                    }
                    return sec.sectionName;
                } catch (e) {
                    return sec.sectionName;
                }
            });
            setSections(processedSections);
        } else {
            setSections([]);
        }

        fetchEmployees(department);
    };

// 직원 목록 조회 (전체/부서별/섹션별)
    const fetchEmployees = (department: string, section?: string) => {
        let url = "http://localhost:4040/api/v1/detail/employment/all"; // 기본: 전체 직원 조회
        let params: any = {};

        if (department !== "all") {
            url = "http://localhost:4040/api/v1/detail/employment/department/employees";
            params.department = department;

            if (useSections && section) {
                url = "http://localhost:4040/api/v1/detail/employment/department/section/employees";
                params.section = section;
            }
        }

        axios.get(url, {
            params,
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => {
                const updatedEmployees = response.data.map((emp: any) => ({
                    ...emp,
                    section: emp.section ? emp.section.sectionName : "구역 없음",
                    departmentName: department !== "all" ? department : emp.departmentName || "부서 없음",
                    kakaoUuid: emp.kakaoUuid || 'no-uuid',
                }));

                setEmployees(updatedEmployees);
            })
            .catch((error) => {
                console.error("직원 목록을 가져오는데 실패했습니다.", error);
                setError("직원 목록을 가져오는데 실패했습니다.");
            });
    };

// 검색어에 맞는 직원 목록 필터링
// 검색 기능 (선택된 부서가 없을 때는 전체 직원 검색)
    useEffect(() => {
        if (searchTerm.trim() === "") {
            setSearchResults([]);
        } else {
            const targetEmployees = selectedDepartment ? employees : employees; // 부서 선택 여부에 따라 검색 대상 변경
            const filteredEmployees = targetEmployees.filter((emp) =>
                emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.id.toString().includes(searchTerm) ||
                emp.departmentName.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setSearchResults(filteredEmployees);
        }
    }, [searchTerm, employees, selectedDepartment]);

    // 구역 클릭 시 직원 목록 조회
    const handleSectionChange = (section: string) => {
        setSelectedSection(section);
        fetchEmployees(selectedDepartment, section); // 직원 목록을 구역별로 조회
    };


    // 직원 추가
    const handleAddEmployee = (employee: Employee) => {
        if (!selectedEmployees.some((emp) => emp.id === employee.id)) {
            const updatedEmployee = { ...employee, uuid: employee.kakaoUuid || 'no-uuid' };
            setSelectedEmployees([...selectedEmployees, updatedEmployee]);
        }
    };

    // 직원 삭제
    const handleRemoveEmployee = (employee: Employee) => {
        setSelectedEmployees(selectedEmployees.filter(emp => emp.id !== employee.id));
    };

    useEffect(() => {
        fetchSectionSettings();
    }, [selectedEmployees]);



    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="box-container">
                    <div className="left-pane">
                        <div className="form-container1">
                            <h3>조직도</h3>
                            <input
                                type="text"
                                placeholder="직원 검색..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                            />

                            {/* 🔹 검색 결과 표시 */}
                            {searchTerm.trim().length > 0 && (
                                <ul className="search-results">
                                    {searchResults.length > 0 ? (
                                        searchResults.map((emp) => (
                                            <li key={emp.id} className="search-result-item">
                                                {emp.name} ({emp.id}) - {emp.departmentName}
                                                <button className="add-btn" onClick={() => handleAddEmployee(emp)}>추가
                                                </button>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="search-no-result">검색 결과가 없습니다.</li>
                                    )}
                                </ul>
                            )}

                            {/* 🔹 검색어 없을 때 기존 조직도 표시 */}
                            {searchTerm.trim().length === 0 && (
                                <ul>
                                    {departments.map((dept) => (
                                        <li key={dept.id} style={{cursor: "pointer", marginBottom: "10px"}}>
                                            <div
                                                className="li-header"
                                                onClick={() => handleDepartmentClick(dept.departmentName)}
                                            >
                                                <span className="li-text">{dept.departmentName}</span>
                                            </div>

                                            {useSections && selectedDepartment === dept.departmentName && sections.length > 0 ? (
                                                <div className="section-container">
                                                    <ul>
                                                        {sections.map((section, idx) => (
                                                            <li
                                                                key={idx}
                                                                onClick={() => handleSectionChange(section)}
                                                                style={{cursor: "pointer", marginBottom: "6px"}}
                                                            >
                                                                {section}
                                                                {selectedSection === section && employees.length > 0 && (
                                                                    <div className="employee-list">
                                                                        {employees.map((emp) => (
                                                                            <div key={emp.id} className="employee-line">
                                                                        <span className="employee-text">
                                                                            {emp.name} ({emp.id})
                                                                        </span>
                                                                                <button className="add-btn"
                                                                                        onClick={() => handleAddEmployee(emp)}>
                                                                                    추가
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ) : (
                                                selectedDepartment === dept.departmentName && employees.length > 0 && (
                                                    <div className="employee-list">
                                                        {employees.map((emp) => (
                                                            <div key={emp.id} className="employee-line">
                                                        <span className="employee-text">
                                                            {emp.name} ({emp.id})
                                                        </span>
                                                                <button className="add-btn"
                                                                        onClick={() => handleAddEmployee(emp)}>
                                                                    추가
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* 중간 영역: 선택된 직원 목록 */}
                    <div className="middle-pane">
                        <div className="form-container2">
                            <h3>선택된 직원</h3>
                            {selectedEmployees.length === 0 ? (
                                <div className="centered">선택된 직원이 없습니다.</div>
                            ) : (
                                <ul>
                                    {selectedEmployees.map((emp) => (
                                        <li key={emp.id}>
                                            {emp.name} ({emp.departmentName})
                                            <button className="delete-btn"
                                                    onClick={() => handleRemoveEmployee(emp)}>삭제</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="right-pane">
                        <MessageSender
                            selectedSendType="INDIVIDUAL"
                            selectedEmployees={selectedEmployees.map(emp => emp.id)}
                        />
                    </div>
                </div>
            </div>
        </Layout>
);
};

export default MessageIndividual;
