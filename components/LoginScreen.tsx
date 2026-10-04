
import React, { useState } from 'react';
import type { SignInIdentity } from '../services/authService';

interface Props {
  onLogin: (identity: SignInIdentity) => void;
  isLoading: boolean;
}

const LoginScreen: React.FC<Props> = ({ onLogin, isLoading }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Email is what the saved resume/history/profile are keyed by, so it is required.
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailLooksValid && !isLoading;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onLogin({ name, email });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white p-12 shadow-xl border border-gray-100 flex flex-col items-center">
        <div className="bg-black text-white font-bold px-4 py-2 text-xl mb-8">JM</div>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Jerry Maguire</h1>
        <p className="text-gray-500 mb-10">AI-Powered ATS Optimization &amp; Version Control</p>

        <form onSubmit={submit} className="w-full space-y-4 text-left">
          <div>
            <label htmlFor="login-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              Your name
            </label>
            <input
              id="login-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label htmlFor="login-email" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              Your email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com"
              autoComplete="email"
              required
              className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black"
            />
            <p className="mt-2 text-xs text-gray-400">
              Your resume and history are saved against this email, in this browser.
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-3 bg-black text-white font-bold py-4 px-6 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="uber-loader border-gray-500 border-t-white"></div>
            ) : (
              <span>Continue</span>
            )}
          </button>
        </form>

        <p className="mt-8 text-xs text-gray-400 uppercase tracking-widest">
          Private • Saved on this device
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
