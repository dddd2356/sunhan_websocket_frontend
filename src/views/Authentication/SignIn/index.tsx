import React, { ChangeEvent, KeyboardEvent, useRef, useState } from 'react'; // 필요한 React 훅들을 가져옵니다.
import './style.css'; // 스타일 시트를 불러옵니다.
import InputBox from "../../../components/InputBox"; // InputBox 컴포넌트를 가져옵니다.
import { useNavigate } from "react-router-dom"; // 페이지 이동을 위한 네비게이션 훅을 사용합니다.
import { SignInRequestDto } from "../../../apis/request/auth"; // 로그인 요청 DTO를 가져옵니다.
import { signInRequest, SNS_SIGN_IN_URL } from "../../../apis"; // 로그인 API와 SNS 로그인 URL을 가져옵니다.
import { ResponseBody } from "../../../types"; // API 응답 타입을 가져옵니다.
import { SignInResponseDto } from "../../../apis/response/auth"; // 로그인 응답 DTO를 가져옵니다.
import { ResponseCode } from "../../../types/enums"; // 응답 코드 Enum을 가져옵니다.
import { useCookies } from "react-cookie";
import {scheduleTokenRefresh} from "../Services/AuthService"; // 쿠키를 관리할 훅을 사용합니다.

export default function SignIn() {
    const idRef = useRef<HTMLInputElement | null>(null); // 아이디 입력 필드의 ref
    const passwordRef = useRef<HTMLInputElement | null>(null); // 비밀번호 입력 필드의 ref

    // 쿠키 설정을 위한 훅
    const [cookie, setCookie] = useCookies();

    // 상태 관리: 아이디, 비밀번호, 메시지
    const [id, setId] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [message, setMessage] = useState<string>('');

    const navigate = useNavigate(); // 페이지 이동을 위한 네비게이션 훅

    // 로그인 응답 처리 함수
    const signInResponse = (responseBody: ResponseBody<SignInResponseDto>) => {
        if (!responseBody) return;

        const { code } = responseBody;
        if (code === ResponseCode.VALIDATION_FAIL) alert('아이디와 비밀번호를 입력하세요.');
        if (code === ResponseCode.SIGN_IN_FAIL) setMessage('로그인 정보가 일치하지 않습니다.');
        if (code === ResponseCode.DATABASE_ERROR) alert('데이터베이스 오류입니다.');
        if (code !== ResponseCode.SUCCESS) return;

        const { token, refreshToken, expiresIn } = responseBody as SignInResponseDto;
        const now = new Date().getTime();
        const expires = new Date(now + expiresIn * 1000);
        const refreshExpires = new Date(now + 14 * 24 * 60 * 60 * 1000); // 14일

        setCookie('accessToken', token, {
            expires,
            path: '/',
            secure: window.location.protocol === 'https:',
            sameSite: window.location.protocol === 'https:' ? 'none' : 'lax'
        });

        setCookie('refreshToken', refreshToken, {
            expires: refreshExpires,
            path: '/',
            secure: window.location.protocol === 'https:',
            sameSite: window.location.protocol === 'https:' ? 'none' : 'lax'
        });

        scheduleTokenRefresh(refreshToken, expiresIn);
        navigate('/detail/main-page');
    };

    // 아이디 변경 처리 함수
    const onIdChangeHandler = (event: ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setId(value); // 입력된 값을 상태에 저장
        setMessage(''); // 메시지 초기화
    };

    // 비밀번호 변경 처리 함수
    const onPasswordChangeHandler = (event: ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setPassword(value); // 입력된 값을 상태에 저장
        setMessage(''); // 메시지 초기화
    };

    // 회원가입 버튼 클릭 시 페이지 이동
    const onSignUpButtonClickHandler = () => {
        navigate('/auth/sign-up');
    };

    // 로그인 버튼 클릭 시 로그인 처리
    const onSignInButtonClickHandler = () => {
        if (!id || !password) {
            alert('아이디와 비밀번호 모두 입력하세요.');
            return;
        }

        const requestBody: SignInRequestDto = { id, password };
        signInRequest(requestBody).then(signInResponse); // 로그인 API 호출
    };

    // SNS 로그인 버튼 클릭 시 해당 SNS 로그인 URL로 리다이렉트
    const onSnsSignInButtonClickHandler = (type: 'kakao' | 'naver') => {
        window.location.href = SNS_SIGN_IN_URL(type); // SNS 로그인 URL로 리다이렉트
    };

    // 엔터키로 비밀번호 입력으로 포커스 이동
    const onIdKeyDownHandler = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        if (!passwordRef.current) return;
        passwordRef.current.focus(); // 비밀번호 입력 필드로 포커스 이동
    };

    // 엔터키 입력시 로그인
    const onPasswordKeyDownHandler = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            onSignInButtonClickHandler();
        }
    };

    return (
        <div id='sign-in-wrapper'>
            <div className='sign-in-container'>
                <div className='sign-in-box'>
                    <div className='sign-in-title'>{'병원 조직관리 서비스'}</div>
                    <div className='sign-in-content-box'>
                        <div className='sign-in-content-input-box'>
                            <InputBox
                                ref={idRef}
                                title='아이디'
                                placeholder='아이디를 입력해주세요'
                                type='text'
                                value={id}
                                onChange={onIdChangeHandler}
                                onKeyDown={onIdKeyDownHandler}
                            />
                            <InputBox
                                ref={passwordRef}
                                title='비밀번호'
                                placeholder='비밀번호를 입력해주세요'
                                type='password'
                                value={password}
                                onChange={onPasswordChangeHandler}
                                isErrorMessage
                                message={message}
                                onKeyDown={onPasswordKeyDownHandler}
                            />
                        </div>
                        <div className='sign-in-content-button-box'>
                            <div className='primary-button-lg full-width' onClick={onSignInButtonClickHandler}>{'로그인'}</div>
                            <div className='text-link-lg full-width' onClick={onSignUpButtonClickHandler}>{'회원가입'}</div>
                        </div>
                        <div className='sign-in-content-divider'></div>
                        <div className='sign-in-content-sns-sign-in-box'>
                            <div className='sign-in-content-sns-sign-in-title'>{'SNS 로그인'}</div>
                            <div className='sign-in-content-sns-sign-in-button-box'>
                                <div className='kakao-sign-in-button' onClick={() => onSnsSignInButtonClickHandler('kakao')}></div>
                                <div className='naver-sign-in-button' onClick={() => onSnsSignInButtonClickHandler('naver')}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className='sign-in-image'></div>
        </div>
    );
}
