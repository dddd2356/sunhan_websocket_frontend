import React, { useState, useEffect } from "react";
import axios from "axios";
import "./style.css"; // CSS 파일 불러오기
import "../style.css";
import { useParams } from "react-router-dom"; // URL에서 파라미터 추출

interface Department {
    id: number;
    departmentName: string; // 부서 이름
    flag: string;
    sections: Section[];  // 섹션 목록
}

interface Cookies {
    accessToken?: string;
}

interface Section {
    sectionName: string;
    id?: number; // 섹션 ID
    isVisible?: boolean;
}

interface DepartmentModalProps {
    type: "edit" | "delete" | "add"; // 모달 타입 (수정, 삭제, 추가)
    currentDepartment: Department; // 현재 부서 정보
    onSubmit: (updatedDepartment: Department) => void; // 부서 정보 수정 후 콜백 함수
    onClose: () => void; // 모달 닫기 콜백 함수
    accessToken: string; // 인증 토큰
    isOpen: boolean; // 모달 열림 상태
    onDelete: (departmentId: number) => void; // 부서 삭제 콜백 함수
    cookies: Cookies; // 쿠키 데이터
}

const DepartmentModal: React.FC<DepartmentModalProps> = ({
                                                             type,
                                                             currentDepartment,
                                                             onSubmit,
                                                             onClose,
                                                             isOpen,
                                                             onDelete,
                                                             cookies,
                                                         }) => {
    const [departmentName, setDepartmentName] = useState(currentDepartment.departmentName); // 부서 이름 상태
    const [sections, setSections] = useState<{ sectionName: string; id?: number; isVisible?: boolean }[]>([]); // 섹션 상태

    const { departmentId } = useParams(); // URL에서 부서 ID 추출
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false); // 삭제 확인 모달 상태
    const [useSections, setUseSections] = useState<boolean>(true); // 구역 사용 여부 상태

    // 부서 정보 변경 시 섹션 상태 업데이트
    useEffect(() => {
        setDepartmentName(currentDepartment.departmentName);

        // 정규 표현식으로 JSON 문자열 확인
        const parseSectionName = (section: Section) => {
            try {
                // JSON 형식으로 저장된 섹션인지 확인
                if (section.sectionName && section.sectionName.startsWith('{"sectionName":')) {
                    const parsed = JSON.parse(section.sectionName);
                    return {
                        ...section,
                        sectionName: parsed.sectionName
                    };
                }
                return section;
            } catch (e) {
                return section;
            }
        };

        const processedSections = currentDepartment.sections.map((sec) => {
            const processedSection = parseSectionName(sec);
            return {
                sectionName: processedSection.sectionName || "",
                id: processedSection.id ?? -1, // id가 없으면 -1로 기본값 처리
                isVisible: processedSection.isVisible
            };
        });

        setSections(processedSections);
    }, [currentDepartment]); // currentDepartment 변경 시 상태 업데이트

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

    // 섹션 수정 핸들러
    const handleSectionChange = (index: number, newName: string) => {
        setSections((prevSections) =>
            prevSections.map((sec, idx) =>
                idx === index ? { ...sec, sectionName: newName } : sec
            )
        );
    };

    // 섹션 추가 핸들러
    const handleAddSection = () => {
        const newSection = { sectionName: "", id: -1 }; // 새로운 섹션 추가 (id=-1로 구분)
        setSections((prevSections) => [...prevSections, newSection]);
    };

    // 섹션 삭제 핸들러
    const handleDeleteSection = (index: number) => {
        const sectionToDelete = sections[index];
        setSections(sections.filter((_, idx) => idx !== index)); // 상태에서 섹션 삭제

        if (sectionToDelete.id && sectionToDelete.id > 0) {
            // 이미 저장된 섹션만 삭제 API 호출
            deleteSection(currentDepartment.id, sectionToDelete.sectionName);
        }
    };

    // 섹션 추가 API 요청
    const addSection = (departmentId: number, sectionName: string) => {
        // sectionName만 전송하여 서버에서 직접 문자열로 처리하도록 함
        axios
            .post(
                `http://localhost:4040/api/v1/detail/department/${departmentId}/sections/add`,
                { sectionName },
                {
                    headers: {
                        Authorization: `Bearer ${cookies.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                }
            )
            .then((response) => {
                console.log("섹션 추가 완료:", response.data);

                // 응답 데이터 처리
                let newSection;
                try {
                    // 응답이 문자열인 경우 파싱
                    if (typeof response.data === "string") {
                        newSection = JSON.parse(response.data);
                    } else {
                        newSection = response.data;
                    }

                    // 중첩된 JSON 문자열인 경우 추가 처리
                    if (newSection.sectionName && typeof newSection.sectionName === 'string' && newSection.sectionName.startsWith('{"')) {
                        try {
                            const innerData = JSON.parse(newSection.sectionName);
                            newSection.sectionName = innerData.sectionName || newSection.sectionName;
                        } catch (e) {
                            // 파싱 실패 시 원본 유지
                        }
                    }

                    console.log("처리된 섹션 데이터:", newSection);

                    // 섹션 상태 업데이트는 하지 않고, 부서 정보를 다시 불러와 자동으로 갱신되도록 함
                } catch (e) {
                    console.error("섹션 데이터 파싱 실패:", e);
                }
            })
            .catch((error) => {
                console.error("섹션 추가 실패", error);
            });
    };

    // 섹션 수정 API 요청
    const editSection = async (
        departmentId: number,
        oldSectionName: string,
        newSectionName: string,
        sectionId: number,
        departmentName: string
    ) => {
        const payload = {
            departmentId,
            oldSectionName,
            newSectionName,
            sectionId,
            departmentName,
        };

        console.log("📌 요청 데이터:", payload);

        try {
            const response = await axios.put(
                `http://localhost:4040/api/v1/detail/department/${departmentId}/sections/update`,
                payload,
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${cookies.accessToken}`,
                    },
                }
            );
            console.log("✅ 섹션 수정 성공:", response.data);
        } catch (error) {
            console.error("❌ 섹션 수정 실패", error);
            throw error;
        }
    };

    // 섹션 삭제 API 요청
    const deleteSection = (departmentId: number, sectionName: string) => {
        axios
            .put(
                `http://localhost:4040/api/v1/detail/department/${departmentId}/sections/delete`,
                { sectionName }, // sectionName을 객체 형태로 전송
                {
                    headers: {
                        "Content-Type": "application/json", // JSON 형식으로 전송
                        Authorization: `Bearer ${cookies.accessToken}`,
                    },
                }
            )
            .then((response) => {
                console.log("섹션 삭제 완료:", response.data);
            })
            .catch((error) => {
                console.error("섹션 삭제 실패", error);
            });
    };


    // 부서 정보 제출 핸들러
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); // 폼 기본 제출 동작 방지

        const departmentId = currentDepartment.id;

        // 추가된 섹션들 처리 (id가 -1인 항목)
        const newSections = sections.filter(sec => sec.id === -1 && sec.sectionName.trim() !== "");
        for (const section of newSections) {
            try {
                await addSection(departmentId, section.sectionName);
            } catch (error) {
                console.error("새 섹션 추가 실패:", error);
            }
        }

        // 수정된 섹션들 처리
        const originalSections = currentDepartment.sections;
        const updatedSections = sections.filter(sec => sec.id !== -1); // 기존 섹션들

        for (const section of updatedSections) {
            const originalSection = originalSections.find(s => s.id === section.id);
            if (originalSection && originalSection.sectionName !== section.sectionName) {
                try {
                    // 원래 섹션명이 JSON 문자열인지 확인하고 처리
                    let origSectionName = originalSection.sectionName;
                    try {
                        if (origSectionName.startsWith('{"sectionName":')) {
                            const parsed = JSON.parse(origSectionName);
                            origSectionName = parsed.sectionName;
                        }
                    } catch (e) {
                        // 파싱 실패 시 원본 유지
                    }

                    await editSection(
                        departmentId,
                        origSectionName,
                        section.sectionName,
                        section.id!,
                        departmentName
                    );
                } catch (error) {
                    console.error("섹션 수정 실패:", error);
                }
            }
        }

        const updatedDepartment = {
            ...currentDepartment,
            departmentName, // 부서 이름 업데이트
            sections: updatedSections, // 섹션 상태 업데이트
        };

        onSubmit(updatedDepartment); // 부서 정보 제출
        onClose(); // 모달 닫기
    };

    useEffect(() => {
        fetchSectionSettings();
    }, [cookies.accessToken]);

    return (
        <div className={`modal-content ${isOpen ? 'open' : ''}`}>
            <div className="department-modal-content">
                <h3>{type === "edit" ? "부서 수정" : type === "delete" ? "부서 삭제" : "부서 추가"}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="department-input">
                        <label>부서명</label>
                        <input
                            type="text"
                            value={departmentName}
                            onChange={(e) => setDepartmentName(e.target.value)} // 부서명 상태 변경
                            disabled={type === "delete"}
                        />
                    </div>

                    <div className="add-section-container">
                        {useSections && type !== "delete" && (
                            <>
                                <label className="section-label">섹션 수정</label>
                                <button
                                    type="button"
                                    onClick={handleAddSection}
                                    className="add-section-btn"
                                >
                                    추가
                                </button>
                            </>
                        )}
                    </div>


                    {useSections && sections.map((section, index) => (
                        <div key={index} className="section-input">
                            <input
                                type="text"
                                value={section.sectionName}
                                onChange={(e) => handleSectionChange(index, e.target.value)} // 섹션 이름 변경
                                disabled={type === "delete"}
                            />
                            {type !== "delete" && (
                                <button type="button" onClick={() => handleDeleteSection(index)}
                                        className="delete-section-btn">
                                    삭제
                                </button>
                            )}
                        </div>
                    ))}
                    <div className="modal-actions">
                        <button type="submit">{type === "delete" ? "삭제" : "저장"}</button>
                        <button type="button" onClick={onClose}>닫기</button>
                    </div>
                </form>
            </div>
        </div>
    );
};



export default DepartmentModal;
