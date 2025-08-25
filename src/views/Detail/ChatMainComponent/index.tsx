import React, {useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect, memo} from 'react';
import { useNotification } from '../../../App';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../Authentication/axiosInstance';
import axios, { AxiosResponse, AxiosError } from 'axios';
import defaultProfileImage from "../../../components/SideBar/assets/images/profile.png";
import useChatWebSocket from '../../../hooks/useChatWebSocket';
import { useCookies } from 'react-cookie';
import UniversalCookies from 'universal-cookie';
import './style.css';
import Layout from '../../../components/Layout';
import { VariableSizeList, ListChildComponentProps, ListOnScrollProps } from 'react-window';
import AuthenticatedImage from "../../../components/AuthenticatedImage";

export interface ChatRoom {
    id: string;
    displayName: string;
    name?: string;
    lastMessage?: string;
    displayMessage?: string;
    lastActivity?: string;
    unreadCount: number;
    participants: Employee[];
    groupChat?: boolean;
    lastUpdated?: number;
}

export interface Employee {
    id: number;
    userId: string;
    user?: { userId: string };
    kakaoUuid: string;
    name: string;
    position: string;
    phone: string;
    departmentName: string;
    sectionName: string;
    profileImage: string | null;
}

export interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    timestamp: string;
    roomId: string;
    readBy: string[];
    senderId: string;
    isInviteMessage?: boolean;
    isExitMessage?: boolean;
    isDateMessage?: boolean;
    attachmentType?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    unreadCount: number;
    canceled?: boolean; // Added to match backend
    deleted?: boolean;
    participantCountAtSend?: number;
}

interface ChatMainComponentProps {
    roomId?: string;
    currentUser: any; // App.tsx에서 로딩 후 전달하므로 optional이 아님
    token: string;    // App.tsx에서 로딩 후 전달하므로 optional이 아님
    chatRooms: ChatRoom[];
    setChatRooms: React.Dispatch<React.SetStateAction<ChatRoom[]>>;

}

interface ChatImageMessageProps {
    src: string;
    alt?: string;
    className?: string;
    message: ChatMessage;
    onImageRead: (msg: ChatMessage) => void;
}

// 이미지 메타데이터 캐시 (크기 정보 포함)
interface ImageMetadata {
    loaded: boolean;
    error: boolean;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
}

const imageMetadataCache = new Map<string, ImageMetadata>();
const preloadedImages = new Map<string, HTMLImageElement>();

