import React, { useState } from 'react';
import axios from 'axios';
import { useCookies } from 'react-cookie';
import './style.css';

interface MessageSenderProps {
    selectedSendType: 'ALL' | 'DEPARTMENT' | 'INDIVIDUAL';
    selectedDepartments?: string[]; // 부서명 배열
    selectedEmployees?: number[];  // 직원 ID 배열
}

const MessageSender: React.FC<MessageSenderProps> = ({ selectedSendType, selectedDepartments = [], selectedEmployees = [] }) => {
    const [message, setMessage] = useState<string>("");
    const [cookies] = useCookies(["accessToken"]);
    const [status, setStatus] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    const handleSendMessage = async () => {
        if (!cookies.accessToken) {
            setStatus("토큰이 없습니다. 다시 로그인해주세요.");
            return;
        }
        if (!message.trim()) {
            setStatus("메시지를 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            let url = '';
            let payload: any = {
                message,                          // ← 여기
                sendType: selectedSendType,       // DTO에 정의된 sendType
            };

            switch (selectedSendType) {
                case 'ALL':
                    url = '/api/v1/chat/broadcast/all';
                    break;
                case 'DEPARTMENT':
                    url = '/api/v1/chat/broadcast/department';
                    payload.departmentIds = selectedDepartments; // 부서명 배열
                    break;
                case 'INDIVIDUAL':
                    // 직원 ID를 경로 변수로 사용
                    if (selectedEmployees.length === 0) {
                        setStatus("전송할 직원을 선택해주세요.");
                        setLoading(false);
                        return;
                    }
                    url = `/api/v1/chat/broadcast/users`;
                    payload.employeeIds = selectedEmployees;
                    break;
                default:
                    throw new Error('Unknown send type');
            }

            const response = await axios.post(
                url,
                payload,
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            if (response.status === 200) {
                setStatus('메시지 전송 성공!');
                setMessage('');
            } else {
                setStatus(`전송 실패: ${response.statusText}`);
            }
        } catch (error: any) {
            console.error('전송 에러:', error);
            setStatus('메시지 전송 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="message-sender">
            <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="보낼 메시지를 입력하세요..."
                className="message-textarea"
            />
            <button onClick={handleSendMessage} disabled={loading} className="send-button">
                {loading ? '전송 중...' : '보내기'}
            </button>
            {status && <p className="status-message">{status}</p>}
        </div>
    );
};

export default MessageSender;
