import React, { useState, useEffect } from "react";
import axios from "axios";
import "./style.css"; // CSS 파일 불러오기
import "../style.css"


interface Department {
    id: number;
    departmentName: string;  // departmentName 추가
    flag: string;
    sections: {section: string}[];
}

interface Cookies {
    accessToken: string;
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

interface EmployeeModalProps {
    // 이제 오직 "edit"만 지원합니다.
    currentEmployee: Employee;
    onSubmit: (employee: Employee) => void;
    onClose: () => void;
    isOpen: boolean;
    onDelete: (employeeId: number) => void; // 삭제할 때 호출할 함수 추가
    cookies: Cookies; // cookies의 타입을 정확하게 지정
}

const EmployeeModal: React.FC<EmployeeModalProps> = ({
                                                         currentEmployee,
                                                         onSubmit,
                                                         onClose,
                                                         isOpen,
                                                         onDelete,
                                                         cookies,
                                                     }) => {
    const [name, setName] = useState(currentEmployee.name || "");
    const [position, setPosition] = useState(currentEmployee.position || "");
    const [phone, setPhone] = useState(currentEmployee.phone || "");
    const [department, setDepartment] = useState(currentEmployee.departmentName || "");
    const [section, setSection] = useState(currentEmployee.sectionName || "");
    const [image, setImage] = useState<string | null>(null); // 이미지를 업로드할 상태
    const [departments, setDepartments] = useState<Department[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const positions = ["사원", "간호사", "과장", "팀장", "부장", "원장"];
    const [useSections, setUseSections] = useState<boolean>(true); // 구역 사용 여부 상태



    // 부서 목록 가져오기
    useEffect(() => {
        if (!cookies?.accessToken) {
            console.error("🚨 accessToken이 없음! 로그인이 필요합니다.");
            return;
        }

        axios.get("http://localhost:4040/api/v1/detail/department/departments", {
            headers: {
                Authorization: `Bearer ${cookies.accessToken}`,
            },
        })
            .then((response) => {
                console.log("✅ 부서 데이터 가져오기 성공:", response.data);

                // 문자열 배열 → 객체 배열 변환
                const formattedDepartments = response.data.map((dept: Department) => ({
                    departmentName: dept.departmentName
                }));

                setDepartments(formattedDepartments);
            })
            .catch((error) => {
                console.error("🚨 부서 목록을 가져오는 데 실패했습니다:", error);
            });
    }, [cookies.accessToken]);

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

    useEffect(() => {
        fetchSectionSettings();
        if (!department || !cookies?.accessToken) return; // 선택된 부서가 없으면 실행하지 않음

        axios.get("http://localhost:4040/api/v1/detail/employment/department/sections", {
            params: { department }, // 선택한 부서의 ID를 파라미터로 전달
            headers: {
                Authorization: `Bearer ${cookies.accessToken}`,
            },
        })
            .then((response) => {
                console.log("✅ 구역 데이터 가져오기 성공:", response.data);
                setSections(response.data);
            })
            .catch((error) => {
                console.error("🚨 구역 목록을 가져오는 데 실패했습니다:", error);
            });
    }, [department, cookies.accessToken]);

    // 이미지 변경 핸들러
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string); // 파일을 base64로 읽어서 상태에 저장
            };
            reader.readAsDataURL(file);
        }
    };

    // 수정/삭제 제출 핸들러
    const handleSubmit = () => {
        const updatedEmployee = {
            id: currentEmployee.id,
            name,
            position,
            phone,
            departmentName: department, // departmentName으로 변경
            sectionName: section,
            profileImage: image, // 수정된 이미지 값
            kakaoUuid: currentEmployee.kakaoUuid
        };
        onSubmit(updatedEmployee);
    };


    return (
        <div className={`modal-edit-body ${isOpen ? "open" : ""}`}>
            <div className="employee-modal-content">
                <button className="close-btn" onClick={onClose}>
                    X
                </button>
                <div>
                    <h3>직원 정보</h3>
                    <div className="form-group">
                        <label>이름</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label>직급</label>
                        <select
                            value={position}
                            onChange={(e) => setPosition(e.target.value)}
                            required
                        >
                            <option value="">직급 선택</option>
                            {positions.map((pos) => (
                                <option key={pos} value={pos}>
                                    {pos}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>전화번호</label>
                        <input
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label>부서</label>
                        <select
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                        >
                            <option value="">부서 선택</option>
                            {departments.map((dept, idx) => (
                                <option key={idx} value={dept.departmentName}>
                                    {dept.departmentName}
                                </option>
                            ))}
                        </select>
                    </div>
                    {useSections && (
                    <div className="form-group">
                        <label>구역</label>
                        <select
                            value={section}
                            onChange={(e) => setSection(e.target.value)}
                        >
                            <option value="">구역 선택</option>
                            {sections.map((sec, idx) => (
                                <option key={idx} value={sec}>
                                    {sec}
                                </option>
                            ))}
                        </select>
                    </div>
                    )}

                    <div className="form-group">
                        <label>프로필 이미지</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                        />
                        {image && <img src={image} alt="Profile" style={{width: "100px"}}/>}
                    </div>

                    <div className="modal-actions">
                        <button className="modal-submit-btn" onClick={handleSubmit}>
                            저장
                        </button>
                        <button className="modal-cancel-btn" onClick={onClose}>
                            취소
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default EmployeeModal;