const ChatImageMessage = memo(({ src, alt, className, message, onImageRead }: ChatImageMessageProps) => {
    const cachedMetadata = imageMetadataCache.get(src);

    const [isLoading, setIsLoading] = useState(() => !cachedMetadata?.loaded);
    const [error, setError] = useState<string | null>(() =>
        cachedMetadata?.error ? '이미지를 로드할 수 없습니다.' : null
    );
    const [imageDimensions, setImageDimensions] = useState<{
        width: number;
        height: number;
        naturalWidth: number;
        naturalHeight: number;
    }>(() => cachedMetadata ? {
        width: cachedMetadata.width,
        height: cachedMetadata.height,
        naturalWidth: cachedMetadata.naturalWidth,
        naturalHeight: cachedMetadata.naturalHeight
    } : { width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

    const imgRef = useRef<HTMLImageElement>(null);
    const onImageReadRef = useRef(onImageRead);
    const messageRef = useRef(message);

    useEffect(() => {
        onImageReadRef.current = onImageRead;
        messageRef.current = message;
    });

    // 이미지 크기 계산 함수
    const calculateOptimalSize = useCallback((naturalWidth: number, naturalHeight: number) => {
        const maxWidth = 300; // 채팅 이미지 최대 너비
        const maxHeight = 400; // 채팅 이미지 최대 높이

        // 원본 비율 유지하면서 최대 크기 내에서 조정
        const aspectRatio = naturalWidth / naturalHeight;

        let width = naturalWidth;
        let height = naturalHeight;

        // 너비가 최대값을 초과하는 경우
        if (width > maxWidth) {
            width = maxWidth;
            height = width / aspectRatio;
        }

        // 높이가 최대값을 초과하는 경우
        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }

        return { width: Math.round(width), height: Math.round(height) };
    }, []);

    const handleImageLoad = useCallback((img: HTMLImageElement) => {
        const { naturalWidth, naturalHeight } = img;
        const { width, height } = calculateOptimalSize(naturalWidth, naturalHeight);

        const metadata: ImageMetadata = {
            loaded: true,
            error: false,
            width,
            height,
            naturalWidth,
            naturalHeight
        };

        // 캐시에 메타데이터 저장
        imageMetadataCache.set(src, metadata);

        // 상태 업데이트
        setImageDimensions({ width, height, naturalWidth, naturalHeight });
        setIsLoading(false);
        setError(null);

        // 읽음 처리
        if (onImageReadRef.current && !messageRef.current.readBy) {
            onImageReadRef.current(messageRef.current);
            (messageRef.current as any).readProcessed = true;
        }
    }, [src, calculateOptimalSize]);

    const handleImageError = useCallback(() => {
        const metadata: ImageMetadata = {
            loaded: false,
            error: true,
            width: 0,
            height: 0,
            naturalWidth: 0,
            naturalHeight: 0
        };

        imageMetadataCache.set(src, metadata);
        setIsLoading(false);
        setError('이미지를 로드할 수 없습니다.');
        console.error('ChatImageMessage: Failed to load image, src=', src);
    }, [src]);

    useEffect(() => {
        // 캐시된 메타데이터가 있고 로드 완료된 경우
        if (cachedMetadata?.loaded) {
            setImageDimensions({
                width: cachedMetadata.width,
                height: cachedMetadata.height,
                naturalWidth: cachedMetadata.naturalWidth,
                naturalHeight: cachedMetadata.naturalHeight
            });
            setIsLoading(false);
            setError(null);
            return;
        }

        // 캐시된 에러가 있는 경우
        if (cachedMetadata?.error) {
            setIsLoading(false);
            setError('이미지를 로드할 수 없습니다.');
            return;
        }

        // 프리로드된 이미지 확인
        const preloadedImg = preloadedImages.get(src);
        if (preloadedImg && preloadedImg.complete && preloadedImg.naturalWidth > 0) {
            handleImageLoad(preloadedImg);
            return;
        }

        // 새로 로드
        console.log('ChatImageMessage: Loading new image, src=', src);
        setIsLoading(true);
        setError(null);

        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => handleImageLoad(img);
        img.onerror = handleImageError;
        img.src = src;

        preloadedImages.set(src, img);

        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [src, cachedMetadata, handleImageLoad, handleImageError]);

    if (error) {
        return <p className="error-message">{error}</p>;
    }

    return (
        <div className="chat-image-container">
            {isLoading && (
                <div
                    className="image-loading"
                    style={{
                        width: '200px',
                        height: '150px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '8px'
                    }}
                >
                    이미지 로드 중...
                </div>
            )}
            <img
                ref={imgRef}
                src={src}
                alt={alt}
                className={`${className} ${isLoading ? 'hidden' : ''}`}
                style={{
                    display: isLoading ? 'none' : 'block',
                    width: imageDimensions.width || 'auto',
                    height: imageDimensions.height || 'auto',
                    maxWidth: '300px',
                    maxHeight: '400px',
                    objectFit: 'contain', // 비율 유지하면서 컨테이너에 맞춤
                    borderRadius: '8px',
                    backgroundColor: '#f9f9f9'
                }}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
            />
        </div>
    );
});

const ChatMainComponent: React.FC<ChatMainComponentProps> = ({ roomId, currentUser: initialUser, token: propToken,chatRooms, setChatRooms }) => {
    const { roomId: urlRoomId } = useParams<{ roomId: string }>();
    const sanitizedUrlRoomId = urlRoomId === 'main' ? '' : urlRoomId;
    const initialRoomId = roomId || sanitizedUrlRoomId || '';
    const navigate = useNavigate();
    const [cookies, , removeCookie] = useCookies(['accessToken']);
    const [currentUser, setCurrentUser] = useState<any>(initialUser || null);
    const [inputMessage, setInputMessage] = useState<string>('');
    const [room, setRoom] = useState<ChatRoom | null>(null);
    const [participants, setParticipants] = useState<Employee[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [activeTab, setActiveTab] = useState<'employees' | 'chatrooms'>('employees');
    const [activeRoomId, setActiveRoomId] = useState<string>(initialRoomId);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [showGroupChatModal, setShowGroupChatModal] = useState<boolean>(false);
    const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
    const [selectedParticipants, setSelectedParticipants] = useState<Employee[]>([]);
    const [groupChatName, setGroupChatName] = useState<string>('');
    const [roomError, setRoomError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isLoadingUser, setIsLoadingUser] = useState(!initialUser);
    const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
    const API_BASE = process.env.REACT_APP_API_BASE_URL || '';
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: '' });
    const [authToken, setAuthToken] = useState(propToken || cookies.accessToken || localStorage.getItem('accessToken') || '');
    const blinkingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const defaultFavicon = '/favicon.ico';
    const unreadFavicon = '/unread-favicon.ico';
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(window.innerWidth > 768);
    const [filePreviews, setFilePreviews] = useState<{id: string, url: string, type: string, name: string}[]>([]);
    // 채팅 목록 전용 로딩 플래그
    const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(false);
    const toggleLeftSidebar = () => {
        setIsLeftSidebarOpen(!isLeftSidebarOpen);
    };
    // 🔥 추가: 스크롤 위치 유지를 위한 Ref들
    const prevScrollHeightRef = useRef<number>(0); // 이전 메시지 로드 전 스크롤 가능한 전체 높이
    const prevScrollTopRef = useRef<number>(0);    // 이전 메시지 로드 전 스크롤 상단 위치
    const isFetchingMoreRef = useRef<boolean>(false); // 추가 데이터 로드 중인지 여부
    const scrollEnabledRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<VariableSizeList>(null);
    const prevMessagesRef = useRef<ChatMessage[]>([]);
    const prevScrollOffsetRef = useRef<number>(0);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const startBlinkingFavicon = useCallback(() => {
        if (blinkingIntervalRef.current) return;

        let isDefault = true;
        blinkingIntervalRef.current = setInterval(() => {
            const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
            if (favicon) {
                favicon.href = isDefault ? unreadFavicon : defaultFavicon;
                isDefault = !isDefault;
            }
        }, 1000);
    }, []);
    const hasFetchedRoomsRef = useRef(false);
    const [prependScrollIndex, setPrependScrollIndex] = useState<number | null>(null);
    const CONTAINER_HEIGHT = window.innerHeight - 200; // FixedSizeList 에 넘기는 height 값과 동일해야 합니다.
    const isFetchingRef = useRef(false);
    const isRestoringRef = useRef(false);
    const [hasScrolledInitially, setHasScrolledInitially] = useState(false);
    const autoFillScrollRef = useRef(false);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const firstUnreadIndexRef = useRef<number | null>(null);
    const stopBlinkingFavicon = useCallback(() => {
        if (blinkingIntervalRef.current) {
            clearInterval(blinkingIntervalRef.current);
            blinkingIntervalRef.current = null;
            const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
            if (favicon) {
                favicon.href = defaultFavicon;
            }
        }
    }, []);
// 1. 스크롤 관련 상태 정리 (기존 상태들 중 일부는 제거)
    const [initialScrollDone, setInitialScrollDone] = useState(false);
    const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
    const isNearBottomRef = useRef(true); // 사용자가 하단 근처에 있는지 추적
    const scrollRestoreRef = useRef<{ index: number; offset: number } | null>(null);
    const ITEM_HEIGHT = 50; // 기본 높이 (fallback)
    const sizeMap = useRef<{ [index: number]: number }>({});
    //“한 번만 실행” 플래그 추가 어떤 방에 대해서 이미 읽음 처리했는지”를 기억
    const markedReadRoomsRef = useRef<Set<string>>(new Set());

    const makeSrc = (url?: string | null) => {
        if (!url) return defaultProfileImage;
        if (url.startsWith('http')) return url;
        // 예: API_BASE = "http://localhost:8080"
        const sep = API_BASE.endsWith('/') ? '' : '/';
        const path = url.startsWith('/') ? url.substring(1) : url;
        return `${API_BASE}${sep}${path}`;
    };
    const [imageHeights, setImageHeights] = useState<{ [messageId: string]: number }>({});
    const handleParticipantsUpdate = useCallback(
        (updatedParticipants: Employee[]) => {
            setParticipants(updatedParticipants);
        }, []);
    const [groupModalSearch, setGroupModalSearch] = useState<string>('');
    const [inviteModalSearch, setInviteModalSearch] = useState<string>('');

    const filteredEmployees = useMemo(() => {
        if (!searchTerm) return employees;
        const lowerSearchTerm = searchTerm.toLowerCase();
        return employees.filter(employee => {
            if (!employee.name) console.log('Employee missing name:', employee);
            if (!employee.departmentName) console.log('Employee missing departmentName:', employee);
            if (!employee.position) console.log('Employee missing position:', employee);
            return (
                (employee.name && employee.name.toLowerCase().includes(lowerSearchTerm)) ||
                (employee.departmentName && employee.departmentName.toLowerCase().includes(lowerSearchTerm)) ||
                (employee.position && employee.position.toLowerCase().includes(lowerSearchTerm))
            );
        });
    }, [employees, searchTerm]);

    const filteredChatRooms = useMemo(() => {
        if (!searchTerm) return chatRooms;
        const lowerSearchTerm = searchTerm.toLowerCase();
        return chatRooms.filter(room =>
            room.displayName.toLowerCase().includes(lowerSearchTerm) ||
            (room.lastMessage && room.lastMessage.toLowerCase().includes(lowerSearchTerm))
        );
    }, [chatRooms, searchTerm]);

    // 그룹 채팅 생성 모달용 필터링 리스트
    const filteredGroupModalEmployees = useMemo(() => {
        const term = groupModalSearch.trim().toLowerCase();
        return employees.filter(emp => {
            // 각 필드를 안전하게 취득 (undefined → '')
            const name = (emp.name ?? '').toLowerCase();
            const dept = (emp.departmentName ?? '').toLowerCase();
            const pos  = (emp.position ?? '').toLowerCase();
            // 검색어가 비어있으면 모두 통과
            if (!term) return true;
            return name.includes(term) || dept.includes(term) || pos.includes(term);
        });
    }, [employees, groupModalSearch]);

    // 초대 모달용 필터링 리스트
    const filteredInviteModalEmployees = useMemo(() => {
        const term = inviteModalSearch.trim().toLowerCase();
        // 이미 참가한 사람 미리 제외
        const baseList = employees.filter(emp => !participants.some(p => p.id === emp.id));
        return baseList.filter(emp => {
            const name = (emp.name ?? '').toLowerCase();
            const dept = (emp.departmentName ?? '').toLowerCase();
            const pos  = (emp.position ?? '').toLowerCase();
            if (!term) return true;
            return name.includes(term) || dept.includes(term) || pos.includes(term);
        });
    }, [employees, participants, inviteModalSearch]);


    const processedInviteMessageIds = useRef<Set<string>>(new Set());
    // Context API 로부터 notify 함수 가져오기
    const { notify } = useNotification();

    // ▼▼▼ [수정] 프로필 이미지 경로를 생성하는 헬퍼 함수 추가 ▼▼▼
    // [중요] 이 함수의 URL 구조를 백엔드 API 명세에 맞게 수정해야 합니다.
    const getProfileImagePath = (employee: Employee | null): string | null => {
        if (!employee || !employee.id) return null;
        // 예시: 직원의 고유 ID(숫자)를 사용하는 경우
        return `/api/v1/employees/${employee.id}/profile-image`;
    };

    interface UpdateChatInfo {
        lastMessage: string;
        unreadCount: number;
        displayMessage?: string;
    }

    // 🔥 1초 디바운스 + 중복 처리 방지 handleMessageRead
    const handleMessageRead = useCallback(async (roomId: string, messageId?: string) => {
        if (!currentUser?.principal || !roomId || roomId === 'main') return;
        // 이미 처리된 메시지면 skip
        if (messageId && messageReadSet.current.has(messageId)) return;
        // 기존 타이머 있으면 취소
        if (messageReadTimeoutRef.current[roomId]) {
            clearTimeout(messageReadTimeoutRef.current[roomId]);
        }
        // 1초 후 실제 호출
        messageReadTimeoutRef.current[roomId] = setTimeout(async () => {
            if (isUpdatingUnreadRef.current) return;
            try {
                isUpdatingUnreadRef.current = true;
                await axiosInstance.post(`/api/v1/chat/rooms/${roomId}/read`, { userId: currentUser.principal });
                if (messageId) messageReadSet.current.add(messageId);
                setChatRooms(prev =>
                    prev.map(r =>
                        String(r.id) === String(roomId)
                            ? { ...r, unreadCount: 0 }
                            : r
                    )
                );
            } catch {
                if (messageId) messageReadSet.current.delete(messageId);
            } finally {
                isUpdatingUnreadRef.current = false;
                delete messageReadTimeoutRef.current[roomId];
            }
        }, 1000);
    }, [currentUser?.principal, setChatRooms]);

// 🔥 이미지 메시지 전용 읽음 처리
    const handleImageRead = useCallback((msg: ChatMessage) => {
        if (
            !msg ||
            !activeRoomId ||
            !currentUser?.principal ||
            String(msg.roomId) !== String(activeRoomId) ||
            msg.senderId === String(currentUser.principal) ||
            msg.readBy?.includes(currentUser.principal)
        ) return;

        // 이미 처리됐으면 skip
        if (
            lastReadMsgRef.current?.roomId === activeRoomId &&
            lastReadMsgRef.current.msgId === msg.id
        ) return;

        // 뱃지 0 이면 API 없이 기록만
        const thisRoom = chatRooms.find(r => String(r.id) === String(activeRoomId));
        if (thisRoom?.unreadCount === 0) {
            lastReadMsgRef.current = { roomId: activeRoomId, msgId: msg.id };
            return;
        }

        handleMessageRead(activeRoomId, msg.id);
        lastReadMsgRef.current = { roomId: activeRoomId, msgId: msg.id };
    }, [activeRoomId, currentUser?.principal, chatRooms, handleMessageRead]);

    const handleUpdateChatRooms = useCallback(
        (roomId: string, info: UpdateChatInfo) => {
            console.log('🛠 updateChatRooms called for room', roomId, 'info=', info);
            setChatRooms(prev =>
                prev.map(r => {
                    if (String(r.id) !== roomId) return r;

                    const newLastMessage = info.lastMessage?.trim() ? info.lastMessage : r.lastMessage;
                    const newDisplayMessage = info.displayMessage?.trim()
                        ? info.displayMessage
                        : newLastMessage || r.displayMessage;

                    const messageChanged = newLastMessage !== (r.lastMessage || '');
                    const unreadChanged  = info.unreadCount !== r.unreadCount;

                    return {
                        ...r,
                        lastMessage: newLastMessage,
                        displayMessage: newDisplayMessage,
                        unreadCount: info.unreadCount,
                        // 변경 있을 때만 timestamp 갱신
                        lastActivity: messageChanged
                            ? new Date().toISOString()
                            : r.lastActivity,
                        lastUpdated: messageChanged
                            ? Date.now()
                            : r.lastUpdated,
                    };
                })
            );
        },
        [setChatRooms]
    );

    interface MessageItemProps {
        message: ChatMessage;
        prevMessage: ChatMessage | null;
        currentUser: any;
        participants: Employee[];
        handleContextMenu: (e: React.MouseEvent, messageId: string) => void;
        contextMenu: { visible: boolean; x: number; y: number; messageId: string };
        handleDeleteMessage: (id: string) => void;
        handleImageRead: (msg: ChatMessage) => void;
        formatMessage: (msg: ChatMessage) => React.ReactNode;
        makeSrc: (url?: string | null) => string;
        defaultProfileImage: string;
    }

    const MessageItem = memo(({
                                  message,
                                  prevMessage,
                                  currentUser,
                                  participants,
                                  handleContextMenu,
                                  contextMenu,
                                  handleDeleteMessage,
                                  handleImageRead,
                                  formatMessage,
                                  makeSrc,
                                  defaultProfileImage
                              }: MessageItemProps) => {
        const isContinuousMessage = useMemo(() => {
            return (
                prevMessage &&
                prevMessage.senderId === message.senderId &&
                !prevMessage.isInviteMessage &&
                !prevMessage.isExitMessage &&
                !prevMessage.isDateMessage &&
                !message.isInviteMessage &&
                !message.isExitMessage &&
                !message.isDateMessage &&
                prevMessage.senderId !== currentUser?.principal &&
                new Date(message.timestamp).getTime() - new Date(prevMessage.timestamp).getTime() <= 60000
            );
        }, [message, prevMessage, currentUser?.principal]);

        const participant = useMemo(
            // [수정] p.userId -> p.user?.userId 로 수정하여
            // user 객체가 없는 경우에도 안전하게 처리합니다.
            () => participants.find((p) => p.user?.userId === message.senderId),
            [participants, message.senderId]
        );

        const messageTime = useMemo(
            () =>
                new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            [message.timestamp]
        );

        // 현재 사용자가 보낸 메시지인지 확인
        const isMyMessage = message.senderId === String(currentUser?.principal);

        return (
            <div
                key={message.id}
                className={`message ${
                    message.isInviteMessage || message.isExitMessage || message.isDateMessage
                        ? 'system'
                        : isMyMessage
                            ? 'sent'
                            : 'received'
                }${isContinuousMessage ? ' continuous' : ''}`}
            >
                {/* 발신자 정보 (받은 메시지이고 연속 메시지가 아닐 때만) */}
                {!(
                        message.isInviteMessage ||
                        message.isExitMessage ||
                        message.isDateMessage
                    ) &&
                    !isMyMessage &&
                    !isContinuousMessage && (
                        <div className="chat-message-sender">
                            <AuthenticatedImage
                                imagePath={getProfileImagePath(participant || null)}
                                altText={message.sender || 'Unknown'}
                                className="sender-avatar"
                            />
                            <span className="sender-name">{message.sender}</span>
                        </div>
                    )}

                <div className="message-body">
                    {/* 메시지 내용에 컨텍스트 메뉴 적용 (내가 보낸 메시지만) */}
                    <div
                        className="message-content"
                        onContextMenu={
                            isMyMessage
                                ? (e) => {
                                    e.preventDefault(); // 기본 브라우저 컨텍스트 메뉴 방지
                                    handleContextMenu(e, String(message.id));
                                }
                                : undefined
                        }
                    >
                        {message.deleted ? (
                            <p className="deleted-message">메시지가 삭제되었습니다!</p>
                        ) : message.attachmentType === 'image' && message.attachmentUrl ? (
                            <ChatImageMessage
                                src={makeSrc(message.attachmentUrl)}
                                alt={message.attachmentName}
                                className="chat-image"
                                message={message}
                                onImageRead={handleImageRead}
                            />
                        ) : message.attachmentType === 'file' && message.attachmentUrl ? (
                            <a
                                href={`${API_BASE}/api/v1/chat/attachments/download/${encodeURIComponent(
                                    message.attachmentUrl.split('/').pop() || ''
                                )}`}
                                download={message.attachmentName}
                                className="chat-file-link"
                            >
                                📄 {message.attachmentName}
                            </a>
                        ) : (
                            <p>{formatMessage(message)}</p>
                        )}
                    </div>

                    {/* 메타 정보 (시간 · 읽지 않은 카운트 등) */}
                    {!(
                        message.isInviteMessage ||
                        message.isExitMessage ||
                        message.isDateMessage
                    ) && (
                        <div className="message-meta">
                            {message.unreadCount > 0 && (
                                <span className="unread-count">{message.unreadCount}</span>
                            )}
                            <span
                                className={`message-time ${
                                    isMyMessage
                                        ? 'left-time'
                                        : 'right-time'
                                }`}
                            >
                            {messageTime}
                        </span>
                        </div>
                    )}
                </div>

                {/* 컨텍스트 메뉴 - 메시지 컨테이너 밖에서 렌더링 */}
                {contextMenu.visible && contextMenu.messageId === String(message.id) && (
                    <div
                        className="context-menu"
                        style={{
                            position: 'absolute', // absolute에서 fixed로 변경
                            top: `${contextMenu.y}px`,
                            left: `${contextMenu.x}px`,
                            zIndex: 1000,
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMessage(String(message.id));
                            }}
                        >
                            삭제
                        </button>
                    </div>
                )}
            </div>
        );
    });

    // 수정: notify 추가 인자로 전달
    const { messages, setMessages, connectionStatus, wsError, sendMessage, refreshMessages, unreadCount, loadMoreHistory,  hasMoreHistory, isInitialLoadComplete   } =
        useChatWebSocket(
            activeRoomId,
            authToken,
            currentUser,
            chatRooms,
            handleParticipantsUpdate,
            notify,
            handleUpdateChatRooms
        );

    useEffect(() => {
        console.log('chatRooms state updated:', chatRooms);
    }, [chatRooms]);

    const sortedMessages = useMemo(() => {
        return [...messages].sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();

            if (timeA !== timeB) {
                return timeA - timeB;
            }

            // 타임스탬프가 같을 경우, 날짜 메시지를 최우선으로 정렬
            if (a.isDateMessage && !b.isDateMessage) {
                return -1; // a가 먼저 오도록
            }
            if (!a.isDateMessage && b.isDateMessage) {
                return 1; // b가 먼저 오도록
            }

            // 둘 다 날짜 메시지이거나 둘 다 아닌 경우, 순서 유지
            return 0;
        });
    }, [messages]);

    // ChatMainComponent 내부에서 messages 배열이 바뀌면 sizeMap을 비우고 리스트 전체를 리셋:
    useEffect(() => {
        // sortedMessages가 완전히 바뀔 때마다 (넘버가 달라지거나, content가 변경될 때) 실행
        sizeMap.current = {}; // 모든 캐시 높이 삭제
        if (listRef.current) {
            // 두 번째 인자(false)는 'forceUpdate' 여부인데, false면 내부적으로만 높이를 다시 계산합니다.
            listRef.current.resetAfterIndex(0, false);
        }
    }, [sortedMessages]); // sortedMessages가 바뀔 때마다 실행

    const calculateImageHeight = (url: string): Promise<number> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const maxWidth = 300;
                const aspectRatio = img.height / img.width;
                const displayHeight = Math.min(img.height, maxWidth * aspectRatio);
                resolve(displayHeight + 20);
            };
            img.onerror = () => resolve(100);
        });
    };

    const getSize = useCallback(
        (index: number) => {
            const msg = sortedMessages[index];
            const isContinuous =
                index > 0 &&
                sortedMessages[index - 1]?.senderId === msg.senderId &&
                new Date(msg.timestamp).getTime() -
                new Date(sortedMessages[index - 1].timestamp).getTime() <=
                60000;

            const hasSenderInfo =
                msg.senderId !== currentUser?.principal && !isContinuous;

            // === 1) 높이 계산 ===
            let height = ITEM_HEIGHT;
            if (msg.deleted) {
                height = ITEM_HEIGHT + (hasSenderInfo ? 36 : 0);
            } else if (msg.attachmentType === "image") {
                // msg.attachmentUrl이 아직 안 잡혀 있으면 fallback
                height = (imageHeights[msg.id] || 100) + (hasSenderInfo ? 36 : 0);
            } else if (msg.attachmentType === "file") {
                height = ITEM_HEIGHT + 20 + (hasSenderInfo ? 36 : 0);
            } else {
                height = ITEM_HEIGHT + (hasSenderInfo ? 36 : 0);
            }

            // === 2) 기존 sizeMap 값과 비교 ===
            const prevHeight = sizeMap.current[index];
            // 만약 높이가 undefined (첫 측정)거나, 실제 계산한 height와 다르면
            if (prevHeight !== height) {
                sizeMap.current[index] = height;
                // 즉시 재계산 호출
                if (listRef.current) {
                    // forceUpdate true로 하면 강제로 리렌더링 되지만, false만으로도 충분한 경우가 많습니다.
                    listRef.current.resetAfterIndex(index, false);
                }
            }

            return height;
        },
        [sortedMessages, currentUser?.principal, imageHeights]
    );

    // ▼▼▼ [수정] 토큰 갱신 이벤트를 수신하는 useEffect 추가 ▼▼▼
    useEffect(() => {
        const handleTokenRefresh = () => {
            // [수정] react-cookie의 state 대신 universal-cookie로 직접 최신 쿠키를 읽습니다.
            const universalCookies = new UniversalCookies();
            const newAccessToken = universalCookies.get('accessToken');

            if (newAccessToken) {
                console.log('Component received tokenRefreshed event. Updating token state for WebSocket.');
                setAuthToken(newAccessToken);
            }
        };

        // 'tokenRefreshed' 라는 이름의 커스텀 이벤트를 리스닝합니다.
        window.addEventListener('tokenRefreshed', handleTokenRefresh);

        // 컴포넌트가 언마운트될 때 이벤트 리스너를 정리합니다.
        return () => {
            window.removeEventListener('tokenRefreshed', handleTokenRefresh);
        };
    }, []); // [수정] 의존성 배열을 비워 마운트 시 한 번만 실행되도록 합니다.


    useEffect(() => {
        const updateImageHeights = async () => {
            const newHeights: { [messageId: string]: number } = { ...imageHeights };
            let needsUpdate = false;

            for (const msg of sortedMessages) {
                if (msg.attachmentType === 'image' && msg.attachmentUrl && !imageHeights[msg.id]) {
                    const height = await calculateImageHeight(msg.attachmentUrl);
                    newHeights[msg.id] = height;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                setImageHeights(newHeights);
                if (listRef.current) {
                    listRef.current.resetAfterIndex(0); // Reset cache to update heights
                }
            }
        };

        updateImageHeights();
    }, [sortedMessages, imageHeights]);

    const loadLatestMessages = useCallback(async () => {
        if (!activeRoomId || !currentUser) return;

        try {
            // Get the total number of pages first
            const metaResponse = await axiosInstance.get(`/api/v1/chat/rooms/${activeRoomId}/messages`, {
                params: {
                    page: 0,
                    size: 1,
                    userId: currentUser.principal,
                    sort: 'timestamp,asc'
                }
            });

            const totalPages = metaResponse.data.totalPages;

            if (totalPages > 0) {
                // If we have messages, get the last page directly
                const lastPage = totalPages - 1;
                await axiosInstance.get(`/api/v1/chat/rooms/${activeRoomId}/messages`, {
                    params: {
                        page: lastPage,
                        size: 20, // Adjust size as needed
                        userId: currentUser.principal,
                        sort: 'timestamp,asc'
                    }
                });

                // Force refresh messages to get the latest
                refreshMessages();
            }
        } catch (error) {
            console.error("Failed to load latest messages:", error);
        }
    }, [activeRoomId, currentUser, refreshMessages]);

    const loadMoreIfNeeded = useCallback(async () => {
        // 이미 페칭 중이거나 스크롤 복원 중이면 무시
        if (isFetchingRef.current || isRestoringRef.current || !hasMoreHistory()) return;

        isFetchingRef.current = true;
        isRestoringRef.current = true;

        // "실제 fetch 직전"의 visible index를 기록
        const currentScrollOffset = (listRef.current as any)?.state?.scrollOffset ?? 0;
        const firstVisibleIndex = Math.floor(currentScrollOffset / ITEM_HEIGHT);

        const prevLength = sortedMessages.length;

        try {
            // 과거 메시지 로드
            await loadMoreHistory();

            // "loadMoreHistory"가 끝난 뒤, state가 반영된 직후 setTimeout을 걸어야
            // sortedMessages.length가 갱신된 값을 읽어 올 수 있다.
            setTimeout(() => {
                const newLength = sortedMessages.length;
                const added = newLength - prevLength;

                if (added > 0 && listRef.current) {
                    // 이전 visible index + 새로 로드된 개수만큼 이동
                    const targetIndex = Math.max(0, firstVisibleIndex + added);
                    listRef.current.scrollToItem(targetIndex, 'start');
                    console.log('⏪ 스크롤 복원:', {
                        prevLength,
                        newLength,
                        added,
                        targetIndex,
                    });
                }

                // 플래그 해제
                isFetchingRef.current = false;
                isRestoringRef.current = false;
            }, 50);
        } catch (error) {
            console.error('이전 메시지 로드 실패:', error);
            isFetchingRef.current = false;
            isRestoringRef.current = false;
        }
    }, [hasMoreHistory, loadMoreHistory, sortedMessages.length]);


    const [isUpdatingUnread, setIsUpdatingUnread] = useState(false);

    // Function to update unread counts
    const updateUnreadCounts = useCallback(async () => {
        if (
            !currentUser?.principal ||
            !activeRoomId ||
            activeRoomId === 'main' ||
            isUpdatingUnread ||
            markedReadRoomsRef.current.has(activeRoomId)    // ← 이미 처리했으면 skip
        ) {
            return;
        }

        setIsUpdatingUnread(true);

        try {
            // 최신 읽지 않은 수는 WebSocket으로 수신됨.
            // 이 함수에서는 활성 방을 읽음 처리하고, 로컬 뱃지를 0 으로만 갱신한다.

            setChatRooms(prev =>
                prev.map(r =>
                    String(r.id) === String(activeRoomId) && r.unreadCount !== 0
                        ? { ...r, unreadCount: 0 }
                        : r
                )
            );

            // 서버에 읽음 처리 한 번만 전송
            // 서버에 읽음 처리
            await axiosInstance.post(
                `/api/v1/chat/rooms/${activeRoomId}/read`,
                { userId: currentUser.principal },
                { headers: { 'Content-Type': 'application/json' } }
            );
            // 성공하면 “읽음 처리 완료” 플래그 세팅
            markedReadRoomsRef.current.add(activeRoomId);
        } catch (error) {
            console.error('Failed to update unread counts:', error);
        } finally {
            setIsUpdatingUnread(false);
        }
    }, [currentUser?.principal, activeRoomId, chatRooms]);

    useEffect(() => {
        // 방이 바뀔 때마다, 새 방에 대한 처리 준비
        markedReadRoomsRef.current.delete(activeRoomId);
    }, [activeRoomId]);

    // Update counts when switching rooms
    useEffect(() => {
        if (activeRoomId) updateUnreadCounts();
    }, [activeRoomId, updateUnreadCounts]);

    // 방 클릭 핸들러 최적화
    const handleRoomClick = useCallback(async (roomId: string) => {
        // 이미 활성화된 방이면 불필요한 API 호출 방지
        if (activeRoomId === roomId) {
            return;
        }

        try {
            const [roomRes, partRes] = await Promise.all([
                axiosInstance.get(`/api/v1/chat/rooms/${roomId}`),
                axiosInstance.get(`/api/v1/chat/rooms/${roomId}/participants`)
            ]);

            // 상태 업데이트를 배치로 처리
            setRoom(roomRes.data);
            setParticipants(partRes.data);
            setActiveRoomId(roomId);

            // 읽음 처리
            if (currentUser?.principal) {
                try {
                    await axiosInstance.post(
                        `/api/v1/chat/rooms/${roomId}/read`,
                        { userId: currentUser.principal },
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                } catch (e) {
                    console.warn('읽음 처리 실패 on click:', e);
                }
            }

            // 뱃지 업데이트를 별도로 처리 (리렌더링 최소화)
            setChatRooms(prevRooms =>
                prevRooms.map(r =>
                    String(r.id) === roomId
                        ? { ...r, unreadCount: 0 }
                        : r
                )
            );

        } catch (err) {
            console.error('Failed to load room info:', err);
            setRoomError('채팅방 정보를 불러오는데 실패했습니다.');
        }
    }, [activeRoomId, currentUser?.principal, axiosInstance]);


    useEffect(() => {
        return () => {
            stopBlinkingFavicon();
        };
    }, [stopBlinkingFavicon]);


    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (
            lastMsg &&
            lastMsg.isInviteMessage &&
            !processedInviteMessageIds.current.has(lastMsg.id)
        ) {
            processedInviteMessageIds.current.add(lastMsg.id);
            console.log('새 초대 메시지 감지, 메시지 히스토리 새로고침');
            refreshMessages();
        }
    }, [messages, refreshMessages]);

    useEffect(() => {
        const fetchCurrentUser = async () => {
            const token = authToken;
            if (!currentUser && token) {
                try {
                    setIsLoadingUser(true);
                    const response = await axiosInstance.get('/api/v1/user/me', {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    setCurrentUser(response.data);
                    setIsLoadingUser(false);
                } catch (err) {
                    console.error('사용자 정보 가져오기 실패:', err);
                    alert('사용자 정보를 불러오지 못했습니다. 다시 로그인해주세요.');
                    removeCookie('accessToken', { path: '/' });
                    localStorage.removeItem('accessToken');
                    navigate('/auth/sign-in');
                }
            } else if (!token && !currentUser) {
                alert('로그인이 필요합니다.');
                navigate('/auth/sign-in');
            }
        };
        fetchCurrentUser();
    }, [currentUser, propToken, cookies.accessToken, navigate, removeCookie]);


    // ★★★ [핵심 수정] 데이터 로딩 로직 단순화 ★★★
    // 이 컴포넌트는 App.tsx에서 currentUser와 chatRooms를 받은 후에 렌더링됩니다.
    // 따라서 이 컴포넌트의 로딩은 '직원 목록'처럼 자체적으로 필요한 데이터 로딩에만 집중합니다.
    useEffect(() => {
        let isMounted = true;
        const fetchComponentData = async () => {
            try {
                // 직원 목록 불러오기
                const employeesResponse = await axiosInstance.get('/api/v1/detail/employment/all');
                if (isMounted) {
                    setEmployees(employeesResponse.data || []);
                }
            } catch (err) {
                console.error('직원 목록 로딩 실패:', err);
            } finally {
                // 직원 목록 로딩이 끝나면 로딩 상태 종료
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchComponentData();

        return () => {
            isMounted = false;
        };
    }, []); // 이 컴포넌트 마운트 시 1회만 실행

    // 1) 방 정보·참가자 로드 전용 이펙트
    useEffect(() => {
        if (!activeRoomId || !currentUser?.principal) return;

        const fetchRoomDetails = async () => {
            try {
                setRoomError(null);
                const roomRes = await axiosInstance.get(`/api/v1/chat/rooms/${activeRoomId}`);
                setRoom(roomRes.data);
                const partRes = await axiosInstance.get(
                    `/api/v1/chat/rooms/${activeRoomId}/participants`
                );
                setParticipants(partRes.data);

                // 메시지는 별도 훅(loadLatestMessages)으로 처리
                await loadLatestMessages();

                // 스크롤 초기화
                setInitialLoadComplete(false);
                setHasScrolledInitially(false);
            } catch (err) {
                console.error('정보 불러오기 실패:', err);
                setRoomError('방 정보를 불러오는데 실패했습니다.');
            }
        };

        fetchRoomDetails();
    }, [activeRoomId, currentUser?.principal, loadLatestMessages]);

    const lastReadMsgRef = useRef< { roomId: string; msgId: string } | null >(null);

    // Add a new effect to handle room switching
    useEffect(() => {
        if (!activeRoomId || !currentUser?.principal || activeRoomId === 'main') return;

        // 현재 방 정보를 찾아서 unreadCount가 0이 아니면 한 번만 호출
        const thisRoom = chatRooms.find(
            r => String(r.id) === String(activeRoomId)
        );
        if (!thisRoom || thisRoom.unreadCount === 0) {
            return; // 이미 읽음 처리 되어 있거나 정보가 없으면 무시
        }

        axiosInstance
            .post(`/api/v1/chat/rooms/${activeRoomId}/read`, {
                userId: currentUser.principal,
            })
            .then(() => {
                setChatRooms(prev =>
                    prev.map(r =>
                        String(r.id) === String(activeRoomId)
                            ? { ...r, unreadCount: 0 }
                            : r
                    )
                );
            })
            .catch(err => {
                console.error('Failed to mark as read on room change:', err);
            });
    }, [activeRoomId, currentUser?.principal, chatRooms]);

    // Add an effect to handle tab visibility changes
    // 1) 핸들러를 useCallback으로 정의
    const handleVisibilityChange = useCallback(async () => {
        if (document.visibilityState === 'visible' && activeRoomId) {
            // 탭이 보이게 될 때만 unread 동기화
            await updateUnreadCounts();

            // 활성 방이면 로컬 뱃지 0 설정
            setChatRooms(prevRooms =>
                prevRooms.map(room =>
                    String(room.id) === activeRoomId
                        ? { ...room, unreadCount: 0 }
                        : room
                )
            );
        }
    }, [activeRoomId, updateUnreadCounts]);

// 2) useEffect에서 이벤트 등록/해제
    useEffect(() => {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [handleVisibilityChange]);

    // 주기적 polling 제거: 탭 focus, 방 전환 시에만 updateUnreadCounts 호출

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            const previews: typeof filePreviews = [];
            const uploads: File[] = [];
            let completed = 0;

            newFiles.forEach((file, index) => {
                const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                uploads.push(file);

                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        previews.push({
                            id: fileId,
                            url: event.target?.result as string,
                            type: 'image',
                            name: file.name
                        });
                        completed++;
                        if (completed === newFiles.length) {
                            setFilePreviews(prev => [...prev, ...previews]);
                            setFilesToUpload(prev => [...prev, ...uploads]);
                        }
                    };
                    reader.readAsDataURL(file);
                } else {
                    previews.push({ id: fileId, url: '', type: 'file', name: file.name });
                    completed++;
                    if (completed === newFiles.length) {
                        setFilePreviews(prev => [...prev, ...previews]);
                        setFilesToUpload(prev => [...prev, ...uploads]);
                    }
                }
            });
        }
    };


    const handleRemoveFile = (fileId: string) => {
        // 미리보기에서 해당 파일 제거
        setFilePreviews(prev => prev.filter(file => file.id !== fileId));

        // 실제 파일 목록에서도 제거 (이름 기준으로 삭제)
        const fileToRemove = filePreviews.find(file => file.id === fileId);
        if (fileToRemove) {
            setFilesToUpload(prev => prev.filter(file => file.name !== fileToRemove.name));
        }

        // 모든 파일이 삭제되었다면 input 초기화
        if (filePreviews.length <= 1) {
            if (document.getElementById('fileInput') instanceof HTMLInputElement) {
                (document.getElementById('fileInput') as HTMLInputElement).value = '';
            }
        }
    };

    const handleRemoveAllFiles = () => {
        setFilesToUpload([]);
        setFilePreviews([]);
        if (document.getElementById('fileInput') instanceof HTMLInputElement) {
            (document.getElementById('fileInput') as HTMLInputElement).value = '';
        }
    };

    // 메시지 전송 핸들러도 최적화
    const handleSendMessage = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!inputMessage.trim() && filesToUpload.length === 0) || !currentUser || !activeRoomId || activeRoomId === 'main') {
            return;
        }

        const messageText = inputMessage.trim();
        const files = [...filesToUpload]; // 복사본 생성

        // 입력 필드 즉시 클리어 (UX 개선)
        setInputMessage('');
        handleRemoveAllFiles();

        try {
            // 파일 업로드 처리
            if (files.length > 0) {
                const file = files[0];
                const localBlobUrl = URL.createObjectURL(file);
                const tempId = `local-file-${Date.now()}-${file.name}`;

                try {
                    const formData = new FormData();
                    formData.append('file', file);
                    await axiosInstance.post(
                        `/api/v1/chat/rooms/${activeRoomId}/attachments`,
                        formData,
                        { headers: { 'Content-Type': 'multipart/form-data' } }
                    );

                    // 서버 응답 후 실제 메시지로 교체
                    await refreshMessages();

                    // 임시 메시지 제거
                    setMessages(prev => prev.filter(msg => String(msg.id) !== tempId));

                    // blob URL 메모리 해제
                    URL.revokeObjectURL(localBlobUrl);

                } catch (uploadError) {
                    // 업로드 실패 시 옵티미스틱 메시지 제거
                    setMessages(prev => prev.filter(msg => String(msg.id) !== tempId));
                    URL.revokeObjectURL(localBlobUrl);
                    throw uploadError;
                }
            }

            // 텍스트만 보내는 경우
            if (messageText !== '') {
                sendMessage(messageText);
            }

        } catch (err) {
            console.error('메시지 전송 실패:', err);
            alert('메시지 전송에 실패했습니다.');
            // 실패 시 입력 필드 복원
            setInputMessage(messageText);
        }
    }, [inputMessage, filesToUpload, currentUser, activeRoomId, sendMessage, refreshMessages, handleRemoveAllFiles]);

    useEffect(() => {
        if (!connectionStatus || !inputRef.current) return;
        // messages 배열이 바뀔 때마다(새 메시지 전송/수신) 포커스 재할당
        inputRef.current.focus();
    }, [messages, connectionStatus]);

    const handleContextMenu = (e: React.MouseEvent, messageId: string) => {
        e.preventDefault();

        // 클릭된 요소(e.currentTarget)로부터 가장 가까운 부모 .message 엘리먼트를 찾습니다.
        const messageDiv = (e.currentTarget as HTMLElement).closest('.message') as HTMLElement;
        if (!messageDiv) return;

        // 그 .message 박스의 화면 상 위치(절대 좌표)를 가져옵니다.
        const rect = messageDiv.getBoundingClientRect();

        // 클릭 지점(clientX/Y)에서 .message의 left/top을 빼서
        // ".message 내부" 상대 좌표를 계산합니다.
        const relativeX = e.clientX - rect.left;
        const relativeY = e.clientY - rect.top;

        setContextMenu({
            visible: true,
            x: relativeX,
            y: relativeY,
            messageId,
        });
    };

    const handleDeleteMessage = async (messageId: string) => {
        try {
            // 서버에서 메시지 삭제
            await axiosInstance.delete(`/api/v1/chat/rooms/${activeRoomId}/messages/${messageId}`);

            // 로컬 메시지 상태 즉시 업데이트
            setMessages(prevMessages => {
                const updated = prevMessages.map(msg =>
                    String(msg.id) === messageId
                        ? { ...msg, deleted: true, content: '메시지가 삭제되었습니다!' }
                        : msg
                );

                // 삭제된 메시지 인덱스 찾기
                const indexToReset = updated.findIndex(msg => String(msg.id) === messageId);
                if (indexToReset !== -1) {
                    // ① sizeMap 캐시 삭제
                    delete sizeMap.current[indexToReset];
                    // ② 해당 인덱스부터 레이아웃 재계산
                    listRef.current?.resetAfterIndex(indexToReset, true);
                }

                return updated;
            });

            // 컨텍스트 메뉴 닫기
            setContextMenu({ visible: false, x: 0, y: 0, messageId: '' });

            console.log('메시지가 성공적으로 삭제되었습니다.');
        } catch (err) {
            console.error('메시지 삭제 실패:', err);
            alert('메시지 삭제에 실패했습니다.');
        }
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (e.target instanceof Element && e.target.closest('.context-menu')) return;
            setContextMenu({ visible: false, x: 0, y: 0, messageId: '' });
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleEmployeeClick = (employee: Employee) => {
        setSelectedEmployee(employee);
    };



    const handleStartChat = async () => {
        if (!currentUser || !selectedEmployee) {
            alert('사용자 정보 또는 선택된 직원 정보가 없습니다.');
            return;
        }
        try {
            const employee1Id = currentUser.id ?? currentUser.principal;
            const employee2Id = selectedEmployee.id;
            if (!employee1Id || !employee2Id) {
                throw new Error('Employee ID is missing');
            }
            const requestBody = {
                employee1Id: employee1Id.toString(),
                employee2Id: employee2Id.toString(),
            };
            const response = await axiosInstance.post('/api/v1/chat/direct', requestBody);
            const newRoomId = response.data.id?.toString();
            if (!newRoomId) {
                throw new Error('Invalid room ID in response');
            }
            const roomsResponse = await axiosInstance.get(`/api/v1/chat/rooms/user/${currentUser.principal}`);
            setChatRooms(Array.isArray(roomsResponse.data) ? roomsResponse.data : []);
            const roomResponse = await axiosInstance.get(`/api/v1/chat/rooms/${newRoomId}`);
            const rooms = Array.isArray(roomsResponse.data) ? roomsResponse.data : [];
            const roomsWithUnread = await Promise.all(
                rooms.map(async (r) => {
                    const { data } = await axiosInstance.get<{ unreadCount: number }>(
                        `/api/v1/chat/rooms/${r.id}/unread-count`,
                        { params: { userId: currentUser.principal } }
                    );
                    return { ...r, unreadCount: data.unreadCount };
                })
            );
            setChatRooms(roomsWithUnread);
            const participantsResponse = await axiosInstance.get(`/api/v1/chat/rooms/${newRoomId}/participants`);
            setParticipants(participantsResponse.data);
            refreshMessages();
            setSelectedEmployee(null);
            setActiveRoomId(newRoomId);
            setActiveTab('chatrooms');
        } catch (err: unknown) {
            console.error('채팅방 생성/재사용 실패:', err);
            const errorMessage = err instanceof AxiosError && err.response
                ? `서버 오류: ${err.response.status} - ${err.response.data?.message || err.message}`
                : err instanceof Error
                    ? err.message
                    : '알 수 없는 오류';
            alert(`채팅방 생성/재사용 실패: ${errorMessage}`);
        }
    };

    const openGroupChatModal = () => {
        setShowGroupChatModal(true);
    };

    const closeGroupChatModal = () => {
        setShowGroupChatModal(false);
        setSelectedParticipants([]);
        setGroupChatName('');
    };

    const openInviteModal = () => {
        setShowInviteModal(true);
    };

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setSelectedParticipants([]);
    };

    const handleParticipantSelection = (employee: Employee) => {
        setSelectedParticipants((prev) => {
            const isSelected = prev.some((e) => e.id === employee.id);
            return isSelected
                ? prev.filter((e) => e.id !== employee.id)
                : [...prev, employee];
        });
    };

    const handleCreateGroupChat = async () => {
        if (!currentUser || selectedParticipants.length < 1) {
            alert('최소 2명 이상의 참가자를 선택해야 합니다.');
            return;
        }
        if (groupChatName.trim() === '') {
            alert('채팅방 이름을 입력해주세요.');
            return;
        }
        try {
            const participantIds = [
                currentUser.id ? currentUser.id.toString() : currentUser.principal,
                ...selectedParticipants.map((emp) => emp.id.toString()),
            ];
            const uniqueParticipantIds = [...new Set(participantIds)];
            const requestBody = {
                name: groupChatName,
                participantIds: uniqueParticipantIds,
            };
            const response = await axiosInstance.post('/api/v1/chat/group', requestBody);
            const newRoomId = response.data.id.toString();
            const roomsResponse = await axiosInstance.get(`/api/v1/chat/rooms/user/${currentUser.principal}`);
            const rooms = Array.isArray(roomsResponse.data) ? roomsResponse.data : [];
            const roomsWithUnread = await Promise.all(
                rooms.map(async (r) => {
                    const { data } = await axiosInstance.get<{ unreadCount: number }>(
                        `/api/v1/chat/rooms/${r.id}/unread-count`,
                        { params: { userId: currentUser.principal } }
                    );
                    return { ...r, unreadCount: data.unreadCount };
                })
            );
            setChatRooms(roomsWithUnread);
            closeGroupChatModal();
            setActiveRoomId(newRoomId);
            setActiveTab('chatrooms');
        } catch (err: unknown) {
            console.error('그룹 채팅방 생성 실패:', err);
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
            alert(`그룹 채팅방 생성 실패: ${errorMessage}`);
        }
    };

    const handleInviteParticipants = async () => {
        if (!currentUser || selectedParticipants.length === 0) {
            alert('초대할 참가자를 선택해주세요.');
            return;
        }
        try {
            for (const participant of selectedParticipants) {
                console.log(`초대할 참가자 정보:`, participant);
                await axiosInstance.post(`/api/v1/chat/rooms/${activeRoomId}/invite`, {
                    employeeId: participant.id.toString(),
                });
            }
            const participantsResponse = await axiosInstance.get(`/api/v1/chat/rooms/${activeRoomId}/participants`);
            setParticipants(participantsResponse.data);
            refreshMessages();
            closeInviteModal();
        } catch (err: unknown) {
            console.error('참가자 초대 실패:', err);
            const errorMessage = err instanceof AxiosError && err.response
                ? `서버 오류: ${err.response.status} - ${err.response.data?.message || err.message}`
                : err instanceof Error
                    ? err.message
                    : '알 수 없는 오류';
            alert(`참가자 초대 실패: ${errorMessage}`);
        }
    };

    const handleLeaveRoom = async (e: React.MouseEvent, roomId: string) => {
        e.stopPropagation();
        try {
            await axiosInstance.post(`/api/v1/chat/rooms/${roomId}/exit`);
            const roomsResponse = await axiosInstance.get(`/api/v1/chat/rooms/user/${currentUser.principal}`);
            const rooms = Array.isArray(roomsResponse.data) ? roomsResponse.data : [];
            const roomsWithUnread = await Promise.all(
                rooms.map(async (r) => {
                    const { data } = await axiosInstance.get<{ unreadCount: number }>(
                        `/api/v1/chat/rooms/${r.id}/unread-count`,
                        { params: { userId: currentUser.principal } }
                    );
                    return { ...r, unreadCount: data.unreadCount };
                })
            );
            setChatRooms(roomsResponse.data);
            if (room?.id === roomId) {
                setActiveRoomId('');
                setRoom(null);
            }
        } catch (err: unknown) {
            console.error('방 나가기 실패:', err);
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
            alert('방 나가기에 실패했습니다.');
        }
    };

    const formatMessage = (message: ChatMessage) => {
        if (message.isInviteMessage || message.isExitMessage || message.isDateMessage || message.senderId === 'SYSTEM') {
            return <span className="system-message">{message.content}</span>;
        }
        if (message.deleted) {
            return <span className="deleted-message">메시지가 삭제되었습니다!</span>;
        }
        return message.content;
    };

    useEffect(() => {
        if (activeTab === 'chatrooms' && currentUser?.principal) {
            if (hasFetchedRoomsRef.current) return;
            hasFetchedRoomsRef.current = true;

            const fetchRooms = async () => {
                try {
                    setIsLoadingRooms(true);
                    const res = await axiosInstance.get<{
                        id: number;
                        displayName: string;
                        lastMessage: string;
                        lastActivity: string;
                        unreadCount: number;
                        groupChat?: boolean; // groupChat 속성 추가
                    }[]>(`/api/v1/chat/rooms/user/${currentUser.principal}`);

                    const roomsDto = Array.isArray(res.data) ? res.data : [];

                    setChatRooms(prev => {
                        if (prev.length > 0 && roomsDto.length === 0) {
                            return prev;
                        }

                        return roomsDto.map(dto => {
                            const prevRoom = prev.find(pr => pr.id === String(dto.id));

                            // lastMessage 우선순위 설정
                            let lastMessage = '';

                            // 1) 서버에서 온 lastMessage가 있는 경우
                            if (dto.lastMessage && dto.lastMessage.trim() !== '') {
                                lastMessage = dto.lastMessage;
                            }
                            // 2) 이전 상태의 lastMessage가 있는 경우
                            else if (prevRoom?.lastMessage && prevRoom.lastMessage.trim() !== '') {
                                lastMessage = prevRoom.lastMessage;
                            }

                            return {
                                ...dto,
                                id: String(dto.id),
                                lastMessage,
                                displayMessage: lastMessage,
                                lastActivity: prevRoom?.lastActivity || dto.lastActivity,
                                lastUpdated: Math.max(prevRoom?.lastUpdated || 0, Date.now()),
                                unreadCount: dto.unreadCount,
                                participants: prevRoom?.participants || [],
                                name: prevRoom?.name || '',
                                groupChat: dto.groupChat || prevRoom?.groupChat || false, // groupChat 값 DTO 우선
                            };
                        });
                    });
                } catch (e) {
                    console.error('채팅방 목록 로딩 실패:', e);
                } finally {
                    setIsLoadingRooms(false);
                }
            };

            fetchRooms();
        }
    }, [activeTab, currentUser?.principal, setChatRooms]);

    useEffect(() => {
        if (!messages || messages.length === 0) return;

        const hasSystemMessage = messages.some(
            (msg) => msg.isInviteMessage || msg.isExitMessage || msg.isDateMessage
        );

        if (hasSystemMessage) {
            const updateParticipants = async () => {
                try {
                    if (activeRoomId && activeRoomId !== 'main') {
                        const participantsResponse = await axiosInstance.get(`/api/v1/chat/rooms/${activeRoomId}/participants`);
                        setParticipants(participantsResponse.data);
                    }
                } catch (err) {
                    console.error('참가자 목록 갱신 실패', err);
                }
            };

            updateParticipants();
        }
    }, [messages, activeRoomId]);



    useEffect(() => {
        // 채팅방 목록이 변경될 때마다 현재 활성화된 방의 정보 업데이트
        if (activeRoomId && chatRooms.length > 0) {
            const currentRoom = chatRooms.find(r => String(r.id) === String(activeRoomId));
            if (currentRoom) {
                setRoom(currentRoom);
            }
        }
    }, [chatRooms, activeRoomId]);

    useEffect(() => {
        const handleResize = () => {
            setIsLeftSidebarOpen(window.innerWidth > 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (messages.length > 0 && !initialLoadComplete) {
            setInitialLoadComplete(true);
        }
    }, [messages, initialLoadComplete]);

    const hasAutoFilledRef = useRef(false);

// 8. findFirstUnreadMessageIndex 함수 메모이제이션 개선
    const findFirstUnreadMessageIndex = useCallback(() => {
        if (!currentUser?.principal || sortedMessages.length === 0) return null;

        for (let i = 0; i < sortedMessages.length; i++) {
            const msg = sortedMessages[i];
            if (msg.readBy && !msg.readBy.includes(currentUser.principal)) {
                return i;
            }
        }
        return null;
    }, [sortedMessages, currentUser?.principal]); // 의존성 최소화

// 2. 사용자가 하단 근처에 있는지 확인하는 함수
    const checkIfNearBottom = useCallback(() => {
        if (!listRef.current) return true;

        const scrollOffset = (listRef.current as any).state?.scrollOffset || 0;
        const containerHeight = CONTAINER_HEIGHT;
        const totalHeight = sortedMessages.length * ITEM_HEIGHT;
        const maxScroll = Math.max(0, totalHeight - containerHeight);

        // 하단에서 100px 이내면 "하단 근처"로 간주
        return maxScroll - scrollOffset <= 100;
    }, [sortedMessages.length]);

// 3. 스크롤을 하단으로 이동하는 함수
    const scrollToBottom = useCallback(() => {
        if (!listRef.current || sortedMessages.length === 0) return;

        requestAnimationFrame(() => {
            if (listRef.current) {
                listRef.current.scrollToItem(sortedMessages.length - 1, 'end');
                isNearBottomRef.current = true;
            }
        });
    }, [sortedMessages.length]);

// 4. 안읽은 메시지로 스크롤하는 함수
    const scrollToFirstUnread = useCallback(() => {
        if (!listRef.current || !currentUser?.principal || sortedMessages.length === 0) return;

        const unreadIndex = findFirstUnreadMessageIndex();

        requestAnimationFrame(() => {
            if (listRef.current) {
                if (unreadIndex !== null && unreadIndex > 0) {
                    // 안읽은 메시지가 있으면 그 위치로
                    listRef.current.scrollToItem(unreadIndex, 'center');
                    isNearBottomRef.current = false;
                    console.log('📍 안읽은 메시지로 스크롤:', unreadIndex);
                } else {
                    // 안읽은 메시지가 없으면 맨 아래로
                    scrollToBottom();
                    console.log('📍 최신 메시지로 스크롤');
                }
            }
        });
    }, [findFirstUnreadMessageIndex, scrollToBottom, sortedMessages.length, currentUser]);

// 1) useRef로 타이머 보유
    const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);

// 2) handleScroll 수정
    // 마운트 직후 1초 뒤에 스크롤 로직 활성화
    useEffect(() => {
        const timer = setTimeout(() => {
            scrollEnabledRef.current = true;
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

// 기존 handleScroll을 아래처럼 변경
    const handleScroll = useCallback(
        async ({ scrollOffset }: ListOnScrollProps) => {
            // ① 아직 스크롤 로직이 활성화되지 않았다면 무시
            if (!scrollEnabledRef.current) return;

            // ② 이전 타이머 취소
            if (scrollThrottleRef.current) {
                clearTimeout(scrollThrottleRef.current);
            }

            scrollThrottleRef.current = setTimeout(async () => {
                const containerHeight = CONTAINER_HEIGHT;
                const totalHeight = sortedMessages.length * ITEM_HEIGHT;
                const maxScroll = Math.max(0, totalHeight - containerHeight);

                isNearBottomRef.current = maxScroll - scrollOffset <= 100;

                // ③ 실제 사용자가 맨 위로 스크롤했을 때만 로드
                if (
                    scrollOffset <= ITEM_HEIGHT * 2 &&
                    !isFetchingRef.current &&
                    !isRestoringRef.current &&
                    hasMoreHistory() &&
                    initialScrollDone &&
                    sortedMessages.length > 0
                ) {
                    await loadMoreIfNeeded();
                }
            }, 50);
        },
        [hasMoreHistory, initialScrollDone, sortedMessages.length, loadMoreIfNeeded]
    );

    useEffect(() => {
        return () => {
            // 컴포넌트 언마운트 시 타이머 정리
            if (scrollThrottleRef.current) {
                clearTimeout(scrollThrottleRef.current);
            }
        };
    }, []);

// 6. 메시지 로드 완료 후 초기 스크롤 처리
    useLayoutEffect(() => {
        if (
            !initialScrollDone &&
            isInitialLoadComplete &&
            sortedMessages.length > 0 &&
            activeRoomId &&
            activeRoomId !== 'main' &&
            listRef.current
        ) {
            const unreadIndex = findFirstUnreadMessageIndex();
            if (unreadIndex !== null && unreadIndex > 0) {
                listRef.current.scrollToItem(unreadIndex, 'center');
                isNearBottomRef.current = false;
                console.log('📍 안읽은 메시지로 스크롤:', unreadIndex);
            } else {
                listRef.current.scrollToItem(sortedMessages.length - 1, 'end');
                isNearBottomRef.current = true;
                console.log('📍 최신 메시지로 스크롤');
            }
            setInitialScrollDone(true);
        }
    }, [
        initialScrollDone,
        isInitialLoadComplete,
        sortedMessages.length,
        activeRoomId,
        findFirstUnreadMessageIndex
    ]);

// 5. 새 메시지 수신 시 자동 스크롤 처리 수정
    useLayoutEffect(() => {
        if (!initialScrollDone || sortedMessages.length === 0) return;

        const lastMessage = sortedMessages[sortedMessages.length - 1];
        if (
            lastMessage &&
            (lastMessage.senderId === String(currentUser?.principal) || isNearBottomRef.current)
        ) {
            // useLayoutEffect를 사용하면 DOM이 paint되기 직전에 실행된다.
            if (listRef.current) {
                listRef.current.scrollToItem(sortedMessages.length - 1, 'end');
            }
        }
    }, [sortedMessages.length, initialScrollDone]);

// 6. sortedMessages에서 deleted 플래그 변화 감지 → sizeMap 초기화 + reset
    useEffect(() => {
        sortedMessages.forEach((msg, idx) => {
            const prev = prevMessagesRef.current[idx];
            if (msg.deleted && !prev?.deleted) {
                delete sizeMap.current[idx];
                listRef.current?.resetAfterIndex(idx, true);
            }
        });
        prevMessagesRef.current = sortedMessages.map(m => ({ ...m }));
    }, [sortedMessages]);

// 6. 방 전환 시 상태 초기화
    useEffect(() => {
        if (!activeRoomId || activeRoomId === 'main') {
            setInitialScrollDone(false);
            setShouldScrollToBottom(true);
            isNearBottomRef.current = true;
            scrollRestoreRef.current = null;
            return;
        }

        // 방이 바뀔 때마다 초기화
        setInitialScrollDone(false);
        setShouldScrollToBottom(true);
        isNearBottomRef.current = true;
        scrollRestoreRef.current = null;

        // 플래그들도 리셋
        isFetchingRef.current = false;
        isRestoringRef.current = false;
    }, [activeRoomId]);

// 메시지 읽음 처리 관련 상태
    const messageReadSet = useRef<Set<string>>(new Set());
    const messageReadTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
    const isUpdatingUnreadRef = useRef(false);

    useEffect(() => {
        if (!activeRoomId || activeRoomId === 'main' || !currentUser?.principal || messages.length === 0)
            return;

        const lastMsg = messages[messages.length - 1];
        // 내가 보낸 메시지면 skip
        if (lastMsg.senderId === String(currentUser.principal)) return;
        // 이미 처리됐거나, 호출 중이면 skip
        if (
            lastReadMessageInfoRef.current?.roomId === activeRoomId &&
            lastReadMessageInfoRef.current.messageId === lastMsg.id
        ) return;
        if (processingReadRef.current) return;

        // 뱃지 0 이면 기록만
        const thisRoom = chatRooms.find(r => String(r.id) === String(activeRoomId));
        if (thisRoom?.unreadCount === 0) {
            lastReadMessageInfoRef.current = { roomId: activeRoomId, messageId: lastMsg.id };
            return;
        }

        // 실제 호출
        processingReadRef.current = true;
        axiosInstance.post(`/api/v1/chat/rooms/${activeRoomId}/read`, { userId: currentUser.principal })
            .then(() => {
                setChatRooms(prev =>
                    prev.map(r =>
                        String(r.id) === activeRoomId
                            ? { ...r, unreadCount: 0 }
                            : r
                    )
                );
                lastReadMessageInfoRef.current = { roomId: activeRoomId, messageId: lastMsg.id };
            })
            .finally(() => {
                processingReadRef.current = false;
            });
    }, [activeRoomId, currentUser?.principal, messages, chatRooms, setChatRooms]);

// 컴포넌트 언마운트 시 정리
    useEffect(() => {
        return () => {
            Object.values(messageReadTimeoutRef.current).forEach(timeout => {
                clearTimeout(timeout);
            });
            messageReadSet.current.clear();
        };
    }, []);

// 방 전환 시 읽음 처리
    useEffect(() => {
        if (!activeRoomId || !currentUser?.principal || activeRoomId === 'main') return;
        handleMessageRead(activeRoomId);
    }, [activeRoomId, currentUser?.principal, handleMessageRead]);

// 탭 가시성 변경 시 읽음 처리
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (!document.hidden && activeRoomId && currentUser?.principal) {
                handleMessageRead(activeRoomId);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [activeRoomId, currentUser?.principal, handleMessageRead]);

// 주기적 읽음 상태 polling 제거: handleMessageRead 는 탭 focus, 메시지 수신 시에만 호출

// 아래 두 개의 ref로 대체 또는 보강하여 사용합니다.
    const lastReadMessageInfoRef = useRef<{ roomId: string; messageId: string } | null>(null);
    const processingReadRef = useRef<boolean>(false); // 읽음 처리 API 호출 중인지 여부를 나타내는 플래그

// messages, activeRoomId, currentUser, chatRooms, setChatRooms 에 의존하는 useEffect 수정
    useEffect(() => {
        // 조건: 활성화된 방 ID가 있고, 'main'이 아니며, 현재 유저 정보가 있고, 메시지 배열에 내용이 있을 때
        if (!activeRoomId || activeRoomId === 'main' || !currentUser?.principal || messages.length === 0) {
            return;
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) return; // 마지막 메시지가 없으면 종료

        // 1. 내가 보낸 메시지는 읽음 처리 대상이 아님
        if (lastMessage.senderId === String(currentUser.principal)) {
            // 내가 보낸 메시지라도, 이전에 다른 사용자의 메시지를 읽었다는 정보는 유지해야 하므로,
            // lastReadMessageInfoRef를 여기서 초기화하거나 변경하지 않습니다.
            return;
        }

        // 2. 이미 이 메시지에 대해 성공적으로 읽음 처리했으면 중복 실행 방지
        if (
            lastReadMessageInfoRef.current &&
            lastReadMessageInfoRef.current.roomId === activeRoomId &&
            lastReadMessageInfoRef.current.messageId === lastMessage.id
        ) {
            return;
        }

        // 3. 현재 다른 읽음 처리 API 호출이 진행 중이면, 현재 로직 실행 중단 (중복 호출 방지)
        if (processingReadRef.current) {
            return;
        }

        // 4. 현재 방의 unreadCount가 이미 0이면, 추가적인 API 호출은 불필요.
        //    이 경우, lastReadMessageInfoRef만 업데이트하여 다음 번 동일 메시지 검사 시 빠르게 반환하도록 함.
        const currentRoomState = chatRooms.find(r => String(r.id) === String(activeRoomId));
        if (currentRoomState && currentRoomState.unreadCount === 0) {
            lastReadMessageInfoRef.current = { roomId: activeRoomId, messageId: lastMessage.id };
            return;
        }

        // 읽음 처리 API 호출 시작을 표시
        processingReadRef.current = true;

        axiosInstance.post(`/api/v1/chat/rooms/${activeRoomId}/read`, {
            userId: currentUser.principal,
        })
            .then(() => {
                setChatRooms(prevChatRooms => {
                    const roomIndex = prevChatRooms.findIndex(r => String(r.id) === String(activeRoomId));

                    // 방이 존재하고, 해당 방의 unreadCount가 0이 아닐 때만 상태를 업데이트
                    if (roomIndex !== -1 && prevChatRooms[roomIndex].unreadCount !== 0) {
                        const updatedRooms = [...prevChatRooms];
                        updatedRooms[roomIndex] = { ...updatedRooms[roomIndex], unreadCount: 0 };
                        return updatedRooms;
                    }
                    // 변경사항이 없으면 기존 상태를 그대로 반환하여 불필요한 리렌더링 방지
                    return prevChatRooms;
                });
                // 성공적으로 읽음 처리된 메시지 정보 기록
                lastReadMessageInfoRef.current = { roomId: activeRoomId, messageId: lastMessage.id };
            })
            .catch((error) => {
                console.error(`메시지 읽음 처리 실패 (room: ${activeRoomId}, msgId: ${lastMessage.id}):`, error);
                // API 호출 실패 시, lastReadMessageInfoRef를 업데이트하지 않아,
                // 다음 번 동일 조건 발생 시 재시도할 수 있도록 합니다.
                // (단, 짧은 시간 내 반복적인 실패를 유발할 수 있으므로, 재시도 정책을 더 정교하게 만들 수 있습니다.)
            })
            .finally(() => {
                // 읽음 처리 API 호출 종료 표시
                processingReadRef.current = false;
            });

    }, [activeRoomId, currentUser?.principal, messages, chatRooms, setChatRooms]); // 의존성 배열: activeRoomId, currentUser, messages, chatRooms, setChatRooms

    if (isLoadingUser) return <div>사용자 정보를 불러오는 중입니다...</div>;
    // ★★★ [수정] 이 컴포넌트의 로딩 조건 단순화 ★★★
    if (isLoading) {
        return <div className="loading">로딩 중...</div>;
    }

    return (
        <Layout>
            <div className="kakao-style-layout">
                <button
                    className="menu-toggle"
                    onClick={toggleLeftSidebar}
                    style={{display: 'none'}} // 기본적으로 숨김, 미디어 쿼리에서 표시
                >
                    ☰
                </button>
                <div className={`left-sidebar ${isLeftSidebarOpen ? 'open' : ''}`}>
                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
                            onClick={() => setActiveTab('employees')}
                        >
                            직원 목록
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'chatrooms' ? 'active' : ''}`}
                            onClick={() => setActiveTab('chatrooms')}
                        >
                            채팅방
                        </button>
                    </div>

                    {activeTab === 'employees' && (
                        <div className="tab-content active">
                            <div className="search-bar">
                                <input
                                    type="text"
                                    placeholder="직원 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <ul className="employee-list">
                                {filteredEmployees.map((employee, index) => (
                                    <li key={`${employee.id}-${index}`} onClick={() => handleEmployeeClick(employee)}>
                                        <div className="employee-item">
                                            <AuthenticatedImage
                                                imagePath={getProfileImagePath(employee)}
                                                altText={employee.name}
                                                className="profile-image"
                                            />
                                            <div className="employee-info">
                                                <div className="employee-name">{employee.name}</div>
                                                <div className="employee-position">
                                                    {employee.departmentName} · {employee.position}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {activeTab === 'chatrooms' && (
                        <div className="tab-content active">
                            <div className="search-bar">
                                <input
                                    type="text"
                                    placeholder="채팅방 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <button className="create-chat-btn" onClick={openGroupChatModal}>+</button>
                            </div>
                            <ul className="chatroom-list">
                                {isLoadingRooms ? (
                                    <li className="loading">채팅 목록 로딩 중...</li>
                                ) : (
                                    filteredChatRooms.map(room => (
                                        <li key={room.id} onClick={() => handleRoomClick(room.id)}
                                            className="chatroom-li">
                                            <div className="chatroom-item">
                                                <div className="room-info">
                                                    <div className="room-name">{room.displayName}</div>
                                                    <div
                                                        className="last-message">{room.displayMessage || '새로운 채팅방'}</div>
                                                    <div className="room-meta">
              <span className="timestamp">
                {room.lastActivity
                    ? new Date(room.lastActivity).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    : ''}
              </span>
                                                        {room.unreadCount > 0 && (
                                                            <span className="unread-badge">{room.unreadCount}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {room.name !== "Main Room" && (
                                                    <button className="leave-room-btn"
                                                            onClick={e => handleLeaveRoom(e, room.id)}>
                                                        방 나가기
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="chat-main">
                    {!activeRoomId ? (
                        <div className="no-chat-selected">
                            <p>채팅방을 선택하거나 직원을 클릭하여 대화를 시작하세요.</p>
                        </div>
                    ) : (
                        <>
                            <header className="chat-header">
                                <h2>{room?.displayName || '채팅방'}</h2>
                                <div className="chat-header-info">
                                    <div className="participants-count">{participants.length}명 참여 중</div>

                                    {(() => {
                                        console.log("📝 isGroupChat:", room?.groupChat, "participants.length:", participants.length);
                                        // 🔥 수정: groupChat 플래그만으로 판단
                                        return room?.groupChat === true;
                                    })() && (
                                        <button className="invite-btn" onClick={openInviteModal}
                                                disabled={participants.length === 0}>
                                        <span role="img" aria-label="invite">➕</span> 참가자 초대
                                        </button>
                                    )}
                                </div>
                            </header>

                            <div className="chat-messages">
                                {roomError ? (
                                    <div className="error-message" style={{color: 'red', textAlign: 'center'}}>
                                        {roomError}
                                    </div>
                                ) : (
                                    <VariableSizeList
                                        ref={listRef}
                                        height={window.innerHeight - 200}
                                        itemCount={sortedMessages.length}
                                        itemSize={getSize}
                                        width="100%"
                                        overscanCount={20}
                                        itemKey={(index) => {
                                            // 각 메시지의 id를 고유 키로 사용
                                            return sortedMessages[index].id;
                                        }}
                                        onScroll={handleScroll}
                                    >
                                        {({ index, style }: ListChildComponentProps) => {
                                            const msg = sortedMessages[index];
                                            const prevMsg = index > 0 ? sortedMessages[index - 1] : null;

                                            return (
                                                <div style={style} key={sortedMessages[index].id}>
                                                    <MessageItem
                                                        message={msg}
                                                        prevMessage={prevMsg}
                                                        currentUser={currentUser}
                                                        participants={participants}
                                                        handleContextMenu={handleContextMenu}
                                                        contextMenu={contextMenu}
                                                        handleDeleteMessage={handleDeleteMessage}
                                                        handleImageRead={handleImageRead}
                                                        formatMessage={formatMessage}
                                                        makeSrc={makeSrc}
                                                        defaultProfileImage={defaultProfileImage}
                                                    />
                                                </div>
                                            );
                                        }}
                                    </VariableSizeList>
                                )}
                            </div>

                            {connectionStatus !== 'connected' && (
                                <div className={`connection-status ${connectionStatus}`}>
                                    {connectionStatus === 'connecting' && '연결 중...'}
                                    {connectionStatus === 'error' && `연결 오류: ${wsError}`}
                                    {connectionStatus === 'disconnected' && '연결이 끊어졌습니다.'}
                                </div>
                            )}

                            {filePreviews.length > 0 && (
                                <div className="file-preview-container">
                                    {filePreviews.map(file => (
                                        <div className="file-preview" key={file.id}>
                                            {file.type === 'image' ? (
                                                <img src={file.url} alt={`이미지 미리보기: ${file.name}`} className="image-preview" />
                                            ) : (
                                                <div className="file-name-preview">
                                                    <span className="file-icon">📄</span>
                                                    <span className="file-name">{file.name}</span>
                                                </div>
                                            )}
                                            <button
                                                className="remove-file-btn"
                                                onClick={() => handleRemoveFile(file.id)}
                                                type="button"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}


                            <div className="message-form">
                                {/* 첨부 버튼 */}
                                <input
                                    type="file"
                                    id="fileInput"
                                    style={{display: 'none'}}
                                    onChange={handleFileChange}
                                    multiple
                                />
                                <button type="button"
                                        onClick={() => document.getElementById('fileInput')?.click()}>
                                    📎
                                </button>
                                <input
                                    ref={inputRef}
                                    autoFocus
                                    type="text"
                                    placeholder="메시지를 입력하세요..."
                                    value={inputMessage}
                                    onChange={(e) => setInputMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();     // 기본 엔터(줄바꿈) 막기
                                            handleSendMessage(e);   // 바로 메시지 전송
                                        }
                                    }}
                                    disabled={connectionStatus !== 'connected'}
                                />
                                <button type="submit"
                                        onClick={handleSendMessage}
                                        disabled={connectionStatus !== 'connected' || (!inputMessage.trim() && filesToUpload.length === 0)}>
                                    전송
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {selectedEmployee && (
                <div className="modal-overlay" onClick={() => setSelectedEmployee(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{selectedEmployee.name}</h3>
                        </div>
                        <div className="modal-body">
                            <AuthenticatedImage
                                imagePath={getProfileImagePath(selectedEmployee)}
                                altText={selectedEmployee.name}
                                className="modal-profile-image"
                            />
                            <div className="modal-employee-info">
                                <p><strong>부서:</strong> {selectedEmployee.departmentName || '정보 없음'}</p>
                                <p><strong>직급:</strong> {selectedEmployee.position || '정보 없음'}</p>
                                <p><strong>전화번호:</strong> {selectedEmployee.phone || '정보 없음'}</p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={handleStartChat}>대화 시작</button>
                            <button onClick={() => setSelectedEmployee(null)}>닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {showGroupChatModal && (
                <div className="modal-overlay" onClick={closeGroupChatModal}>
                    <div className="group-chat-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>새 채팅방 만들기</h3>
                        </div>
                        <div className="modal-body">
                            <div className="group-chat-form">
                                <div className="form-group">
                                    <label>채팅방<br/>이름</label>
                                    <input
                                        type="text"
                                        value={groupChatName}
                                        onChange={(e) => setGroupChatName(e.target.value)}
                                        placeholder="채팅방 이름을 입력하세요"
                                    />
                                </div>
                                {/* ——— 검색창 추가 ——— */}
                                <div className="form-group">
                                    <input
                                        type="text"
                                        placeholder="참가자 검색"
                                        value={groupModalSearch}
                                        onChange={e => setGroupModalSearch(e.target.value)}
                                        style={{ width: '100%', marginBottom: '8px' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>참가자<br/>선택</label>
                                    <ul className="employee-list modal-employee-list">
                                        {filteredGroupModalEmployees.map(employee => {
                                            const isSelected = selectedParticipants.some(e => e.id === employee.id);
                                            return (
                                                <li key={employee.id}
                                                    onClick={() => handleParticipantSelection(employee)}
                                                    className={isSelected ? 'selected' : ''}>
                                                    <div className="employee-item">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleParticipantSelection(employee)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <AuthenticatedImage
                                                            imagePath={getProfileImagePath(employee)}
                                                            altText={employee.name}
                                                            className="modal-profile-image"
                                                        />
                                                        <div className="employee-info">
                                                            <div className="employee-name">{employee.name}</div>
                                                            <div className="employee-position">
                                                                {employee.departmentName} · {employee.position}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={handleCreateGroupChat}
                                    disabled={selectedParticipants.length < 1 || groupChatName.trim() === ''}>
                                채팅방 생성
                            </button>
                            <button onClick={closeGroupChatModal}>취소</button>
                        </div>
                    </div>
                </div>
            )}

            {showInviteModal && (
                <div className="modal-overlay" onClick={closeInviteModal}>
                    <div className="group-chat-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>참가자 초대</h3>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <input
                                    type="text"
                                    placeholder="초대할 참가자 검색"
                                    value={inviteModalSearch}
                                    onChange={e => setInviteModalSearch(e.target.value)}
                                    style={{width: '100%', marginBottom: '8px'}}
                                />
                            </div>
                            <div className="group-chat-form">
                                <div className="form-group">
                                    <label>초대할 참가자 선택</label>
                                    <ul className="employee-list modal-employee-list">
                                        {filteredInviteModalEmployees
                                            .map(employee => {
                                                const isSelected = selectedParticipants.some(e => e.id === employee.id);
                                                return (
                                                    <li key={employee.id}
                                                        onClick={() => handleParticipantSelection(employee)}
                                                        className={isSelected ? 'selected' : ''}>
                                                        <div className="employee-item">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleParticipantSelection(employee)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <AuthenticatedImage
                                                                imagePath={getProfileImagePath(employee)} // [수정]
                                                                altText={employee.name}
                                                                className="modal-profile-image"
                                                            />
                                                            <div className="employee-info">
                                                                <div
                                                                    className="employee-name">{employee.name}</div>
                                                                <div className="employee-position">
                                                                    {employee.departmentName} · {employee.position}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={handleInviteParticipants}
                                    disabled={selectedParticipants.length === 0}>
                                초대
                            </button>
                            <button onClick={closeInviteModal}>취소</button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default ChatMainComponent;