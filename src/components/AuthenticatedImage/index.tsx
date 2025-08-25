import React, {useState, useEffect, memo} from 'react';
import axiosInstance from '../../views/Authentication/axiosInstance';
import defaultProfileImage from '../../components/SideBar/assets/images/profile.png'; // 경로 확인 필요

interface AuthenticatedImageProps {
    imagePath: string | null | undefined;
    altText: string;
    className?: string;
}

// 이미지 캐시 저장소
const imageCache = new Map<string, string>();
const loadingCache = new Set<string>();

const AuthenticatedImage: React.FC<AuthenticatedImageProps> = memo(({ imagePath, altText, className }) => {
    const [imageSrc, setImageSrc] = useState<string>(defaultProfileImage);

    useEffect(() => {
        if (!imagePath) {
            setImageSrc(defaultProfileImage);
            return;
        }

        // 캐시에서 이미지 확인
        if (imageCache.has(imagePath)) {
            setImageSrc(imageCache.get(imagePath)!);
            return;
        }

        // 이미 로딩 중인 이미지인지 확인
        if (loadingCache.has(imagePath)) {
            return;
        }

        loadingCache.add(imagePath);

        const fetchAndSetImage = async () => {
            try {
                const response = await axiosInstance.get(imagePath, {
                    responseType: 'blob',
                });

                const blob = new Blob([response.data], { type: response.headers['content-type'] });
                const objectUrl = URL.createObjectURL(blob);

                // 캐시에 저장
                imageCache.set(imagePath, objectUrl);
                setImageSrc(objectUrl);

            } catch (error) {
                console.error(`Authenticated image fetch failed for path: ${imagePath}`, error);
                setImageSrc(defaultProfileImage);
                imageCache.set(imagePath, defaultProfileImage);
            } finally {
                loadingCache.delete(imagePath);
            }
        };

        fetchAndSetImage();

        // 컴포넌트 언마운트 시 정리는 하지 않음 (캐시 유지)
    }, [imagePath]);

    return <img src={imageSrc} alt={altText} className={className} />;
});

AuthenticatedImage.displayName = 'AuthenticatedImage';

export default AuthenticatedImage;