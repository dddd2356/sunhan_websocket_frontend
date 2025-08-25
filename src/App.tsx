import React, {useEffect, useState, useRef, createContext, useContext, useCallback} from 'react';
import './App.css';
import { Route, Routes } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';
import axiosInstance from './views/Authentication/axiosInstance';
import { AxiosError } from 'axios';
import SignUp from './views/Authentication/SignUp';
import SignIn from './views/Authentication/SignIn';
import OAuth from './views/Authentication/OAuth';
import EmploymentSignUp from './views/Detail/EmploymentSignUp';
import MainPage from './views/Detail/MainPage';
import OrganizationView from './views/Detail/OrganizationView';
import OrganizationEdit from './views/Detail/OrganizationEdit';
import MessageDepartment from './views/Detail/MessageDepartment';
import MessageAll from './views/Detail/MessageAll';
import MessagePersonal from './views/Detail/MessageIndividual';
import MyPage from './views/Detail/MyPage';
import ChatMainComponent, { ChatRoom } from './views/Detail/ChatMainComponent';
import useChatWebSocket from './hooks/useChatWebSocket';


// Notification Context
interface NotificationContextType {
    notify: (title: string, content: string, roomId: string, messageId?: string) => void;
}
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

// Child component to handle WebSocket logic
function WebSocketWrapper({
                              token,
                              currentUser,
                              chatRooms,
                              setChatRooms,
                          }: {
    token: string;
    currentUser: any;
    chatRooms: ChatRoom[];
    setChatRooms: React.Dispatch<React.SetStateAction<ChatRoom[]>>;
}) {
    const { notify } = useNotification();

    const updateChatRooms = useCallback((roomId: string, updates: { lastMessage?: string; unreadCount?: number }) => {
        setChatRooms(prevRooms => {
            const updatedRooms = prevRooms.map(room => {
                if (String(room.id) === String(roomId)) {
                    return {
                        ...room,
                        ...updates,
                        lastUpdated: Date.now()
                    };
                }
                return room;
            });

            return updatedRooms.sort((a, b) => {
                const aTime = a.lastUpdated || 0;
                const bTime = b.lastUpdated || 0;
                return bTime - aTime;
            });
        });
    }, [setChatRooms]);

    const { connectionStatus, wsError } = useChatWebSocket(
        '',
        token,
        currentUser,
        chatRooms,
        undefined,
        notify,
        updateChatRooms
    );


    useEffect(() => {
        console.log('WebSocket connection status:', connectionStatus);
    }, [connectionStatus]);

    useEffect(() => {
        if (wsError) {
            console.error('WebSocket error:', wsError);
        }
    }, [wsError]);

    return null;
}

