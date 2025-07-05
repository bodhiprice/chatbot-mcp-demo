import { Layout, Typography } from 'antd';
import ChatInterface from './components/ChatInterface';

const { Header, Content } = Layout;
const { Title } = Typography;

function App() {
  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <Header style={{ backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <Title level={3} style={{ margin: 0, lineHeight: '64px' }}>
          MCP Chatbot Demo
        </Title>
      </Header>
      <Content style={{ padding: '24px' }}>
        <ChatInterface />
      </Content>
    </Layout>
  );
}

export default App;
