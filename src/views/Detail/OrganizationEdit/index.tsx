import Layout from '../../../components/Layout';
import React, { useEffect, useState } from "react";
import "./style.css";
import { useCookies } from "react-cookie";
import axios from "axios";
import Modal from "../../../components/Modal";
import DepartmentModal from "../../../components/Modal/DepartmentModal";
import EmployeeModal from "../../../components/Modal/EmployeeModal";
import { BsTrash } from "react-icons/bs";

interface Department {
    id: number;
    departmentName: string;
    flag: string;
    sections: {sectionName: string}[];
}

interface Employee {
    id: number;
    kakaoUuid: string; // 추가: 직원의 Kakao UUID
    name: string;
    position: string;
    phone: string;
    departmentName: string;
    sectionName: string;
    profileImage: string | null;
}


const OrganizationEdit = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const [selectedDepartment, setSelectedDepartment] = useState<string>("");
    const [selectedSection, setSelectedSection] = useState<string>("");
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [modalType, setModalType] = useState<'add' | 'edit' | 'delete' | ''>("");
    const [currentDepartment, setCurrentDepartment] = useState<Department | null>(null);
    const [currentEmployee, setCurrentEmployee] = useState<any>(null);
    const [error, setError] = useState<string>("");
    const [cookies] = useCookies(["accessToken"]);
    const [newSection, setNewSection] = useState<string>("");
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


    const fetchEmployees = (department: string, section?: string) => {
        let url = "http://localhost:4040/api/v1/detail/employment/department/employees";
        let params: any = { department };

        // 구역이 선택된 경우, 구역에 해당하는 직원만 조회
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
                setEmployees(response.data); // 응답에 맞게 직원을 업데이트
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
        setError(""); // 에러 초기화
        if (selectedDepartment) {
            fetchEmployees(selectedDepartment, section); // 구역에 맞는 직원만 조회
        }
    };



    useEffect(() => {
        fetchDepartments();
        fetchSectionSettings();
    }, [cookies.accessToken]);


    // 모달 열기 함수 (부서 추가, 수정, 삭제 지원)
    const openDepartmentModal = (type: 'add' | 'edit' | 'delete', department: string = "") => {
        console.log("모달 열기:", type, department);
        let departmentObject: Department;
        if (type === "add") {
            // 부서 추가: 빈 객체 생성
            departmentObject = {
                id: 0,
                departmentName: "",
                flag: "add",
                sections: [],
            };
        } else {
            // 수정 또는 삭제: departments 배열에서 해당 부서 객체를 찾음
            const found = departments.find((d) => d.departmentName === department);
            departmentObject = found ? found : {
                id: 0,
                departmentName: department,
                flag: type === "edit" ? "edit" : "delete",
                sections: [],
            };
        }
        setCurrentDepartment(departmentObject);
        setModalType(type);
        setIsModalOpen(true);
    };

    const openEmployeeModal = (type: 'edit' | 'delete', employee: any) => {
        console.log("직원 모달 열기:", type, employee);
        setModalType(type);
        setCurrentEmployee(employee);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalType("");
        setCurrentDepartment(null);
        setCurrentEmployee(null);
    };

    // 부서 추가/수정/삭제 제출 핸들러
    const handleDepartmentSubmit = (updatedDepartment: Department) => {
        if (modalType === "add") {
            axios
                .post(
                    "http://localhost:4040/api/v1/detail/department/add",
                    { departmentName: updatedDepartment.departmentName },
                    {
                        headers: { Authorization: `Bearer ${cookies.accessToken}` },
                    }
                )
                .then((response) => {
                    console.log("부서 추가 완료:", response.data);
                    fetchDepartments();
                    closeModal();
                })
                .catch((error) => {
                    setError("부서 추가에 실패했습니다.");
                    console.error("부서 추가 실패", error);
                });
        } else if (modalType === "edit") {
            axios.put(
                `http://localhost:4040/api/v1/detail/department/${updatedDepartment.id}/update`,
                updatedDepartment,
                {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` },
                }
            )
                .then(() => {
                    // 부서 목록 상태 업데이트
                    setDepartments(prevDepartments =>
                        prevDepartments.map(dept =>
                            dept.id === updatedDepartment.id ? updatedDepartment : dept
                        )
                    );
                    // 선택된 부서가 수정된 부서라면 선택 상태와 구역 목록을 최신화
                    if (selectedDepartment === currentDepartment?.departmentName) {
                        setSelectedDepartment(updatedDepartment.departmentName);
                        fetchSectionsByDepartment(updatedDepartment.departmentName);
                    }
                    closeModal();
                })
                .catch((error) => {
                    setError("부서 수정에 실패했습니다.");
                    console.error("부서 수정 실패", error);
                });
        } else if (modalType === "delete") {
            handleDepartmentDelete(updatedDepartment.id);
        }
    };

    const handleDepartmentDelete = (departmentId: number) => {
        axios.put(
            `http://localhost:4040/api/v1/detail/department/${departmentId}/delete`,
            {},
            { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
        )
            .then(() => {
                fetchDepartments();
                closeModal();
            })
            .catch((error) => {
                setError("부서 삭제에 실패했습니다.");
                console.error("부서 삭제 실패", error);
            });
    };

    // 직원 수정/삭제 제출 핸들러
    const handleEmployeeSubmit = (employee: Employee) => {
        // 수정: PUT 요청으로 직원 데이터를 업데이트
        const formData = new FormData();
        // FormData에 필드 추가
        formData.append("name", employee.name);
        formData.append("position", employee.position);
        formData.append("phone", employee.phone);
        formData.append("department", employee.departmentName);
        formData.append("section", employee.sectionName);
        formData.append("kakaoUuid", employee.kakaoUuid); // 카카오 UUID도 함께 보내기

        // 프로필 이미지가 Base64 형태로 있다면 이를 다시 Blob 형태로 변환하여 FormData에 추가
        if (employee.profileImage) {
            const base64 = employee.profileImage.split(',')[1]; // Base64 앞부분 (data:image/png;base64,)을 제외한 데이터만 추출
            const byteCharacters = atob(base64);  // Base64를 디코딩하여 바이트 문자열로 변환
            const byteArrays = [];

            // Base64 데이터를 Blob으로 변환
            for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                const slice = byteCharacters.slice(offset, offset + 512);
                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }

            const blob = new Blob(byteArrays, { type: 'image/jpeg' });  // 이미지의 타입을 지정
            const file = new File([blob], "profileImage.jpg", { type: 'image/jpeg' });

            formData.append("profileImage", file);  // FormData에 이미지 파일 추가
        }


        console.log("업데이트할 직원 데이터:", employee); // 데이터 확인용 로그
        axios.put(
            `http://localhost:4040/api/v1/detail/employment/employee/${employee.id}/update`,
            formData,
            {
                headers: {
                    Authorization: `Bearer ${cookies.accessToken}`, "Content-Type": "multipart/form-data" // FormData를 보낼 때는 이 헤더가 필요 }
                }
            }
        )
            .then(() => {
                fetchEmployees(selectedDepartment, selectedSection);
                closeModal();
            })
            .catch((error) => {
                setError("직원 수정에 실패했습니다.");
                console.error("직원 수정 실패", error);
            });
    };

    const handleDeleteEmployee = (employeeId: number) => {
        if (window.confirm("정말 삭제하시겠습니까?")) {
            axios
                .delete(`http://localhost:4040/api/v1/detail/employment/employee/${employeeId}/delete`, {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` },
                })
                .then(() => {
                    // 삭제 후, 선택된 부서와 구역의 직원 목록을 다시 불러옴
                    fetchEmployees(selectedDepartment, selectedSection);
                })
                .catch((error) => {
                    setError("직원 삭제에 실패했습니다.");
                    console.error("직원 삭제 실패", error);
                });
        }
    };

    const TrashIcon = BsTrash as unknown as React.FC<React.SVGProps<SVGSVGElement>>;


    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="box-container">
                    <div className="organization-container">
                        <div className="form-container1">
                            <h3>
                                조직도
                                <button className="add-btn" onClick={() => openDepartmentModal('add')}>+ 부서 추가</button>
                            </h3>
                            <ul>
                                {departments.map((dept, index) => (
                                    <li key={index} style={{cursor: "pointer", marginBottom: "10px"}}>
                                        <div className="li-header"
                                             onClick={() => handleDepartmentClick(dept.departmentName)}>
                                            <span className="li-text">{dept.departmentName}</span>
                                            <div className="btn-group">
                                                <button
                                                    className="edit-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDepartmentModal("edit", dept.departmentName);
                                                    }}
                                                >
                                                    수정
                                                </button>
                                                <button
                                                    className="delete-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDepartmentModal("delete", dept.departmentName);
                                                    }}
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                        {useSections && selectedDepartment === dept.departmentName && dept.sections && dept.sections.length > 0 && (
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
                    {/* 직원 목록 */}
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
                            <div className="employee-cards">
                                {employees.map((emp) => (
                                    <div key={emp.id} className="employee-card"
                                         onClick={() => openEmployeeModal("edit", emp)}>
                                        {/* 삭제 아이콘 (클릭 시 이벤트 발생) */}
                                        <div className="delete-icon" onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteEmployee(emp.id);
                                        }}>
                                            <TrashIcon className="trash-icon"/>
                                        </div>


                                        <img src={`data:image/png;base64,${emp.profileImage}`} alt={emp.name}
                                             className="employee-profile"/>
                                        <div className="employee-info">
                                            <div className="employee-name">name: {emp.name}</div>
                                            <div className="employee-position">position: {emp.position}</div>
                                            <div className="employee-phone">phone: {emp.phone}</div>
                                            <div className="employee-dept">dept: {emp.departmentName || "부서 없음"}</div>
                                            {useSections && (
                                                <div
                                                    className="employee-section">section: {emp.sectionName || "구역 없음"}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                </div>

                {/* 모달 렌더링 */}
                <Modal isOpen={isModalOpen} onClose={closeModal}>
                    {((modalType === "add") ||
                        ((modalType === "edit" || modalType === "delete") && currentDepartment !== null)) && (
                        <DepartmentModal
                            type={modalType as "add" | "edit" | "delete"}
                            currentDepartment={currentDepartment!}
                            onSubmit={handleDepartmentSubmit}
                            onClose={closeModal}
                            accessToken={cookies.accessToken}
                            isOpen={isModalOpen}
                            onDelete={handleDepartmentDelete}
                            cookies={cookies}
                        />
                    )}
                    {(modalType === "edit" && currentEmployee) && (
                        <EmployeeModal
                            currentEmployee={currentEmployee}
                            onSubmit={handleEmployeeSubmit}
                            onClose={closeModal}
                            isOpen={isModalOpen}
                            cookies={{accessToken: cookies.accessToken}}
                            onDelete={handleDeleteEmployee}
                        />
                    )}
                </Modal>
        </Layout>
);
};

export default OrganizationEdit;
