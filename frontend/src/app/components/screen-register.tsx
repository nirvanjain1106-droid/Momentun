import React, { useState } from 'react';
import { PrimaryButton } from './atom-button-primary';
import { register } from '../../api/userApi';

export interface RegisterScreenProps {
  navigate: (screen: string) => void;
}

export function RegisterScreen({ navigate }: RegisterScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateForm = () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return false;
    }
    
    // Basic email validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return false;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }

    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!validateForm()) return;

    setLoading(true);

    try {
      await register({ name, email, password });
      navigate('onboarding');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#FAF6F2] px-4 font-sans py-8">
      
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="text-[#B8472A] text-[48px] font-bold leading-none mb-2 tracking-tighter" style={{ fontFamily: 'var(--font-sf-pro, system-ui)' }}>
          M
        </div>
        <h1 className="text-[28px] font-bold text-[#1A1210] mb-1">Momentum</h1>
        <p className="text-[13px] text-[#9C8880] text-center">AI-Powered Adaptive Scheduling</p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-[390px] bg-white border border-[#EDE5DE] rounded-[16px] p-4 shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
        <h2 className="text-[22px] font-bold text-[#1A1210] mb-1">Create account</h2>
        <p className="text-[14px] text-[#9C8880] mb-6">Start building momentum today</p>

        <form onSubmit={handleRegister} className="flex flex-col">
          <input
            type="text"
            placeholder="Full Name"
            className="w-full h-[52px] border border-[#EDE5DE] rounded-[12px] px-4 bg-white placeholder:text-[#9C8880] focus:outline-none focus:border-2 focus:border-[#B8472A] focus:ring-0 mb-4 transition-colors text-[15px] text-[#1A1210]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="email"
            placeholder="Email address"
            className="w-full h-[52px] border border-[#EDE5DE] rounded-[12px] px-4 bg-white placeholder:text-[#9C8880] focus:outline-none focus:border-2 focus:border-[#B8472A] focus:ring-0 mb-4 transition-colors text-[15px] text-[#1A1210]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          
          <input
            type="password"
            placeholder="Password"
            className="w-full h-[52px] border border-[#EDE5DE] rounded-[12px] px-4 bg-white placeholder:text-[#9C8880] focus:outline-none focus:border-2 focus:border-[#B8472A] focus:ring-0 mb-4 transition-colors text-[15px] text-[#1A1210]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="password"
            placeholder="Confirm Password"
            className="w-full h-[52px] border border-[#EDE5DE] rounded-[12px] px-4 bg-white placeholder:text-[#9C8880] focus:outline-none focus:border-2 focus:border-[#B8472A] focus:ring-0 mb-6 transition-colors text-[15px] text-[#1A1210]"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {error && (
            <div className="text-[#C0392B] text-[13px] mb-4 text-center bg-[#FDF2F1] p-3 rounded-lg border border-[#F5C2C0]">
              {error}
            </div>
          )}

          <PrimaryButton 
            label={loading ? "Creating Account..." : "Create Account"} 
            type="submit" 
            state={loading ? "disabled" : "default"} 
          />
        </form>
      </div>

      <div className="mt-8 text-center text-[14px] text-[#9C8880]">
        Already have an account?{' '}
        <button 
          type="button" 
          onClick={() => navigate('login')} 
          className="text-[#B8472A] font-semibold hover:underline focus:outline-none"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
