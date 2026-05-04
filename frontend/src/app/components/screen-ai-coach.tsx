import { useState, useRef, useEffect } from 'react';
import { client } from '../../api/client';

export interface AICoachScreenProps {
  navigate: (screen: string) => void;
}

type Message = {
  id: string;
  sender: 'ai' | 'user';
  text: string;
};

export function AICoachScreen({ navigate }: AICoachScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-0',
      sender: 'ai',
      text: "Hey Alex! 👋 I've analyzed your week.\nYour focus peaks between 9-11 AM.\nWant me to protect that time tomorrow?",
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { id: `msg-${Date.now()}`, sender: 'user', text };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    const aiMessageId = `msg-${Date.now() + 1}`;
    setMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: '' }]);

    try {
      const response = await client.post('/ai/chat', { message: text });
      const reply = String(response.data?.reply ?? response.data?.message ?? response.data ?? '');
      setMessages(prev => prev.map(msg =>
        msg.id === aiMessageId ? { ...msg, text: reply || 'AI Coach coming soon!' } : msg
      ));
    } catch (error) {
      console.error('Streaming error:', error);
      alert('AI Coach coming soon!');
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, text: "AI Coach coming soon!" } 
          : msg
      ));
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickReply = (text: string) => {
    handleSend(text);
  };

  const quickReplies = [
    "Yes, do it",
    "Tell me more",
    "Show my stats",
    "Plan my week"
  ];

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#FAF6F2] font-sans relative">
      
      {/* HEADER */}
      <header className="w-full h-[64px] flex items-center justify-between px-4 sticky top-0 bg-[#FAF6F2]/90 backdrop-blur-md z-20 border-b border-[#EDE5DE]/50">
        <button 
          onClick={() => navigate('home')}
          className="w-10 h-10 flex items-center justify-center text-[#1A1210] hover:bg-[#EDE5DE]/50 rounded-full transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-[36px] h-[36px] rounded-full bg-[#F5E8E4] flex items-center justify-center shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_#B8472A_0%,_transparent_70%)] mix-blend-overlay"></div>
              <span className="text-[18px]">🧠</span>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[16px] font-bold text-[#1A1210] leading-none tracking-tight">AI Coach</span>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-[6px] h-[6px] rounded-full bg-[#1A7A4A] animate-pulse"></div>
                <span className="text-[11px] text-[#6B5C54] font-medium leading-none">Online</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Spacer to balance the header flexbox */}
        <div className="w-10 h-10"></div>
      </header>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4 flex flex-col gap-6">
        {messages.map((msg) => {
          const isAI = msg.sender === 'ai';
          return (
            <div key={msg.id} className={`w-full flex ${isAI ? 'justify-start' : 'justify-end'}`}>
              
              {isAI && (
                <div className="w-[24px] h-[24px] rounded-full bg-[#F5E8E4] flex items-center justify-center shadow-inner relative overflow-hidden shrink-0 mt-auto mb-1 mr-2">
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_#B8472A_0%,_transparent_70%)] mix-blend-overlay"></div>
                  <span className="text-[12px]">🧠</span>
                </div>
              )}
              
              <div 
                className={`max-w-[75%] px-[16px] py-[12px] whitespace-pre-wrap leading-[1.4] ${
                  isAI 
                    ? 'bg-white border border-[#EDE5DE] text-[#1A1210] rounded-[16px_16px_16px_4px] shadow-[0_2px_8px_rgba(26,18,16,0.04)]' 
                    : 'text-white rounded-[16px_16px_4px_16px] shadow-[0_2px_8px_rgba(184,71,42,0.18)]'
                }`}
                style={{
                  fontFamily: 'var(--font-sf-pro, system-ui)',
                  fontSize: '15px',
                  background: !isAI ? 'linear-gradient(160deg, var(--gloss-start, #D8694A) 0%, var(--accent-primary, #B8472A) 45%, var(--accent-hover, #A03D22) 100%)' : undefined,
                }}
              >
                {!isAI && (
                  <span
                    className="absolute top-0 left-0 w-full pointer-events-none rounded-[16px_16px_0_0]"
                    style={{
                      height: "50%",
                      background: "linear-gradient(270deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.00) 100%)",
                    }}
                  />
                )}
                <span className="relative z-10">{msg.text || (isTyping && isAI ? '•••' : '')}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* QUICK REPLIES */}
      {messages[messages.length - 1]?.sender === 'ai' && !isTyping && (
        <div className="w-full overflow-x-auto no-scrollbar pb-3 px-4 flex gap-2 shrink-0">
          {quickReplies.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickReply(reply)}
              className="whitespace-nowrap bg-white border border-[#EDE5DE] rounded-full px-4 py-2 text-[13px] font-semibold text-[#B8472A] hover:bg-[#FAF6F2] transition-colors shadow-sm active:scale-95"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* INPUT BAR */}
      <div className="w-full bg-white border-t border-[#EDE5DE] px-4 py-3 shrink-0 pb-[env(safe-area-inset-bottom,16px)]">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(inputText); }}
          className="flex items-center gap-3 w-full max-w-[390px] mx-auto"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask your coach..."
            className="flex-1 h-[44px] bg-[#F5E8E4] rounded-[24px] px-4 text-[15px] text-[#1A1210] placeholder:text-[#9C8880] focus:outline-none focus:ring-2 focus:ring-[#B8472A]/20 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0 relative overflow-hidden transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-[0_2px_6px_rgba(184,71,42,0.18)]"
            style={{
              background: 'linear-gradient(160deg, #D8694A 0%, #B8472A 45%, #A03D22 100%)',
            }}
          >
            <span
              className="absolute top-0 left-0 w-full pointer-events-none rounded-[18px_18px_0_0]"
              style={{
                height: "50%",
                background: "linear-gradient(270deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.00) 100%)",
              }}
            />
            <svg className="relative z-10" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </button>
        </form>
      </div>

    </div>
  );
}
