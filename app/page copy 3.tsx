"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Use the same names as in the oauth-callback route, but with NEXT_PUBLIC_ prefix
const CLIENT_ID = process.env.NEXT_PUBLIC_HH_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_HH_REDIRECT_URI;

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
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
    if (!CLIENT_ID || !REDIRECT_URI) {
      console.error('Client ID or Redirect URI is not set');
      alert('Configuration error. Please check the console and contact the administrator.');
      return;
    }
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
    if (!accessToken || !userInfo) {
      setError('You must be authorized to check API limit');
      return;
    }

    setError(null);
    setApiLimit(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/check-api-limit?accessToken=${accessToken}&managerId=${userInfo.id}`);
      if (!response.ok) {
        throw new Error('Failed to check API limit');
      }
      const data = await response.json();
      setApiLimit(data);
      setError(null);
    } catch (error) {
      console.error('Error checking API limit:', error);
      setError(`Failed to check API limit: ${error.message}`);
    } finally {
      setIsLoading(false);
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
    setSuccessMessage('');
    setIsLoading(true);

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
      setSuccessMessage('Google Sheet updated successfully');
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
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

          {activeTab === 'resume' && (
            <div>
              <h2 className="text-xl font-bold mb-2">Resume Fetcher</h2>
              <p className="mb-4">
                This tool fetches resume data from HH.ru based on the information in your Google Sheet.
              </p>
              <h3 className="text-lg font-semibold mb-2">Input Requirements:</h3>
              <ul className="list-disc list-inside mb-4">
                <li>Worksheet name: "Resume"</li>
                <li>Required columns:
                  <ul className="list-disc list-inside ml-4">
                    <li>Company name</li>
                    <li>INN</li>
                    <li>Link to resume</li>
                  </ul>
                </li>
              </ul>
              <h3 className="text-lg font-semibold mb-2">Output:</h3>
              <p className="mb-4">
                The tool will update the existing rows in your sheet with the following information:
              </p>
              <ul className="list-disc list-inside mb-4">
                <li>Full name</li>
                <li>Current title</li>
                <li>Phone</li>
                <li>Email</li>
              </ul>

              {accountType === 'job_seeker' && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
                  <p>Warning: This algorithm will not work with a job seeker account. Please re-login with an employer account.</p>
                </div>
              )}

              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="Enter Google Sheet URL"
                className="w-full p-2 border rounded mb-4"
                disabled={isResumeDisabled || isLoading}
              />
              <button
                onClick={handleWriteToSheet}
                className={`bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-4 ${
                  isResumeDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isResumeDisabled || isLoading}
              >
                {isLoading ? 'Updating...' : 'Write to Google Sheet'}
              </button>
              <button
                onClick={checkApiLimit}
                className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition ${
                  isResumeDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isResumeDisabled || isLoading}
              >
                Check API Limit
              </button>

              {isLoading && (
                <div className="mt-4 text-center">
                  <p className="text-lg font-semibold">Loading...</p>
                  <p className="text-sm text-gray-500">This may take a few moments</p>
                </div>
              )}

              {successMessage && (
                <div className="mt-4 p-4 bg-green-100 text-green-700 rounded">
                  {successMessage}
                </div>
              )}
            </div>
          )}

          {activeTab === 'vacancy' && (
            <div>
              <h2 className="text-xl font-bold mb-2">Vacancy Fetcher</h2>
              <p className="mb-4">
                This tool fetches vacancy data from HH.ru based on the information in your Google Sheet.
              </p>
              <h3 className="text-lg font-semibold mb-2">Input Requirements:</h3>
              <ul className="list-disc list-inside mb-4">
                <li>Worksheet name: "Vacancy"</li>
                <li>Required columns:
                  <ul className="list-disc list-inside ml-4">
                    <li>Company name</li>
                    <li>INN</li>
                    <li>Link to vacancy</li>
                  </ul>
                </li>
              </ul>
              <h3 className="text-lg font-semibold mb-2">Output:</h3>
              <p className="mb-4">
                The tool will create a new worksheet named "Vacancies_output" with the following columns:
              </p>
              <ul className="list-disc list-inside mb-4">
                <li>Company name</li>
                <li>INN</li>
                <li>Full name (of the contact person)</li>
                <li>Email</li>
                <li>Phone</li>
                <li>Phone Comment</li>
                <li>Individual Vacancy Link</li>
                <li>API Response (raw data from HH.ru API)</li>
              </ul>

              {accountType === 'employer' && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
                  <p>Warning: This algorithm will not work with an employer account. Please re-login with a job seeker account.</p>
                </div>
              )}

              <VacancyContactTest 
                accessToken={accessToken} 
                disabled={isVacancyDisabled} 
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}

      {apiLimit && activeTab === 'resume' && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="text-lg font-semibold mb-2">API Limit Information</h3>
          <p>{apiLimit.message}</p>
          <h4 className="font-semibold mt-4">Employer Actions:</h4>
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
          {apiLimit.managerActions ? (
            <>
              <h4 className="font-semibold mt-4">Manager Actions:</h4>
              {apiLimit.managerActions.map(action => (
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
            </>
          ) : (
            <p className="mt-4 text-yellow-600">Manager-specific data is not available.</p>
          )}
        </div>
      )}
    </div>
  );
}
