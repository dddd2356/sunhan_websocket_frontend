import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AxiosError } from 'axios'; // Add import if not already present
import SockJS from 'sockjs-client';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import axiosInstance from '../../views/Authentication/axiosInstance';
import Cookies from 'universal-cookie';
import { Employee, ChatMessage, ChatRoom } from '../../views/Detail/ChatMainComponent';
import { useNotification } from '../../App';
import {VariableSizeList} from "react-window";
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// 글로벌 캐시 및 연결 관리
const activeConnections = new Map<string, Client>();
const notifiedMessageIds = new Set<string>();

const useChatWebSocket = (
    roomId: string,
    token: string,
    currentUser: any,
    chatRooms: ChatRoom[],
    onParticipantsUpdate?: (participants: Employee[]) => void,
    notifyCallback?: (title: string, content: string, roomId: string, messageId?: string) => void,
    // 🔥 수정됨: updateChatRooms 콜백의 타입 정의 (totalUnread는 이제 선택 사항)
    updateChatRooms?: (roomId: string, info: { lastMessage: string; unreadCount: number; displayMessage?: string }, totalUnread?: number) => void,
    // 🔥 수정됨: 전체 읽지 않은 메시지 수를 외부에 노출하기 위한 상태 업데이트 콜백
    onTotalUnreadCountUpdate?: (count: number) => void,
) => {
    const [messagesMap, setMessagesMap] = useState<{ [key: string]: ChatMessage[] }>({});
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [wsError, setWsError] = useState<string | null>(null);
    const [participants, setParticipants] = useState<Employee[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [hasPermission, setHasPermission] = useState<boolean>(true);
    const stompClientRef = useRef<Client | null>(null);
    const notificationSubsRef = useRef<StompSubscription[]>([]);
    const connectionKey = useRef<string>(`${roomId}-${token}-${currentUser?.principal}`);
    const messagesFetched = useRef<boolean>(false);
    const isInitialLoadDone = useRef<boolean>(false);
    const roomIdRef = useRef<string>('');
    const currentUserRef = useRef<any>(currentUser);
    const participantsRef = useRef<Employee[]>([]);
    const readMessagesRef = useRef<{ [key: string]: boolean }>(
        JSON.parse(localStorage.getItem(`readMessages_${roomId}_${currentUser?.principal}`) || '{}')
    );
    //const scrollOffsetBeforePrependRef = useRef<number | null>(null); // 스크롤 위치 저장 ref
    const [prependScrollIndex, setPrependScrollIndex] = useState<number | null>(null);
    const msgSubRef = useRef<StompSubscription | null>(null);
    const readSubRef = useRef<StompSubscription | null>(null);
    const partSubRef = useRef<StompSubscription | null>(null);
    const unreadSubRef = useRef<StompSubscription | null>(null);
    const { notify: contextNotify } = useNotification();
    const notify = notifyCallback || contextNotify;
    // 📌 페이지 처리용 추가
    const currentPageRef = useRef(0);
    const totalPagesRef = useRef(1);
    const pageSize = 100; // pageSize를 100으로 설정
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState<boolean>(false);
    const listRef = useRef<VariableSizeList>(null);
    // 🔥 추가: 파일/이미지 타입에 따른 last_message 텍스트 변환 함수
    const getLastMessageText = useCallback((message: ChatMessage) => {
        if (message.attachmentType === 'image') {
            return '📷 사진';
        } else if (message.attachmentType && message.attachmentType !== 'image') {
            return '📄 파일';
        } else {
            return message.content?.length > 50
                ? `${message.content.substring(0, 50)}...`
                : message.content || '';
        }
    }, []);
    const processedUnreadMessageIds = useRef<Set<string>>(new Set());

    // chatRooms state가 변경될 때마다 ref 동기화
    // 🔥 추가: chatRooms 상태 업데이트 시 ref 동기화 강화 및 totalUnreadCount 업데이트
    useEffect(() => {
        chatRoomsRef.current = chatRooms;
        // unread count 변경 사항을 다른 컴포넌트에 알림
        if (onTotalUnreadCountUpdate) {
            const totalUnread = chatRooms.reduce((sum, room) => sum + (room.unreadCount || 0), 0);
            onTotalUnreadCountUpdate(totalUnread);
            console.log("🔥 Total unread count updated:", totalUnread);
        }

        // 디버깅용 로그 추가
        console.log('🏷️ Badge Debug: chatRooms state updated');
        console.log({
            chatRooms: chatRooms.map(r => ({ id: r.id, unread: r.unreadCount })),
            chatRoomsRef: chatRoomsRef.current.map(r => ({ id: r.id, unread: r.unreadCount }))
        });

    }, [chatRooms, onTotalUnreadCountUpdate]);


    useEffect(() => {
        // roomId가 존재하고 빈 문자열이 아닌 경우에만 처리
        if (roomId && roomId !== roomIdRef.current) {
            console.log(`useChatWebSocket: Switching to room ${roomId}`);
            if (!messagesMap[roomId]) {
                setMessagesMap(prev => ({ ...prev, [roomId]: [] }));
            }
            messagesFetched.current = false;
            totalPagesRef.current = 0;
            currentPageRef.current = -1;
            isFetchingRef.current = false;
            roomIdRef.current = roomId;
        }
    }, [roomId, messagesMap]);

    const chatRoomsRef = useRef<ChatRoom[]>(chatRooms);
    const hasLoadedHistoryRef = useRef(false);
    const isFetchingRef = useRef(false);


    // 레퍼런스 값 업데이트
    useEffect(() => {
        // 빈 문자열이 아닌 경우에만 roomIdRef 업데이트
        if (roomId) {
            roomIdRef.current = roomId;
            connectionKey.current = `${roomId}-${token}-${currentUser?.principal}`;
            currentPageRef.current = 0;
        }
    }, [roomId, token, currentUser]);

    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
    useEffect(() => { participantsRef.current = participants; }, [participants]);
    useEffect(() => { setMessages(messagesMap[roomId] || []); }, [messagesMap, roomId]);

    // 인터페이스에 활성 채팅방 정보 추가
    const isActiveInRoom = useRef<boolean>(false);

    useEffect(() => {
        // 빈 문자열이 아닌 경우에만 활성 방으로 간주
        isActiveInRoom.current = roomId !== '';
    }, [roomId]);

    const handleParticipantsUpdate = useCallback(
        (newParticipants: Employee[]) => {
            setParticipants(newParticipants);
            participantsRef.current = newParticipants;
            onParticipantsUpdate?.(newParticipants);
            setMessagesMap(prev => {
                if (!prev[roomId]) return prev;
                const updated = prev[roomId].map(msg => ({
                    ...msg,
                    unreadCount: newParticipants.length - (msg.readBy?.length || 0),
                }));
                return { ...prev, [roomId]: updated };
            });
        },
        [roomId, onParticipantsUpdate]
    );

    // 메시지 읽음 처리 시 상태 업데이트 추가
    const markMessageAsRead = useCallback(async (messageId: string, userId: string, senderId: string) => {
        // ➕ roomId가 유효한지 먼저 검사
        const rid = roomIdRef.current;
        if (!rid || rid === 'main') {
            console.warn(`markMessageAsRead: invalid roomId (${rid}), skipping`);
            return;
        }

        if (userId === senderId || readMessagesRef.current[messageId]) {
            console.log(`markMessageAsRead: Skipping (already read or self-sent) for messageId=${messageId}`);
            return;
        }

        try {
            await axiosInstance.post(
                `/api/v1/chat/rooms/${roomIdRef.current}/read`,
                { messageId, userId },
                { headers: { 'Content-Type': 'application/json' } }
            );

            // 🔥 핵심 수정: 현재 방의 상태를 먼저 가져옴
            const currentRoomInRef = chatRoomsRef.current.find(r => String(r.id) === roomIdRef.current);
            const currentLastMessage = currentRoomInRef?.lastMessage || '';
            const currentDisplayMessage = currentRoomInRef?.displayMessage || '';

            setMessagesMap(prev => {
                const roomMessages = prev[roomIdRef.current] || [];
                const updatedMessages = roomMessages.map(msg =>
                    String(msg.id) === String(messageId)
                        ? { ...msg, readBy: [...msg.readBy, userId], unreadCount: 0 }
                        : msg
                );

                const roomUnreadAfter = updatedMessages.reduce((cnt, m) => {
                    if (String(m.senderId) !== String(userId) && !m.readBy.includes(userId)) {
                        return cnt + 1;
                    }
                    return cnt;
                }, 0);

                // 🔥 핵심 수정: lastMessage 결정 로직
                let finalLastMessage = currentLastMessage;

                // 1. 현재 lastMessage가 비어있으면 메시지에서 가져오기
                if (!finalLastMessage.trim()) {
                    const lastMessage = updatedMessages[updatedMessages.length - 1];
                    if (lastMessage) {
                        if (lastMessage.attachmentType === 'image') {
                            finalLastMessage = '📷 사진';
                        } else if (lastMessage.attachmentType) {
                            finalLastMessage = '📄 파일';
                        } else {
                            finalLastMessage = lastMessage.content || '';
                        }
                    }
                }

                // 2. 여전히 비어있으면 displayMessage 사용
                if (!finalLastMessage.trim() && currentDisplayMessage.trim()) {
                    finalLastMessage = currentDisplayMessage;
                }

                console.log(`markMessageAsRead: Updating room ${roomIdRef.current} - preserving lastMessage: "${finalLastMessage}", setting unreadCount: ${roomUnreadAfter}`);

                // 현재 사용자가 보고 있는 방에서는 preview 문구를 업데이트할 필요가 없다.
                // (오히려 과거 메시지로 덮어써 깜빡임이 생길 수 있음)
                if (finalLastMessage.trim() !== '' && roomIdRef.current !== roomId) {
                    // setTimeout을 사용하여 상태 업데이트를 다음 틱으로 지연
                    setTimeout(() => {
                        updateChatRooms?.(roomIdRef.current, {
                            lastMessage: finalLastMessage,
                            unreadCount: roomUnreadAfter
                        });
                    }, 0);
                }

                return { ...prev, [roomIdRef.current]: updatedMessages };
            });

            readMessagesRef.current[messageId] = true;
            localStorage.setItem(
                `readMessages_${roomIdRef.current}_${userId}`,
                JSON.stringify(readMessagesRef.current)
            );
        } catch (e) {
            console.error('Failed to mark read:', e);
        }
    }, [updateChatRooms]);

    // ─── 과거 메시지 로딩 함수 ────────────────────────────────────────────────
    const debounce = <T extends (...args: any[]) => Promise<any>>(func: T, wait: number) => {
        let timeout: NodeJS.Timeout | null = null;
        return (...args: Parameters<T>): Promise<ReturnType<T>> => {
            return new Promise((resolve, reject) => {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(async () => {
                    try {
                        const result = await func(...args);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }, wait);
            });
        };
    };

    const fetchChatHistory = useCallback(async (retryCount = 0): Promise<void> => {
        const rid = roomIdRef.current;
        const user = currentUserRef.current;
        if (!rid || rid === 'main' || !token || !user) {
            console.warn(
                `fetchChatHistory: Skipped (rid=${rid}, token?=${!!token}, user?=${!!user})`
            );
            return;
        }

        // 1. 기존 unread count 보존
        const currentRoom = chatRoomsRef.current.find(r => String(r.id) === rid);
        const preservedUnreadCount = currentRoom?.unreadCount || 0;


        if (!roomIdRef.current || !token || !currentUserRef.current) {
            console.warn(`fetchChatHistory: Exiting early - roomId=${roomIdRef.current}, token=${!!token}, user=${!!currentUserRef.current}`);
            return;
        }

        const maxRetries = 1;
        const userId = currentUserRef.current.principal;
        console.log(`fetchChatHistory: Fetching room=${roomIdRef.current}, page=${currentPageRef.current}, retry=${retryCount}`);

        try {
            if (currentPageRef.current === -1) {
                const metaResp = await axiosInstance.get(
                    `/api/v1/chat/rooms/${roomIdRef.current}/messages`,
                    { params: { page: 0, size: pageSize, userId, sort: 'timestamp,desc' } }
                );
                totalPagesRef.current = metaResp.data.totalPages;
                let lastPage = totalPagesRef.current - 1;
                console.log(`fetchChatHistory: Total pages=${totalPagesRef.current}, lastPage=${lastPage}`);

                if (lastPage < 0) {
                    setMessagesMap(prev => ({ ...prev, [roomIdRef.current]: [] }));
                    messagesFetched.current = true;
                    currentPageRef.current = 0;
                    setIsInitialLoadComplete(true);
                    console.log('fetchChatHistory: Empty room, set empty messages');
                    return;
                }

                let messages: ChatMessage[] = [];
                const minMessages = 20;
                while (lastPage >= 0 && messages.length < minMessages) {
                    const resp = await axiosInstance.get(
                        `/api/v1/chat/rooms/${roomIdRef.current}/messages`,
                        { params: { page: lastPage, size: pageSize, userId, sort: 'timestamp,asc' } }
                    );

// 2. 로드된 메시지를 기반으로 실제 읽지 않은 메시지 수 계산
                    const actualUnreadCount = messages.reduce((count, msg) => {
                        if (String(msg.senderId) !== String(userId) && !msg.readBy.includes(userId)) {
                            return count + 1;
                        }
                        return count;
                    }, 0);

                    // 3. 보존된 값과 실제 값 중 더 큰 값을 최종 Badge 수로 결정
                    const finalUnreadCount = Math.max(actualUnreadCount, preservedUnreadCount);

                    // 4. 채팅방 목록 상태(Badge) 업데이트
                    if (updateChatRooms) {
                        updateChatRooms(rid, {
                            lastMessage: messages.length > 0 ? getLastMessageText(messages[messages.length - 1]) : (currentRoom?.lastMessage || ''),
                            unreadCount: finalUnreadCount,
                        });
                    }

                    if (resp.status === 200) {
                        const formatted: ChatMessage[] = resp.data.content.map((msg: any) => {
                            // 수정: unreadCount 계산 로직 - participantCountAtSend(나 제외)에서 나를 제외한 readBy 개수를 빼기
                            const readByExcludingSender = (msg.readBy || []).filter((id: any) => String(id) !== String(msg.senderId));
                            const calculatedUnreadCount = Math.max(0, (msg.participantCountAtSend || 0) - readByExcludingSender.length);

                            const base: ChatMessage = {
                                id: msg.id,
                                sender: msg.senderName || msg.sender,
                                content: msg.content,
                                timestamp: msg.timestamp,
                                roomId: msg.roomId,
                                senderId: msg.senderId,
                                readBy: msg.readBy || [],
                                attachmentType: msg.attachmentType,
                                attachmentUrl: msg.attachmentUrl,
                                attachmentName: msg.attachmentName,
                                isInviteMessage: msg.isInviteMessage || msg.content.includes('초대'),
                                isExitMessage: msg.isExitMessage || msg.content.includes('나갔습니다'),
                                isDateMessage: msg.isDateMessage || msg.content.match(/^\d{4}년 \d{1,2}월 \d{1,2}일/), // 🔥 추가
                                participantCountAtSend: msg.participantCountAtSend || 0,
                                unreadCount: calculatedUnreadCount, // 수정된 계산
                                canceled: msg.canceled || false,
                                deleted: msg.deleted || false,
                            };

                            if (String(base.senderId) === String(userId) && !base.readBy.includes(userId)) {
                                base.readBy.push(userId);
                            }
                            return base;
                        });
                        messages = [...formatted, ...messages];
                        lastPage--;
                    } else {
                        break;
                    }
                }

                currentPageRef.current = lastPage + 1;
                messagesFetched.current = true;
                setMessagesMap(prev => {
                    console.log(`fetchChatHistory: Loaded ${messages.length} messages for room ${roomIdRef.current}`);
                    return { ...prev, [roomIdRef.current]: messages };
                });
                setIsInitialLoadComplete(true);
            } else {
                const nextPage = currentPageRef.current;
                console.log(`fetchChatHistory: Fetching previous page=${nextPage} for room=${roomIdRef.current}`);
                if (nextPage < 0) {
                    console.log('fetchChatHistory: Reached invalid page, stopping');
                    messagesFetched.current = true;
                    return;
                }
                const resp = await axiosInstance.get(
                    `/api/v1/chat/rooms/${roomIdRef.current}/messages`,
                    { params: { page: nextPage, size: pageSize, userId, sort: 'timestamp,asc' } }
                );

                if (resp.status === 200) {
                    const formatted: ChatMessage[] = resp.data.content.map((msg: any) => {
                        // 수정: unreadCount 계산 로직 추가
                        const readByExcludingSender = (msg.readBy || []).filter((id: any) => String(id) !== String(msg.senderId));
                        const calculatedUnreadCount = Math.max(0, (msg.participantCountAtSend || 0) - readByExcludingSender.length);

                        const base: ChatMessage = {
                            id: msg.id,
                            sender: msg.senderName || msg.sender,
                            content: msg.content,
                            timestamp: msg.timestamp,
                            roomId: msg.roomId,
                            senderId: msg.senderId,
                            readBy: msg.readBy || [],
                            attachmentType: msg.attachmentType,
                            attachmentUrl: msg.attachmentUrl,
                            attachmentName: msg.attachmentName,
                            isInviteMessage: msg.isInviteMessage || msg.content.includes('초대'),
                            isExitMessage: msg.isExitMessage || msg.content.includes('나갔습니다'),
                            isDateMessage: msg.isDateMessage || msg.content.match(/^\d{4}년 \d{1,2}월 \d{1,2}일/),
                            participantCountAtSend: msg.participantCountAtSend || 0, // 추가
                            unreadCount: calculatedUnreadCount, // 수정된 계산
                            canceled: msg.canceled || false,
                            deleted: msg.deleted || false,
                        };

                        if (String(base.senderId) === String(userId) && !base.readBy.includes(userId)) {
                            base.readBy.push(userId);
                        }
                        return base;
                    });
                    setMessagesMap(prev => {
                        const existing = prev[roomIdRef.current] || [];
                        const messageIds = new Set(existing.map(m => m.id));
                        const newMessages = formatted.filter(msg => {
                            const isDuplicate = messageIds.has(msg.id);
                            if (isDuplicate) {
                                console.warn(`fetchChatHistory: Duplicate message ID ${msg.id} on page ${nextPage}`);
                            }
                            return !isDuplicate;
                        });
                        console.log(`fetchChatHistory: Adding ${newMessages.length} new messages for page=${nextPage}`, {
                            totalReceived: resp.data.content.length,
                            duplicates: resp.data.content.length - newMessages.length,
                        });
                        if (!newMessages.length && resp.data.content.length) {
                            console.warn(`fetchChatHistory: All ${resp.data.content.length} messages on page ${nextPage} were duplicates`);
                        }
                        return { ...prev, [roomIdRef.current]: [...newMessages, ...existing] };
                    });

                    if (!resp.data.content.length) {
                        console.log(`fetchChatHistory: No messages for page ${nextPage}, marking as fetched`);
                        messagesFetched.current = true;
                    }
                }
            }
        } catch (e: unknown) {
            // ... (error handling remains unchanged)
            setIsInitialLoadComplete(true); // Signal completion even on error
        }
    }, [token, markMessageAsRead, updateChatRooms]);

    const debouncedFetchChatHistory = debounce(fetchChatHistory, 100);

    // ─── 스크롤 맨 위에서 호출되는 함수 ───────────────────────────────────────
    // ─── loadMoreHistory: 오직 fetch만 호출 ─────────────────────────────────
    const loadMoreHistory = useCallback(async () => {
        const rid = roomIdRef.current;
        if (!rid || rid === 'main' || isFetchingRef.current) {
            console.log(`loadMoreHistory: skip (rid=${rid})`);
            return;
        }

        if (currentPageRef.current <= 0 || isFetchingRef.current) {
            console.log('loadMoreHistory: Stopping - reached page 0 or fetching:', {
                currentPage: currentPageRef.current,
                isFetching: isFetchingRef.current,
            });
            return;
        }
        isFetchingRef.current = true;

        try {
            const prevPage = currentPageRef.current;
            currentPageRef.current -= 1;
            console.log('loadMoreHistory: Fetching page:', {
                roomId: roomIdRef.current,
                page: currentPageRef.current,
                prevPage,
            });

            await debouncedFetchChatHistory();

            console.log('loadMoreHistory: Completed fetch for page:', {
                roomId: roomIdRef.current,
                page: currentPageRef.current,
                messagesCount: (messagesMap[roomIdRef.current] || []).length,
            });
        } catch (error) {
            console.error('loadMoreHistory: Error fetching history:', error);
            currentPageRef.current += 1; // Revert page on error
            throw error; // Propagate error to caller
        } finally {
            isFetchingRef.current = false;
        }
    }, [debouncedFetchChatHistory]);

    // ─── 방 전환 시 초기화 및 최초 로드 ───────────────────────────────────────
    useEffect(() => {
        setIsInitialLoadComplete(false);
        currentPageRef.current = -1;
        messagesFetched.current = false;
        hasLoadedHistoryRef.current = false;
        isInitialLoadDone.current = false;
        isFetchingRef.current = false;
        setMessagesMap(prev => ({ ...prev, [roomId]: [] }));
        fetchChatHistory();
    }, [roomId, token, currentUser, fetchChatHistory]);

    const isTabActive = useCallback(() => {
        return document.visibilityState === 'visible' && document.hasFocus();
    }, []);

    const isCurrentRoomFocused = useCallback((msgRoomId: string) => {
        return msgRoomId === roomIdRef.current && isTabActive();
    }, [isTabActive]);


    // 2) chatRooms 변화를 Ref에만 반영
    useEffect(() => {
        chatRoomsRef.current = chatRooms;
    }, [chatRooms]);

    const syncUnreadCountsWithServer = useCallback(async () => {
        try {
            const userId = currentUserRef.current.principal;

            // 1) unreadCount가 0 인 방과 현재 열려 있는 방은 스킵
            const targets = chatRoomsRef.current.filter(room => {
                if (!room.id) return false;
                if (String(room.id) === String(roomIdRef.current)) return false; // 현재 활성 방
                return (room.unreadCount ?? 0) > 0; // 뱃지가 남아있는 방만
            });

            if (!targets.length) return; // 서버 호출 필요 없음

            const promises = targets.map(async (room) => {
                try {
                    const response = await axiosInstance.get<{ unreadCount: number }>(
                        `/api/v1/chat/rooms/${room.id}/unread-count`,
                        { params: { userId } }
                    );
                    const serverUnreadCount = response.data.unreadCount || 0;
                    if (serverUnreadCount !== room.unreadCount) {
                        updateChatRooms?.(room.id, {
                            lastMessage: room.lastMessage || room.displayMessage || '새로운 채팅방',
                            displayMessage: room.lastMessage || room.displayMessage || '새로운 채팅방',
                            unreadCount: serverUnreadCount
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to sync unread count for room ${room.id}:`, error);
                }
            });
            await Promise.all(promises);
        } catch (error) {
            console.error('Error syncing unread counts:', error);
        }
    }, [updateChatRooms]);

    // 새로운 메시지를 수신했을 때의 처리 함수
    const handleNewMessage = (raw: any, messageRoomId: string) => {
        const validRoomId = raw.roomId ? String(raw.roomId) : messageRoomId;
        if (!validRoomId) {
            console.error('Invalid roomId in message:', raw);
            return;
        }

        // 삭제된 메시지 처리 (기존 로직 유지)
        if (raw.deleted) {
            console.log('Received deleted message via WebSocket:', raw.id);
            setMessagesMap(prev => {
                const roomMessages = prev[validRoomId] || [];
                const updated = roomMessages.map(msg =>
                    String(msg.id) === String(raw.id)
                        ? {
                            ...msg,
                            deleted: true,
                            content: raw.content || '메시지가 삭제되었습니다!',
                            attachmentType: undefined,
                            attachmentUrl: undefined,
                            attachmentName: undefined,
                        }
                        : msg
                );
                const indexToReset = updated.findIndex(msg => String(msg.id) === String(raw.id));
                if (listRef?.current && indexToReset !== -1) {
                    listRef.current.resetAfterIndex(indexToReset, true);
                }
                return { ...prev, [validRoomId]: updated };
            });
            return;
        }

        const userId = currentUserRef.current.principal;
        const isSelf = String(raw.senderId) === String(userId);
        const isActiveInThisRoom = messageRoomId === roomIdRef.current &&
            isActiveInRoom.current &&
            document.visibilityState === 'visible' &&
            roomIdRef.current !== '';

        const currentRoom = chatRoomsRef.current.find(r => String(r.id) === validRoomId);
        const totalParticipants = currentRoom?.participants?.length || 0;
        const readByCount = (raw.readBy || []).filter((id: any) => String(id) !== String(raw.senderId)).length;
        const calculatedUnread = Math.max(0, (totalParticipants - 1) - readByCount);

        const chatMessage: ChatMessage = {
            id: raw.id || raw._id,
            sender: raw.senderName || raw.sender || 'Unknown',
            content: raw.content || '',
            timestamp: raw.timestamp,
            roomId: validRoomId,
            senderId: raw.senderId,
            readBy: raw.readBy || [],
            attachmentType: raw.attachmentType,
            attachmentUrl: raw.attachmentUrl || (raw.attachmentType === 'image' ? '' : undefined),
            attachmentName: raw.attachmentName,
            isInviteMessage: raw.isInviteMessage || raw.content.includes('초대'),
            isExitMessage: raw.isExitMessage || raw.content.includes('나갔습니다'),
            isDateMessage: raw.isDateMessage || raw.content.match(/^\d{4}년 \d{1,2}월 \d{1,2}일/),
            deleted: false,
            participantCountAtSend: raw.participantCountAtSend || 0,
            unreadCount: calculatedUnread
        };

        console.log('handleNewMessage: Received message=', chatMessage);

        // 🔥 핵심 개선: 메시지 상태 및 채팅방 목록 업데이트를 위한 내부 함수
        const updateMessageStateAndChatRoom = (message: ChatMessage, forceUpdate = false) => {
            // 1) 메시지 맵 업데이트 (현재 방에 있을 때만)
            if (validRoomId === roomIdRef.current) {
                setMessagesMap(prev => {
                    const roomMsgs = prev[validRoomId] || [];
                    const existingMsg = roomMsgs.find(m => String(m.id) === String(message.id));

                    let updatedMsgs;
                    if (existingMsg) {
                        if (!forceUpdate && existingMsg.attachmentUrl === message.attachmentUrl) {
                            return prev;
                        }
                        updatedMsgs = roomMsgs.map(m =>
                            String(m.id) === String(message.id)
                                ? { ...m, ...message, unreadCount: message.unreadCount }
                                : m
                        );
                    } else {
                        const isDuplicate = roomMsgs.some(m => String(m.id) === String(message.id));
                        if (isDuplicate) {
                            console.log('Duplicate message detected, skipping:', message.id);
                            return prev;
                        }
                        updatedMsgs = [...roomMsgs, message];
                    }

                    if (listRef?.current) {
                        setTimeout(() => {
                            listRef.current?.resetAfterIndex(updatedMsgs.length - 1, true);
                        }, 0);
                    }
                    return { ...prev, [validRoomId]: updatedMsgs };
                });
            }

            // 2) 채팅방 목록 업데이트 로직 개선
            const displayMessage = getLastMessageText(message);
            const currentRoom = chatRoomsRef.current.find(r => String(r.id) === validRoomId);
            let newUnreadCount = currentRoom?.unreadCount || 0;

            if (!isSelf && !isActiveInThisRoom) {
                // 🔥 중복 방지: 아직 증가 안 한 메시지에 대해서만 +1
                if (!processedUnreadMessageIds.current.has(message.id)) {
                    newUnreadCount += 1;
                    processedUnreadMessageIds.current.add(message.id);
                }
            } else {
                // 활성 방이거나 내가 보낸 메시지는 0으로 리셋
                newUnreadCount = 0;
            }

            // ✅ 핵심 수정: 새로운 메시지는 항상 최신으로 간주
            const messageTimestamp = new Date(message.timestamp).getTime();

            console.log(`[${new Date().toISOString()}] Updating displayMessage for room ${validRoomId}:`, {
                newMessage: displayMessage,
                currentMessage: currentRoom?.lastMessage,
                messageTimestamp: new Date(message.timestamp).toISOString(),
                isCurrentRoom: validRoomId === roomIdRef.current
            });

            // ref 즉시 업데이트 - 새 메시지는 항상 최신으로 처리
            chatRoomsRef.current = chatRoomsRef.current.map(room => {
                if (String(room.id) === validRoomId) {
                    return {
                        ...room,
                        lastMessage: displayMessage,
                        displayMessage: displayMessage,
                        unreadCount: newUnreadCount,
                        lastActivity: new Date().toISOString(),
                        lastUpdated: messageTimestamp
                    };
                }
                return room;
            });

            // 외부 상태 업데이트 - 새 메시지는 항상 업데이트
            if (displayMessage.trim() !== '') {
                updateChatRooms?.(validRoomId, {
                    lastMessage: displayMessage,
                    unreadCount: newUnreadCount,
                    displayMessage
                });
            }

            // 3) 읽음 처리
            if (isActiveInThisRoom && !isSelf && !message.isInviteMessage && !message.isExitMessage && !message.isDateMessage) {
                setTimeout(() => {
                    markMessageAsRead(message.id, currentUserRef.current.principal, message.senderId).catch(console.error);
                }, 0);
            }
        };

        if (chatMessage.attachmentType === 'image' && !chatMessage.attachmentUrl) {
            // 이미지 메시지 처리
            updateMessageStateAndChatRoom(chatMessage, true);

            axiosInstance.get(`/api/v1/chat/rooms/${validRoomId}/messages/${chatMessage.id}`)
                .then(response => {
                    const updatedUrl = response.data.attachmentUrl;
                    if (updatedUrl) {
                        chatMessage.attachmentUrl = updatedUrl;
                        if (validRoomId === roomIdRef.current) {
                            setMessagesMap(prev => {
                                const roomMsgs = prev[validRoomId] || [];
                                const updated = roomMsgs.map(m =>
                                    String(m.id) === String(chatMessage.id)
                                        ? { ...m, attachmentUrl: updatedUrl }
                                        : m
                                );
                                return { ...prev, [validRoomId]: updated };
                            });
                        }
                    }
                })
                .catch(console.error);
        } else {
            updateMessageStateAndChatRoom(chatMessage);
        }
    };

    // 특정 방에 대한 구독 설정 (메시지, 읽음 상태, 참가자)
    function setupRoomSubscriptions(client: Client) {
        if (!roomId) return;

        // 메시지 구독 부분 수정
        const msgSub = client.subscribe(`/topic/chat/${roomId}`, (m: IMessage) => {
            try {
                const raw = JSON.parse(m.body);
                console.log('setupRoomSubscriptions: Received WebSocket message=', raw);

                if (raw.deleted) {
                    // 삭제된 메시지 처리 (기존 코드 유지)
                    setMessagesMap(prev => {
                        const roomMessages = prev[roomId] || [];
                        const updated = roomMessages.map(msg =>
                            String(msg.id) === String(raw.id)
                                ? {
                                    ...msg,
                                    deleted: true,
                                    content: raw.content || '메시지가 삭제되었습니다!',
                                    attachmentType: undefined,
                                    attachmentUrl: undefined,
                                    attachmentName: undefined,
                                }
                                : msg
                        );

                        const indexToReset = updated.findIndex(msg => String(msg.id) === String(raw.id));
                        if (listRef.current && indexToReset !== -1) {
                            listRef.current.resetAfterIndex(indexToReset, true);
                        }
                        return { ...prev, [roomId]: updated };
                    });
                    return;
                }

                const me = String(currentUserRef.current.principal);
                const isSelf = String(raw.senderId) === me;
                const isActiveInThisRoom = roomId === roomIdRef.current &&
                    isActiveInRoom.current &&
                    roomIdRef.current !== '';

                // 🔥 수정: 내가 보낸 메시지 처리
                if (isSelf) {
                    const correctUnreadCount = Math.max(0, raw.participantCountAtSend || 0);
                    setMessagesMap(prev => {
                        const msgs = prev[roomId] || [];

                        const optimisticIndex = msgs.findIndex(msg =>
                            msg.id?.startsWith('local-') &&
                            msg.content === raw.content &&
                            String(msg.senderId) === String(raw.senderId) &&
                            Math.abs(new Date(msg.timestamp).getTime() - new Date(raw.timestamp).getTime()) < 5000
                        );

                        if (optimisticIndex !== -1) {
                            const updated = [...msgs];
                            updated[optimisticIndex] = {
                                ...raw,
                                readBy: [me],
                                unreadCount: correctUnreadCount,
                                participantCountAtSend: raw.participantCountAtSend || 0,
                                isInviteMessage: raw.isInviteMessage || raw.content.includes('초대'),
                                isExitMessage: raw.isExitMessage || raw.content.includes('나갔습니다'),
                                isDateMessage: raw.isDateMessage || raw.content.match(/^\d{4}년 \d{1,2}월 \d{1,2}일/),
                            };

                            if (listRef?.current) {
                                setTimeout(() => {
                                    listRef.current?.resetAfterIndex(optimisticIndex, true);
                                }, 0);
                            }
                            return { ...prev, [roomId]: updated };
                        } else {
                            const existsById = msgs.some(msg => String(msg.id) === String(raw.id));
                            if (existsById) return prev;

                            const newMessage = {
                                ...raw,
                                readBy: [me],
                                unreadCount: correctUnreadCount,
                                participantCountAtSend: raw.participantCountAtSend || 0,
                                isInviteMessage: raw.isInviteMessage || raw.content.includes('초대'),
                                isExitMessage: raw.isExitMessage || raw.content.includes('나갔습니다'),
                                isDateMessage: raw.isDateMessage || raw.content.match(/^\d{4}년 \d{1,2}월 \d{1,2}일/),
                            };
                            const updatedMsgs = [...msgs, newMessage];

                            if (listRef?.current) {
                                setTimeout(() => {
                                    listRef.current?.resetAfterIndex(updatedMsgs.length - 1, true);
                                }, 0);
                            }
                            return { ...prev, [roomId]: updatedMsgs };
                        }
                    });

                    // 🔥 즉시 채팅방 목록 업데이트 (setTimeout 제거)
                    const displayMessage = getLastMessageText(raw);
                    if (displayMessage.trim() !== '') {
                        updateChatRooms?.(roomId, {
                            lastMessage: displayMessage,
                            displayMessage,
                            unreadCount: 0
                        });
                    }
                    return;
                }

                // 🔥 수정: 다른 사람이 보낸 메시지 처리 - 즉시 채팅방 목록 업데이트
                if (raw.attachmentType === 'image' && !raw.attachmentUrl) {
                    // 이미지 메시지의 경우 우선 lastMessage 설정
                    const displayMessage = getLastMessageText(raw);
                    if (displayMessage.trim() !== '') {
                        updateChatRooms?.(roomId, {
                            lastMessage: displayMessage,
                            displayMessage,
                            unreadCount: isActiveInThisRoom ? 0 : 1
                        });
                    }

                    axiosInstance.get(`/api/v1/chat/rooms/${roomId}/messages/${raw.id}`)
                        .then(response => {
                            raw.attachmentUrl = response.data.attachmentUrl;
                            handleNewMessage(raw, roomId);
                        })
                        .catch(err => {
                            console.error('Failed to fetch attachment URL:', err);
                            handleNewMessage(raw, roomId);
                        });
                } else {
                    handleNewMessage(raw, roomId);
                }
            } catch (e) {
                console.error('Error parsing msg:', e);
            }
        });
        msgSubRef.current = msgSub;

        // 2) '/topic/chat/{roomId}/read' 구독 (읽음 상태 업데이트)
        // 1. 읽음 상태 구독 수정 - lastMessage를 변경하지 않도록
        readSubRef.current = client.subscribe(
            `/topic/chat/${roomId}/read`,
            (m: IMessage) => {
                try {
                    const { messageId, userId: reader } = JSON.parse(m.body);
                    // 🔥 핵심 변경: 자기 자신(read by me)의 이벤트는 모두 무시
                    if (!messageId || !reader) return;
                    if (String(reader) === String(currentUserRef.current.principal)) {
                        return;
                    }

                    setMessagesMap(prev => {
                        const roomMsgs = prev[roomId] || [];
                        let hasChanged = false;

                        const updated = roomMsgs.map(msg => {
                            if (String(msg.id) !== String(messageId)) return msg;
                            if (msg.readBy?.includes(reader)) return msg; // Already read by this reader

                            hasChanged = true;
                            const newReadBy = Array.from(new Set([...(msg.readBy || []), reader]));
                            const readByExcludingSender = newReadBy.filter(id => String(id) !== String(msg.senderId));
                            const newUnreadCount = Math.max(0, (msg.participantCountAtSend || 0) - readByExcludingSender.length);
                            return { ...msg, readBy: newReadBy, unreadCount: newUnreadCount };
                        });

                        if (!hasChanged) {
                            return prev; // 변경사항 없으면 종료
                        }

                        // 현재 사용자의 총 안읽은 메시지 수 계산 - 수정된 부분
                        const totalUnreadForCurrentUser = updated.reduce((count, msg) => {
                            if (
                                String(msg.senderId) !== String(currentUserRef.current.principal) &&
                                !msg.readBy.includes(currentUserRef.current.principal)
                            ) {
                                return count + 1;
                            }
                            return count;
                        }, 0);

                        const currentRoomInRef = chatRoomsRef.current.find(r => String(r.id) === roomId);
                        // unreadCount가 실제로 변경되었을 때만 업데이트 실행
                        if (currentRoomInRef && currentRoomInRef.unreadCount !== totalUnreadForCurrentUser) {
                            // ✨ setTimeout으로 상태 업데이트를 지연시켜 렌더링 충돌 방지
                            setTimeout(() => {
                                console.log(`Read status update: Calling updateChatRooms for room ${roomId} with unreadCount: ${totalUnreadForCurrentUser}, preserving lastMessage: "${currentRoomInRef.lastMessage || ''}"`);
                                updateChatRooms?.(roomId, {
                                    lastMessage: currentRoomInRef.lastMessage || '', // ✨ lastMessage 보존
                                    unreadCount: totalUnreadForCurrentUser,
                                });
                            }, 0);
                        }

                        return { ...prev, [roomId]: updated };
                    });
                } catch (e) {
                    console.error('Error parsing read status:', e);
                }
            }
        );

        // 3) '/topic/chat/{roomId}/participants' 구독 (참가자 업데이트)
        const partSub = client.subscribe(`/topic/chat/${roomId}/participants`, (m: IMessage) => {
            try {
                const newParts: Employee[] = JSON.parse(m.body);
                handleParticipantsUpdate(newParts);
            } catch (e) {
                console.error('Error parsing participants:', e);
            }
        });
        partSubRef.current = partSub;

        const unreadSub = client.subscribe(
            `/topic/chat/${roomId}/unread-count`,
            (m: IMessage) => {
                // 🔥 추가: 현재 보고 있는 방이면 스킵
                if (String(roomId) === roomIdRef.current) {
                    return;
                }
                let body: any;
                try {
                    body = JSON.parse(m.body);
                    console.log('[unread-count payload]', body);
                } catch (e) {
                    console.error('Failed to parse unread-count payload', e, m.body);
                    return;
                }

                const me = String(currentUserRef.current.principal);
                const myRoomUnread = (body.unreadCounts || {})[me] ?? 0;
                const currentRoomInRef = chatRoomsRef.current.find(r => String(r.id) === roomId);

                // ✅ 핵심 수정: 다른 방에 있는 사용자도 displayMessage가 갱신되도록 개선
                let shouldUpdateLastMessage = false;
                let lastMsg = '';

                // 1. 서버에서 제공하는 최신 lastMessageContent가 있는 경우
                if (body.lastMessageContent && body.lastMessageContent.trim() !== '') {
                    const serverTimestamp = body.lastMessageTimestamp ? new Date(body.lastMessageTimestamp).getTime() : Date.now();
                    const currentTimestamp = currentRoomInRef?.lastUpdated || 0;

                    // ✅ 수정: 현재 방에 있지 않은 사용자는 항상 서버 메시지로 업데이트
                    const isCurrentlyInThisRoom = roomId === roomIdRef.current && isActiveInRoom.current;

                    if (!isCurrentlyInThisRoom) {
                        // 다른 방에 있는 경우: 항상 서버의 최신 메시지로 업데이트
                        lastMsg = body.lastMessageContent;
                        shouldUpdateLastMessage = true;
                        console.log(`[unread-count] User not in room ${roomId}, updating with server lastMessageContent: "${lastMsg}"`);
                    } else if (serverTimestamp > currentTimestamp) {
                        // 현재 방에 있지만 서버 메시지가 더 최신인 경우에만 업데이트
                        lastMsg = body.lastMessageContent;
                        shouldUpdateLastMessage = true;
                        console.log(`[unread-count] Using newer server lastMessageContent: "${lastMsg}"`);
                    } else {
                        console.log(`[unread-count] Server message is older, preserving current: "${currentRoomInRef?.lastMessage}"`);
                    }
                }

                // 2. 서버 데이터가 없거나 오래된 경우 현재 값 유지 (현재 방에 있는 경우만)
                if (!shouldUpdateLastMessage) {
                    const isCurrentlyInThisRoom = roomId === roomIdRef.current && isActiveInRoom.current;

                    if (isCurrentlyInThisRoom) {
                        // 현재 방에 있는 경우: 기존 lastMessage 보존
                        console.log(`[unread-count] Preserving current lastMessage for room ${roomId}: "${currentRoomInRef?.lastMessage}"`);
                        updateChatRooms?.(roomId, {
                            lastMessage: currentRoomInRef?.lastMessage || currentRoomInRef?.displayMessage || '새로운 채팅방',
                            unreadCount: myRoomUnread
                        });
                    } else {
                        // 다른 방에 있는 경우: unreadCount만 업데이트하고 lastMessage는 건드리지 않음
                        // (이 경우는 서버에서 lastMessageContent가 없는 상황이므로 기존 값 유지)
                        console.log(`[unread-count] User not in room ${roomId}, updating only unreadCount: ${myRoomUnread}`);
                        updateChatRooms?.(roomId, {
                            lastMessage: currentRoomInRef?.lastMessage || currentRoomInRef?.displayMessage || '새로운 채팅방',
                            unreadCount: myRoomUnread
                        });
                    }
                    return;
                }

                // 3. 새로운 서버 데이터로 업데이트
                console.log(`[unread-count] Updating room ${roomId} with new server data:`, {
                    lastMessage: lastMsg,
                    displayMessage: lastMsg,
                    unreadCount: myRoomUnread
                });

                // ✅ 핵심 수정: ref도 함께 업데이트하여 일관성 유지
                const messageTimestamp = body.lastMessageTimestamp ? new Date(body.lastMessageTimestamp).getTime() : Date.now();
                chatRoomsRef.current = chatRoomsRef.current.map(room => {
                    if (String(room.id) === roomId) {
                        return {
                            ...room,
                            lastMessage: lastMsg,
                            displayMessage: lastMsg,
                            unreadCount: myRoomUnread,
                            lastActivity: new Date().toISOString(),
                            lastUpdated: messageTimestamp
                        };
                    }
                    return room;
                });

                updateChatRooms?.(roomId, {
                    lastMessage: lastMsg,
                    displayMessage: lastMsg,
                    unreadCount: myRoomUnread
                });
            }
        );

        unreadSubRef.current = unreadSub;
    }

    // 모든 채팅방에 대한 전역 알림 구독 설정
    function setupGlobalNotifications(client: Client) {
        // 기존 구독 정리
        notificationSubsRef.current.forEach(sub => sub.unsubscribe());
        notificationSubsRef.current = [];

        chatRoomsRef.current.forEach(room => {
            if (!room.id) return;

            const sub = client.subscribe(`/topic/chat/${room.id}`, (m: IMessage) => {
                try {
                    const raw = JSON.parse(m.body);
                    const messageRoomId = String(raw.roomId || room.id);
                    const me = String(currentUserRef.current.principal);

                    if (raw.senderId === me) return;
                    if (messageRoomId === roomIdRef.current) return; // 현재 방은 setupRoomSubscriptions에서 처리

                    console.log(`[Global notification] Received message for room ${messageRoomId}:`, raw);

                    // ✅ 핵심 수정: 전역 알림에서도 handleNewMessage를 통해 일관된 처리
                    if (raw.attachmentType === 'image' && !raw.attachmentUrl) {
                        // 이미지 메시지의 경우 먼저 displayMessage 업데이트
                        const displayMessage = getLastMessageText(raw);
                        const currentRoom = chatRoomsRef.current.find(r => String(r.id) === messageRoomId);
                        const newUnreadCount = (currentRoom?.unreadCount || 0) + 1;
                        const messageTimestamp = new Date(raw.timestamp).getTime();

                        // ref 즉시 업데이트
                        chatRoomsRef.current = chatRoomsRef.current.map(room => {
                            if (String(room.id) === messageRoomId) {
                                return {
                                    ...room,
                                    lastMessage: displayMessage,
                                    displayMessage: displayMessage,
                                    unreadCount: newUnreadCount,
                                    lastActivity: new Date().toISOString(),
                                    lastUpdated: messageTimestamp
                                };
                            }
                            return room;
                        });

                        // 외부 상태 업데이트
                        if (displayMessage.trim() !== '') {
                            updateChatRooms?.(messageRoomId, {
                                lastMessage: displayMessage,
                                displayMessage,
                                unreadCount: newUnreadCount
                            });
                        }

                        // 이미지 URL 가져오기
                        axiosInstance.get(`/api/v1/chat/rooms/${messageRoomId}/messages/${raw.id}`)
                            .then(response => {
                                raw.attachmentUrl = response.data.attachmentUrl;
                                // 이미지 URL은 가져오지만 handleNewMessage는 호출하지 않음 (이미 업데이트 완료)
                            })
                            .catch(err => {
                                console.error('Failed to fetch attachment URL:', err);
                            });
                    } else {
                        // 일반 메시지의 경우 handleNewMessage 호출
                        handleNewMessage(raw, messageRoomId);
                    }

                    // 브라우저 푸시 알림 처리
                    if (Notification.permission === 'granted') {
                        if (notifiedMessageIds.has(raw.id)) return;
                        notifiedMessageIds.add(raw.id);

                        const roomInfo = chatRoomsRef.current.find(r => String(r.id) === messageRoomId);
                        const roomName = roomInfo?.displayName || room.displayName || '새 채팅';
                        const title = `${raw.senderName || raw.sender} (${roomName})`;

                        const content = raw.attachmentType === 'image' ? '📷 사진' :
                            raw.attachmentType ? '📄 파일' : raw.content;

                        notify(title, content, messageRoomId, raw.id || raw._id);
                    }
                } catch (e) {
                    console.error('Global notification error:', e);
                }
            });

            notificationSubsRef.current.push(sub);
        });

        const cleanupInterval = setInterval(() => {
            if (notifiedMessageIds.size > 1000) {
                notifiedMessageIds.clear();
            }
        }, 1000 * 60 * 60);

        return () => clearInterval(cleanupInterval);
    }

    useEffect(() => {
        const client = stompClientRef.current;
        if (client && client.connected) {
            // 기존 구독 해제
            notificationSubsRef.current.forEach(sub => sub.unsubscribe());
            notificationSubsRef.current = [];
            // 재구독
            setupGlobalNotifications(client);
        }
    }, [chatRooms]);

    // 메인 WebSocket 설정 및 구독 로직
    useEffect(() => {
        console.log('WS INIT:', { roomId, token, currentUser });
        if (!token || !currentUser) {
            setWsError('Missing token, user, or chat rooms');
            setConnectionStatus('error');
            return;
        }

        let client: Client;
        const key = connectionKey.current;

        const cleanup = () => {
            msgSubRef.current?.unsubscribe(); msgSubRef.current = null;
            readSubRef.current?.unsubscribe(); readSubRef.current = null;
            partSubRef.current?.unsubscribe(); partSubRef.current = null;
            unreadSubRef.current?.unsubscribe(); unreadSubRef.current = null;
            // 방 특정 구독만 정리하고 전역 알림은 그대로 유지
        };

        const init = async () => {
            let validToken = token;
            try { await axiosInstance.get('/api/v1/auth/verify-token'); }
            catch {
                const cookie = new Cookies();
                const nt = cookie.get('accessToken');
                if (nt) validToken = nt; else return window.location.href = '/auth/sign-in';
            }

            if (activeConnections.has(key)) {
                client = activeConnections.get(key)!;
                stompClientRef.current = client;
                if (client.connected) {
                    setConnectionStatus('connected');
                    cleanup();

                    // 방 특정 구독만 설정 (이미 전역 구독은 설정되어 있음)
                    if (roomId) {
                        setupRoomSubscriptions(client);
                    }

                    return;
                }
                activeConnections.delete(key);
            }

            setConnectionStatus('connecting');
            client = new Client({
                webSocketFactory: () => new SockJS(`${process.env.REACT_APP_API_URL || 'http://localhost:4040'}/ws`),
                connectHeaders: { Authorization: `Bearer ${validToken}` },
                debug: str => console.log('STOMP:', str),
                reconnectDelay: 5000,
                heartbeatIncoming: 4000,
                heartbeatOutgoing: 4000,
            });

            // 2. onConnect 핸들러에서 함수 호출
            client.onConnect = () => {
                setConnectionStatus('connected');
                setWsError(null);
                cleanup();

                if (roomId) {
                    setupRoomSubscriptions(client);
                }
                setupGlobalNotifications(client);

                // 서버와 Unread Count 동기화 로직 추가
                syncUnreadCountsWithServer(); // Now it's calling the function defined at the hook's top level
            };

            client.onStompError = frame => { console.error('STOMP error:', frame); setConnectionStatus('error'); setWsError(frame.headers['message'] || 'Stomp error'); };
            client.onWebSocketError = err => { console.error('WS error:', err); setConnectionStatus('error'); setWsError(err.message || 'WebSocket error'); };
            client.onWebSocketClose = () => { setConnectionStatus('disconnected'); activeConnections.delete(key); };

            stompClientRef.current = client;
            activeConnections.set(key, client);
            client.activate();
        };


        init();
        return () => {
            cleanup();
        };
    }, [roomId, token, currentUser?.principal]);

    const sendMessage = useCallback((content: string) => {
        const client = stompClientRef.current;
        const userId = currentUserRef.current.principal;
        const now = new Date().toISOString();

        if (!client || !client.connected || !currentUserRef.current) {
            setWsError('Cannot send message.');
            return;
        }

        // 현재 방의 총 참가자 수 (나 포함) - 수정된 부분
        const currentRoom = chatRoomsRef.current.find(r => String(r.id) === roomIdRef.current);
        const totalParticipants = currentRoom?.participants?.length || participantsRef.current.length || 1;

        // participantCountAtSend는 나를 제외한 참가자 수 (DB 저장 기준)
        const participantCountAtSend = Math.max(0, totalParticipants - 1);
        const unreadCountForOthers = participantCountAtSend; // 나를 제외한 사람들이 모두 안 읽음

        // 🔥 수정: 더 고유하고 식별 가능한 optimistic ID 생성
        const optimisticId = `local-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create optimistic message
        const optimistic: ChatMessage = {
            id: optimisticId,
            sender: currentUserRef.current.name,
            content,
            timestamp: now,
            roomId: roomIdRef.current,
            senderId: userId,
            readBy: [userId], // Only sender has read it
            deleted: false,
            participantCountAtSend: participantCountAtSend, // 나를 제외한 참가자 수
            unreadCount: unreadCountForOthers // 나를 제외한 사람들이 안 읽음
        };

        // 즉시 optimistic 메시지 추가
        setMessagesMap(prev => {
            const roomMsgs = prev[roomIdRef.current] || [];

            // 🔥 추가: 중복 방지 - 같은 내용의 optimistic 메시지가 이미 있는지 확인
            const hasSimilarOptimistic = roomMsgs.some(msg =>
                msg.id?.startsWith('local-') &&
                msg.content === content &&
                String(msg.senderId) === String(userId) &&
                Math.abs(new Date(msg.timestamp).getTime() - new Date(now).getTime()) < 1000 // 1초 이내
            );

            if (hasSimilarOptimistic) {
                console.log('Similar optimistic message already exists, skipping');
                return prev;
            }

            const updatedMsgs = [...roomMsgs, optimistic];

            // 🔥 추가: optimistic 메시지 추가 후 리스트 높이 재계산
            if (listRef?.current) {
                setTimeout(() => {
                    listRef.current?.resetAfterIndex(updatedMsgs.length - 1, true);
                }, 0);
            }

            return { ...prev, [roomIdRef.current]: updatedMsgs };
        });

        // Update room's unread count (sender doesn't count toward unread)
        if (updateChatRooms) {
            const display = getLastMessageText({ content, attachmentType: undefined } as any);
            updateChatRooms(roomIdRef.current, {
                lastMessage: display,
                unreadCount: 0
            });
        }

        // 서버로 메시지 전송
        client.publish({
            destination: '/app/chat.sendMessage',
            body: JSON.stringify({
                roomId: roomIdRef.current,
                sender: currentUserRef.current.name,
                senderName: currentUserRef.current.name,
                senderId: userId,
                content,
                timestamp: now,
                participantCountAtSend: participantCountAtSend // 나를 제외한 참가자 수 전달
            }),
            headers: { Authorization: `Bearer ${token}` },
        });
    }, [token]);

    const refreshMessages = useCallback(() => {
        // Reset pagination to ensure fetchChatHistory fetches the latest messages
        // and uses the "replace" logic, not "prepend older".
        currentPageRef.current = -1;

        // This flag might also need to be reset to ensure fetchChatHistory
        // doesn't think messages for this initial state are already fetched.
        // setIsInitialLoadComplete(false);

        fetchChatHistory();
    }, [fetchChatHistory]); // fetchChatHistory has its own dependencies (token, markMessageAsRead, updateChatRooms etc.)


    // Check room permission
    const checkRoomPermission = useCallback(async (targetRoomId: string): Promise<boolean> => {
        if (!targetRoomId) return false;  // 빈 문자열은 항상 권한 없음으로 처리
        try {
            await axiosInstance.get(`/api/v1/chat/rooms/${targetRoomId}/messages`, {
                params: { page: 0, size: 1 }
            });
            setHasPermission(true);
            return true;
        } catch (error: any) {
            if (error.response?.status === 403) {
                console.log(`No permission to access room ${targetRoomId}`);
                setHasPermission(false);
                return false;
            }
            throw error;
        }
    }, []);


    // Update room permission check on room change
    useEffect(() => {
        if (!roomId) {
            setHasPermission(false); // 빈 룸에 대한 권한은 항상 없음
            return;
        }

        const updatePermission = async () => {
            const hasAccess = await checkRoomPermission(roomId);
            setHasPermission(hasAccess);

            if (!hasAccess) {
                setMessagesMap(prev => ({ ...prev, [roomId]: [] }));
                messagesFetched.current = true;
                currentPageRef.current = 0;
                setIsInitialLoadComplete(true);
            }
        };

        updatePermission();
    }, [roomId, checkRoomPermission]);

    return { messages, setMessages, connectionStatus, wsError, sendMessage, refreshMessages, unreadCount,  loadMoreHistory,
        // 🔥 추가: 더 불러올 페이지가 남았는지 알려주는 함수
        hasMoreHistory: () => currentPageRef.current > 0,
        isInitialLoadComplete,
        hasPermission,
        setHasPermission,
    };
};

export default useChatWebSocket;