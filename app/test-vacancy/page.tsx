'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const VacancyContactTest = dynamic(() => import('../components/VacancyContactTest'), { ssr: false });

const CLIENT_ID = process.env.HH_CLIENT_ID;
const REDIRECT_URI = process.env.HH_REDIRECT_URI;

export default function TestVacancyPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have an access token in localStorage
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      setAccessToken(storedToken);
      return;
    }

    // Check if we're returning from the OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token');
    if (token) {
      console.log('Received access token:', token);
      setAccessToken(token);
      localStorage.setItem('accessToken', token);
      // Clear the URL parameters
      window.history.replaceState({}, document.title, "/test-vacancy");
    }

    const error = urlParams.get('error');
    if (error) {
      setError(`Authorization error: ${error}`);
    }
  }, []);

  const handleAuthorize = () => {
    const authUrl = `https://hh.ru/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = authUrl;
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    // Clear other relevant states if needed
    window.location.href = '/test-vacancy';
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">HH.ru Resume Fetcher</h1>
      
      {!accessToken ? (
        <div>
          <button
            onClick={handleAuthorize}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
          >
            Authorize with HH.ru
          </button>
        </div>
      ) : (
        <div>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition mb-4"
          >
            Logout
          </button>
          <VacancyContactTest accessToken={accessToken} />
        </div>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
}
