import React, {useEffect, useState} from 'react';
import OrganizationView from '../OrganizationView';
import MessageSender from '../../../components/MessageSender';
import './style.css';
import Layout from "../../../components/Layout";
import {useCookies} from "react-cookie";
import axios from "axios"; // CSS 파일 이름은 그대로 사용하거나 필요에 따라 변경


// Department 타입 정의
interface Department {
    id: number;
    departmentName: string;
    flag: string;
    sections: any[]; // sections 타입을 정의하거나 `any[]`로 설정
}

const MessageDepartment: React.FC = () => {

    const [employees, setEmployees] = useState<any[]>([]);
    const [sections, setSections] = useState<string[]>([]); // 구역 목록 (문자열 배열)
    const [selectedDepartment, setSelectedDepartment] = useState<string>("");
    const [selectedSection, setSelectedSection] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [cookies] = useCookies(["accessToken"]);
    const [departments, setDepartments] = useState<Department[]>([]); // 부서 상태 타입 수정
    const [selectedDepartments, setSelectedDepartments] = useState<Department[]>([]); // 선택된 부서 목록
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
                // 만약 API가 문자열 배열을 반환하면 그대로 사용
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

        // 구역이 선택된 경우 구역에 해당하는 직원만 조회
        if (useSections && section) {
            url = "http://localhost:4040/api/v1/detail/employment/department/section/employees";
            params.section = section;
        }

        axios.get(url, {
            params,
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => {
                console.log("직원 데이터:", response.data);

                // 응답 데이터에서 직원 목록 처리
                const updatedEmployees = response.data.map((emp: any) => {
                    return {
                        ...emp,
                        section: emp.section ? emp.section.sectionName : "구역 없음",
                        departmentName: department || "부서 없음",
                        kakaoUuid: emp.kakaoUuid || 'no-uuid'
                    };
                });

                setEmployees(updatedEmployees); // 응답에 맞게 직원을 업데이트
            })
            .catch((error) => {
                console.error("직원 목록을 가져오는데 실패했습니다.", error);
                setError("직원 목록을 가져오는데 실패했습니다.");
            });
    };

    // 구역 클릭 시 해당 구역의 직원 목록 조회
    const fetchEmployeesBySection = (department: string, section: string) => {
        axios.get("http://localhost:4040/api/v1/detail/employment/department/section/employees", {
            params: { department, section },
            headers: { Authorization: `Bearer ${cookies.accessToken}` },
        })
            .then((response) => {
                console.log("직원 목록 응답 데이터:", response.data);

                const employeesWithSections = response.data.map((emp: any) => {
                    // 섹션 객체에서 섹션 이름 추출
                    const sectionInfo = emp.section ? emp.section.sectionName : "구역 없음"; // 객체에서 sectionName을 추출
                    const departmentName = department || "부서 없음"; // department를 직접 사용

                    return {
                        ...emp,
                        section: sectionInfo, // 섹션 이름 추가
                        departmentName: departmentName // 부서 이름 추가
                    };
                });

                console.log("직원 데이터:", employeesWithSections);
                setEmployees(employeesWithSections);
            })
            .catch((error) => {
                console.error("직원 목록을 가져오는데 실패했습니다.", error);
                setError("직원 목록을 가져오는데 실패했습니다.");
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
        if (selectedDepartment) {
            fetchEmployeesBySection(selectedDepartment, section);
        }
    };

    // 부서를 선택 목록에 추가하는 함수
    const addDepartmentToBox = (department: Department) => {
        if (!selectedDepartments.some((dept) => dept.id === department.id)) {
            setSelectedDepartments([...selectedDepartments, department]);
        }
    };

    // 부서 삭제
    const handleRemoveDepartment = (department: Department) => {
        setSelectedDepartments(selectedDepartments.filter(dep => dep.id !== department.id));
    };

    useEffect(() => {
        fetchDepartments();
        fetchSectionSettings();
    }, [cookies.accessToken]);



    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="box-container">
                    <div className="left-pane">
                        <div className="form-container1">
                            <h3>조직도</h3>
                            <ul>
                                {departments.map((dept, index) => (
                                    <li key={index} style={{cursor: "pointer", marginBottom: "10px"}}>
                                        <div className="li-header"
                                             onClick={() => handleDepartmentClick(dept.departmentName)}>
                                            <span className="li-text">{dept.departmentName}</span>
                                            <button className="add-btn" onClick={() => addDepartmentToBox(dept)}
                                                    style={{marginLeft: "10px"}}>
                                                추가
                                            </button>
                                        </div>
                                        {useSections && selectedDepartment === dept.departmentName && dept.sections && dept.sections.length > 0 && (
                                            <div className="section-container">
                                                <ul>
                                                    {sections.map((section, idx) => (
                                                        <li
                                                            key={idx}
                                                            onClick={() => handleSectionChange(section)}
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

                    {/* 선택된 부서 목록 */}
                    <div className="middle-pane">
                        <div className="form-container2">
                            <h3>선택된 부서</h3>
                            {selectedDepartments.length === 0 ? (
                                <div className="centered">선택된 부서가 없습니다.</div>
                            ) : (
                                <ul>
                                    {selectedDepartments.map((dept) => (
                                        <li key={dept.id} style={{marginBottom: "6px"}}>
                                            {dept.departmentName}
                                            <button className="delete-btn"
                                                    onClick={() => handleRemoveDepartment(dept)}>삭제
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="right-pane">
                        <MessageSender
                            selectedSendType={"DEPARTMENT"}
                            selectedDepartments={selectedDepartments.map(dep => dep.departmentName)} // 선택된 부서 전달
                        />
                    </div>
                </div>
            </div>
        </Layout>
);
};

export default MessageDepartment;
