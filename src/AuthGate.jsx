import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import App from "./App.jsx";

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  const handleSignOut = () => supabase.auth.signOut();

  const handleGoogleSignIn = () => {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  };

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500" dir="rtl">
        טוען...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4" dir="rtl">
        <form onSubmit={handleSignIn} className="bg-white p-6 rounded-xl shadow-md w-full max-w-xs">
          <h1 className="font-bold text-lg mb-4 text-center">כניסה ללוח הפעילויות</h1>
          <input
            type="email"
            placeholder="אימייל"
            className="border p-2 mb-2 w-full rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="סיסמה"
            className="border p-2 mb-3 w-full rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
          <button type="submit" disabled={loading} className="bg-indigo-600 text-white w-full py-2 rounded disabled:opacity-60">
            {loading ? "מתחבר..." : "כניסה"}
          </button>

          <div className="flex items-center gap-2 my-3 text-xs text-gray-400">
            <div className="flex-1 border-t" />
            או
            <div className="flex-1 border-t" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="border w-full py-2 rounded flex items-center justify-center gap-2 hover:bg-gray-50"
          >
            <span>כניסה עם Google</span>
          </button>

          <div className="text-xs text-gray-500 mt-3 text-center">
            אין לך חשבון? פנה/י למי שמנהל/ת את המערכת כדי לקבל הזמנה.
          </div>
        </form>
      </div>
    );
  }

  return <App session={session} onSignOut={handleSignOut} />;
}
