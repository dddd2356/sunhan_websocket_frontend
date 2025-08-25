// Modal 컴포넌트 - 모달 창을 띄우는 컴포넌트
import React, { ReactNode } from "react";
import ReactDOM from "react-dom";
import "./style.css";

// ModalProps 타입 정의: 모달의 open 상태, 닫기 함수, children을 받을 수 있도록 설정
interface ModalProps {
    isOpen: boolean;  // 모달이 열려있는지 여부
    onClose: () => void;  // 모달을 닫는 함수
    children: ReactNode;  // 모달 내용에 들어갈 자식 컴포넌트
}

// Modal 컴포넌트: 모달이 열리면 React Portal을 통해 모달을 화면에 띄운다
const EmployeeModal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null; // 모달이 열리지 않으면 null을 반환하여 렌더링 하지 않음

    return ReactDOM.createPortal(
        <div className="modal-overlay" onClick={onClose}> {/* 모달 배경 클릭 시 모달 닫기 */}
            <div onClick={(e) => e.stopPropagation()}> {/* 모달 내부 클릭 시 배경 클릭 이벤트 방지 */}
                {children} {/* 자식 요소 렌더링 */}
            </div>
        </div>,
        document.getElementById("modal-root") as HTMLElement // React Portal을 사용하여 모달을 특정 DOM에 렌더링
    );
};

export default EmployeeModal;
