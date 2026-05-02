import React, { useState } from 'react';
import { PrimaryButton } from './atom-button-primary';
import { login } from '../../api/userApi';

export interface LoginScreenProps {
  navigate: (screen: string) => void;
}

export function LoginScreen({ navigate }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate('home');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#FAF6F2] px-4 font-sans">
      
      {/* Header */}
      <div className="flex flex-col items-center mb-10">
        <div className="text-[#B8472A] text-[48px] font-bold leading-none mb-2 tracking-tighter" style={{ fontFamily: 'var(--font-sf-pro, system-ui)' }}>
          M
        </div>
        <h1 className="text-[28px] font-bold text-[#1A1210] mb-1">Momentum</h1>
        <p className="text-[13px] text-[#9C8880] text-center">AI-Powered Adaptive Scheduling</p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-[390px] bg-white border border-[#EDE5DE] rounded-[16px] p-4 shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
        <h2 className="text-[22px] font-bold text-[#1A1210] mb-1">Welcome back</h2>
        <p className="text-[14px] text-[#9C8880] mb-6">Sign in to continue</p>

        <form onSubmit={handleLogin} className="flex flex-col">
          <input
            type="email"
            placeholder="Email address"
            className="w-full h-[52px] border border-[#EDE5DE] rounded-[12px] px-4 bg-white placeholder:text-[#9C8880] focus:outline-none focus:border-2 focus:border-[#B8472A] focus:ring-0 mb-4 transition-colors text-[15px] text-[#1A1210]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          
          <input
            type="password"
            placeholder="Password"
            className="w-full h-[52px] border border-[#EDE5DE] rounded-[12px] px-4 bg-white placeholder:text-[#9C8880] focus:outline-none focus:border-2 focus:border-[#B8472A] focus:ring-0 mb-2 transition-colors text-[15px] text-[#1A1210]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="flex justify-end mb-6">
            <button type="button" className="text-[13px] text-[#B8472A] hover:underline font-medium focus:outline-none focus:underline">
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="text-[#C0392B] text-[13px] mb-4 text-center bg-[#FDF2F1] p-3 rounded-lg border border-[#F5C2C0]">
              {error}
            </div>
          )}

          <PrimaryButton 
            label={loading ? "Signing in..." : "Sign In"} 
            type="submit" 
            state={loading ? "disabled" : "default"} 
          />
        </form>

        <div className="flex items-center my-6">
          <div className="flex-1 h-[1px] bg-[#EDE5DE]"></div>
          <span className="px-3 text-[13px] text-[#9C8880]">or continue with</span>
          <div className="flex-1 h-[1px] bg-[#EDE5DE]"></div>
        </div>

        <button 
          type="button" 
          className="w-full h-[52px] flex items-center justify-center bg-white border border-[#EDE5DE] rounded-[12px] gap-3 hover:bg-[#FAF6F2] transition-colors focus:outline-none focus:border-2 focus:border-[#B8472A]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span className="text-[15px] font-medium text-[#1A1210]">Continue with Google</span>
        </button>
      </div>

      <div className="mt-8 text-center text-[14px] text-[#9C8880]">
        Don't have an account?{' '}
        <button 
          type="button" 
          onClick={() => navigate('register')} 
          className="text-[#B8472A] font-semibold hover:underline focus:outline-none"
        >
          Sign up
        </button>
      </div>
    </div>
  );
}