function App() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [token, setToken] = useState<string>(localStorage.getItem('token') || '');
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]); // 🔥 추가: chatRooms 상태 정의
    const [totalUnreadCount, setTotalUnreadCount] = useState(0); // 🔥 추가: 전체 읽지 않은 메시지 수 상태
    const [isBlinking, setIsBlinking] = useState<boolean>(false);
    const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const originalTitle = useRef<string>(document.title);
    // ★★★ [수정] App 전역 로딩 상태 추가 ★★★
    const [isAppLoading, setIsAppLoading] = useState<boolean>(true); // ★ 전역 로딩 상태

    // Fetch user and chat rooms
    useEffect(() => {
        const fetchUserAndRooms = async () => {
            if (!token) {
                setCurrentUser(null);
                setChatRooms([]);
                setIsAppLoading(false); // 토큰 없으면 바로 로딩 종료
                return;
            }
            try {
                // 1. 사용자 정보 가져오기
                const userRes = await axiosInstance.get('/api/v1/auth/user');
                const user = userRes.data;
                setCurrentUser(user);

                // 2. 사용자의 채팅방 목록 가져오기
                const roomsRes = await axiosInstance.get('/api/v1/chat/rooms', {
                    params: { userId: user.principal },
                });
                const initialRooms: ChatRoom[] = Array.isArray(roomsRes.data) ? roomsRes.data : [];

                // 3. 각 채팅방의 상세 정보 (unreadCount, 마지막 메시지) 병렬로 가져오기
                const roomsWithDetails = await Promise.all(
                    initialRooms.map(async (room) => {
                        try {
                            const countResp = await axiosInstance.get(`/api/v1/chat/rooms/${room.id}/unread-count`, {
                                params: { userId: user.principal }
                            });
                            const lastMessageResp = await axiosInstance.get(`/api/v1/chat/rooms/${room.id}/messages`, {
                                params: { page: 0, size: 1, sort: 'timestamp,desc' }
                            });

                            const lastMessageContent = lastMessageResp.data.content[0]?.content || room.lastMessage || '';
                            const lastMessageTimestamp = new Date(lastMessageResp.data.content[0]?.timestamp || Date.now()).getTime();

                            return {
                                ...room,
                                unreadCount: countResp.data.unreadCount || 0,
                                lastMessage: lastMessageContent,
                                lastUpdated: lastMessageTimestamp,
                            };
                        } catch (e) {
                            return { ...room, unreadCount: 0, lastMessage: room.lastMessage || '' };
                        }
                    })
                );

                // 4. 마지막 활동 순으로 정렬
                const sortedRooms = roomsWithDetails.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
                setChatRooms(sortedRooms);

            } catch (e) {
                const error = e as AxiosError;
                console.error('Failed to fetch user or rooms:', error);
                if (error.response?.status === 401) {
                    setToken('');
                    setCurrentUser(null);
                    setChatRooms([]);
                    localStorage.removeItem('token');
                    window.location.href = '/auth/sign-in';
                }
            } finally {
                // ★ 모든 과정이 끝나면 전역 로딩 상태를 false로 변경
                setIsAppLoading(false);
            }
        };
        fetchUserAndRooms();
    }, [token]);


    // Favicon and tab blinking logic
    const defaultFavicon = '/favicon.ico';
    const unreadFavicon = '/unread-favicon.ico';

    const getFaviconElement = () => {
        let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.href = defaultFavicon;
            document.head.appendChild(favicon);
        }
        return favicon;
    };

    useEffect(() => {
        if (!('Notification' in window)) {
            console.warn('This browser does not support Notifications.');
            return;
        }
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
                if (permission === 'denied') {
                    console.warn('Notification permission denied.');
                }
            });
        }
    }, []);

    const startBlinking = () => {
        if (blinkIntervalRef.current) return;
        setIsBlinking(true);
        let isDefaultTitle = false;
        let isDefaultIcon = false;
        blinkIntervalRef.current = setInterval(() => {
            document.title = isDefaultTitle ? '🔔 New Message!' : originalTitle.current;
            isDefaultTitle = !isDefaultTitle;
            const favicon = getFaviconElement();
            favicon.href = isDefaultIcon ? unreadFavicon : defaultFavicon;
            isDefaultIcon = !isDefaultIcon;
        }, 800);
    };

    const stopBlinking = () => {
        if (blinkIntervalRef.current) {
            clearInterval(blinkIntervalRef.current);
            blinkIntervalRef.current = null;
            document.title = originalTitle.current;
            const favicon = getFaviconElement();
            favicon.href = defaultFavicon;
            setIsBlinking(false);
        }
    };

    useEffect(() => {
        originalTitle.current = document.title;
        const handleAttention = () => {
            if (!document.hasFocus()) {
                startBlinking();
            }
        };
        const handleFocus = () => {
            stopBlinking();
        };
        window.addEventListener('attention', handleAttention);
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('attention', handleAttention);
            window.removeEventListener('focus', handleFocus);
            stopBlinking();
        };
    }, []);

    const notify = (title: string, content: string, roomId: string) => {
        // 2) 데스크탑 알림
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: content,
                tag: roomId || `msg-${Date.now()}`, // 중복 알림 갱신용
                renotify: true,
                icon: '/favicon.ico',
                data: { roomId },
            });
        }
    };

    // ★ 전역 로딩 상태에 따라 렌더링 분기
    if (isAppLoading) {
        return <div className="loading-container"><div className="loading-spinner"></div><div>애플리케이션을 불러오는 중입니다...</div></div>;
    }

    return (
        <NotificationContext.Provider value={{ notify }}>
            {token && currentUser && (
                <WebSocketWrapper
                    token={token}
                    currentUser={currentUser}
                    chatRooms={chatRooms}
                    setChatRooms={setChatRooms}
                />
            )}
            <Routes>
                <Route path="/auth">
                    <Route path="sign-up" element={<SignUp />} />
                    <Route path="sign-in" element={<SignIn />} />
                    <Route path="oauth-response" element={<OAuth />} />
                </Route>
                <Route path="/detail">
                    <Route path="main-page" element={<MainPage />} />
                    <Route path="my-page" element={<MyPage />} />
                    <Route path="employment/sign-up" element={<EmploymentSignUp />} />
                    <Route path="employment/organization-view" element={<OrganizationView />} />
                    <Route path="employment/organization-edit" element={<OrganizationEdit />} />
                    <Route path="message/all-send" element={<MessageAll />} />
                    <Route path="message/department-send" element={<MessageDepartment />} />
                    <Route path="message/personal-send" element={<MessagePersonal />} />
                    <Route
                        path="chat/:roomId"
                        element={
                            <ChatMainComponent
                                roomId=""
                                currentUser={currentUser}
                                token={token}
                                chatRooms={chatRooms}
                                setChatRooms={setChatRooms}
                            />
                        }
                    />
                </Route>
            </Routes>
        </NotificationContext.Provider>
    );
}

export default App;