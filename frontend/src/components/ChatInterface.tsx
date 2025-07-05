import { useState } from 'react';
import { Card, Input, Button, Space, Avatar, Typography } from 'antd';
import { SendOutlined, StopOutlined, UserOutlined, LoadingOutlined } from '@ant-design/icons';
import { useSSE } from '../hooks/useSSE';

const { TextArea } = Input;
const { Text } = Typography;

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const { connect, disconnect } = useSSE();

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = inputValue;
    setInputValue('');
    setIsLoading(true);
    setCurrentResponse('');

    connect(messageToSend, {
      onText: (_, snapshot) => {
        setCurrentResponse(snapshot);
      },
      onError: (error) => {
        console.error('SSE Error:', error);
        setIsLoading(false);
        setCurrentResponse('');
        const errorMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: `Error: ${error}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      },
      onComplete: () => {
        setIsLoading(false);
        setCurrentResponse((finalResponse) => {
          const assistantMessage: Message = {
            id: Date.now().toString(),
            type: 'assistant',
            content: finalResponse,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          return '';
        });
      },
    });
  };

  const handleStop = () => {
    disconnect();
    setIsLoading(false);
    setCurrentResponse('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto', height: 'calc(100vh - 140px)' }}>
      <Card
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {messages.map((message) => (
            <div key={message.id}>
              {message.type === 'user' ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', maxWidth: '80%' }}>
                    <Card
                      size="small"
                      style={{
                        backgroundColor: '#1677ff',
                        color: 'white',
                        borderRadius: '18px',
                        border: 'none',
                      }}
                      styles={{ body: { padding: '8px 12px' } }}
                    >
                      <Text style={{ color: 'white' }}>{message.content}</Text>
                    </Card>
                    <Avatar size="small" icon={<UserOutlined />} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '100%' }}>
                    <Text>{message.content}</Text>
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '100%' }}>
                {currentResponse ? (
                  <Text>{currentResponse}</Text>
                ) : (
                  <Text>
                    <LoadingOutlined spin />{' '}
                  </Text>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            padding: '16px',
            backgroundColor: '#fafafa',
          }}
        >
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Reply to Claude..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ resize: 'none' }}
              disabled={isLoading}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              style={{ height: 'auto' }}
            />
            {isLoading && <Button icon={<StopOutlined />} onClick={handleStop} style={{ height: 'auto' }} />}
          </Space.Compact>
        </div>
      </Card>
    </div>
  );
}

export default ChatInterface;
