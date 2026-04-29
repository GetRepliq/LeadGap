"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState(null);
  const router = useRouter();

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });
        if (error) throw error;
        setMessage("Success! Check your email for the confirmation link (if enabled) or try logging in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/webapp"); // Redirect to the agent page on success
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center p-6"
      style={{
        background: "#0a0a0a",
        color: "rgba(255, 255, 255, 0.7)",
        fontFamily: "var(--font-jetbrains-mono), 'Courier New', monospace",
        letterSpacing: "-0.025em",
      }}
    >
      <div className="w-full max-w-[400px] space-y-8">
        {/* Logo/Icon */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div style={{ color: "rgba(255, 255, 255, 0.45)" }}>
            <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
              <rect x="27" y="4" width="10" height="56" rx="2" fill="currentColor" />
              <rect x="4" y="27" width="56" height="10" rx="3" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-2xl text-white font-medium">
            {isSignUp ? "Create Account" : "Access Terminal"}
          </h1>
          <p className="text-xs opacity-50">
            {isSignUp ? "Join the lead gap intelligence network" : "Secure agent authentication required"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase opacity-40 pl-2">Full Name</label>
              <input
                type="text"
                placeholder="Dean Winchester"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-2 outline-none focus:border-white/50 text-white transition-colors"
                required={isSignUp}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-40 pl-2">Email Address</label>
            <input
              type="email"
              placeholder="agent@leadgap.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border border-white/20 px-4 py-2 outline-none focus:border-white/50 text-white transition-colors"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-40 pl-2">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border border-white/20 px-4 py-2 outline-none focus:border-white/50 text-white transition-colors"
              required
            />
          </div>

          {message && (
            <p className={`text-xs p-3 border ${message.startsWith('Error') ? 'border-red-500/30 text-red-400' : 'border-blue-500/30 text-blue-400'}`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-2 font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : isSignUp ? "Sign up" : "Establish Link (Sign Up)"}
          </button>
        </form>

        <div className="text-center pt-4">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs opacity-40 hover:opacity-100 transition-opacity"
          >
            {isSignUp ? "Already registered? Login here" : "Need access? Request identity creation"}
          </button>
        </div>

        <div className="pt-8 text-[10px] opacity-20 text-center uppercase tracking-[0.2em]">
          &gt; System Security v4.0.2 | LeadGap Core
        </div>
      </div>
    </div>
  );
}
