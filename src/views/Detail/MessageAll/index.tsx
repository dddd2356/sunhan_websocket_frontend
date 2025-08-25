import React from 'react';
import MessageSender from '../../../components/MessageSender';
import './style.css';
import Layout from "../../../components/Layout";


const MessageAll: React.FC = () => {

    return (
        <Layout>
            <div className="fullscreen-container">
                <div className="form-container">
                    <MessageSender selectedSendType={"ALL"}/>
                </div>
            </div>
        </Layout>
);
};

export default MessageAll;
