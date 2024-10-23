"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const VacancyContactTest = dynamic(() => import('./components/VacancyContactTest'), { ssr: false });

const CLIENT_ID = 'PUPM3TF5H8G3NVSBQ0FL36CQ8F8M8KR54J1S5275OBAUM1KA7DR0T6CCL8F0IH3L';
const REDIRECT_URI = 'http://localhost:3000/api/oauth-callback';

interface ApiAction {
  id: string;
  name: string;
  limit: number;
  used: number;
  remaining: number;
}

interface ApiLimitInfo {
  rawData: any;
  message: string;
}

interface ApiActionInfo {
  id: string;
  serviceType: {
    id: string;
    name: string;
  };
  activatedAt: string;
  expiresAt: string;
  balance: {
    actual: number;
    initial: number;
  };
}

interface ApiLimitInfo {
  actions: ApiActionInfo[];
  message: string;
}

interface UserInfo {
  id: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  is_applicant: boolean;
  is_employer: boolean;
  email: string;
  // Add other fields as needed
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [apiLimit, setApiLimit] = useState<ApiLimitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('resume'); // 'resume' or 'vacancy'
  const [accountType, setAccountType] = useState<'employer' | 'job_seeker' | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    // Check if we have an access token in localStorage
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      setAccessToken(storedToken);
      fetchUserInfo(storedToken);
    }

    // Check if we're returning from the OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token');
    if (token) {
      console.log('Received access token:', token);
      setAccessToken(token);
      localStorage.setItem('accessToken', token);
      fetchUserInfo(token);
      // Clear the URL parameters
      window.history.replaceState({}, document.title, "/");
    }

    const error = urlParams.get('error');
    if (error) {
      setError(`Authorization error: ${error}`);
    }
  }, []);

  const fetchUserInfo = async (token: string) => {
    try {
      const response = await fetch('https://api.hh.ru/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }
      const data: UserInfo = await response.json();
      setUserInfo(data);
      setAccountType(data.is_employer ? 'employer' : 'job_seeker');
    } catch (error) {
      console.error('Error fetching user info:', error);
      setError('Failed to fetch user info');
    }
  };

  const handleAuthorize = () => {
    const authUrl = `https://hh.ru/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = authUrl;
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    setAccountType(null);
    setUserInfo(null);
    setApiLimit(null);
    setSheetUrl('');
    setError(null);
    // Remove this line to prevent page reload
    // window.location.href = '/';
  };

  const checkApiLimit = async () => {
    if (!accessToken) {
      setError('Please provide an access token.');
      return;
    }

    try {
      const response = await fetch(`/api/check-api-limit?accessToken=${accessToken}`);
      if (!response.ok) {
        throw new Error('Failed to check API limit');
      }
      const data = await response.json();
      setApiLimit(data);
      setError(null);
    } catch (error) {
      console.error('Error checking API limit:', error);
      setError(`Failed to check API limit: ${error.message}`);
    }
  };

  const handleWriteToSheet = async () => {
    if (!accessToken) {
      setError('You must be authorized to perform this action');
      return;
    }

    if (!sheetUrl) {
      setError('Please enter a Google Sheet URL');
      return;
    }

    setError(null);

    try {
      const response = await fetch('/api/write-to-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sheetUrl, accessToken }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to write to Google Sheet');
      }

      const data = await response.json();
      alert(data.message); // Or update state to show a success message
    } catch (error) {
      setError(error.message);
    }
  };

  const isResumeDisabled = activeTab === 'resume' && accountType === 'job_seeker';
  const isVacancyDisabled = activeTab === 'vacancy' && accountType === 'employer';

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">HH.ru Data Fetcher</h1>
      
      {accessToken ? (
        userInfo ? (
          <div className="mb-4 flex justify-between items-center">
            <div>
              <span className="mr-2">
                Logged in as: {userInfo.first_name} {userInfo.last_name} ({userInfo.is_employer ? 'Employer' : 'Job Seeker'})
              </span>
              <span className="mr-2">Email: {userInfo.email}</span>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
              >
                Logout
              </button>
            </div>
          </div>
        ) : (
          <span>Loading user information...</span>
        )
      ) : (
        <button
          onClick={handleAuthorize}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          Authorize with HH.ru
        </button>
      )}

      {accessToken && (
        <div>
          <div className="mb-4">
            <button
              onClick={() => setActiveTab('resume')}
              className={`px-4 py-2 mr-2 rounded ${activeTab === 'resume' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Resume Fetcher
            </button>
            <button
              onClick={() => setActiveTab('vacancy')}
              className={`px-4 py-2 rounded ${activeTab === 'vacancy' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Vacancy Fetcher
            </button>
          </div>

          {activeTab === 'resume' && accountType === 'job_seeker' && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
              <p>Warning: This algorithm will not work with a job seeker account. Please re-login with an employer account.</p>
            </div>
          )}

          {activeTab === 'vacancy' && accountType === 'employer' && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
              <p>Warning: This algorithm will not work with an employer account. Please re-login with a job seeker account.</p>
            </div>
          )}

          {activeTab === 'resume' && (
            <div>
              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="Enter Google Sheet URL"
                className="w-full p-2 border rounded mb-4"
                disabled={isResumeDisabled}
              />
              <button
                onClick={handleWriteToSheet}
                className={`bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-4 ${
                  isResumeDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isResumeDisabled}
              >
                Write to Google Sheet
              </button>
              <button
                onClick={checkApiLimit}
                className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition ${
                  isResumeDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isResumeDisabled}
              >
                Check API Limit
              </button>
            </div>
          )}

          {activeTab === 'vacancy' && (
            <VacancyContactTest 
              accessToken={accessToken} 
              disabled={isVacancyDisabled} 
            />
          )}
        </div>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}

      {apiLimit && activeTab === 'resume' && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="text-lg font-semibold mb-2">API Limit Information</h3>
          <p>{apiLimit.message}</p>
          {apiLimit.actions.map(action => (
            <div key={action.id} className="mt-2 border-t pt-2">
              <h4 className="font-semibold">{action.serviceType.name}</h4>
              <p>Service ID: {action.serviceType.id}</p>
              <p>Activated: {new Date(action.activatedAt).toLocaleString()}</p>
              <p>Expires: {new Date(action.expiresAt).toLocaleString()}</p>
              <p>Initial Balance: {action.balance.initial}</p>
              <p>Current Balance: {action.balance.actual}</p>
              <p>Used: {action.balance.initial - action.balance.actual}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
