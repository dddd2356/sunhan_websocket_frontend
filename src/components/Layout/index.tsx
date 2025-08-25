import { useState } from "react";
import Header from "./Header";
import Sidebar from "../SideBar";

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    return (
        <div className="layout">
            <Header toggleSidebar={toggleSidebar} />
            <div className="content-container">
                <Sidebar isOpen={isSidebarOpen} />
                <div className="main-content">
                    {children}
                </div>
            </div>
            {/* 모바일 메뉴 토글 버튼 */}
            <button className="menu-toggle" onClick={toggleSidebar}>
                ☰
            </button>
        </div>
    );
};

export default Layout;