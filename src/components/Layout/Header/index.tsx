// components/Layout/Header/Header.tsx

import './style.css';
import hospitalImage from './assets/images/hospital.png';

interface HeaderProps {
    toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
    return (
        <header className='header'>
            <div className='contents'>
                <div className='employment-sign-up-image'>
                    <img src={hospitalImage} alt="병원 이미지" className="hospital-image"/>
                    <span className='image-text'>병원 조직 관리 시스템</span>
                </div>
                <nav className='navigation'>
                    <ul>
                        <li>
                            소개
                        </li>
                        <li>
                            조직도
                        </li>
                    </ul>
                </nav>
            </div>
        </header>
    )
}

export default Header