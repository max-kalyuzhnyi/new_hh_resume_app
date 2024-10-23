"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VacancyContactTest from './components/VacancyContactTest';  // Add this import

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
  const [actionLoading, setActionLoading] = useState(false);
  const [apiLimitLoading, setApiLimitLoading] = useState(false);  // New state for API limit check
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkAuthStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/user-data');
        if (response.ok) {
          const data = await response.json();
          setUserInfo(data);
          // Store the actual access token
          setAccessToken(data.access_token);
          setAccountType(data.is_employer ? 'employer' : 'job_seeker');
        } else if (response.status === 401) {
          // Not authenticated
          setAccessToken(null);
          setUserInfo(null);
          setAccountType(null);
        } else {
          // Other error
          console.error('Error fetching user data:', await response.text());
        }
      } catch (error: unknown) {
        console.error('Error checking auth status:', 
          error instanceof Error ? error.message : 'Unknown error'
        );
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const handleAuthorize = () => {
    if (!CLIENT_ID || !REDIRECT_URI) {
      console.error('Client ID or Redirect URI is not set');
      alert('Configuration error. Please check the console and contact the administrator.');
      return;
    }
    const authUrl = `https://hh.ru/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = authUrl;
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setAccessToken(null);
      setUserInfo(null);
      setAccountType(null);
      setApiLimit(null);
      setSheetUrl('');
      setError(null);
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const checkApiLimit = async () => {
    if (!accessToken || !userInfo) {
      setMessage({ type: 'error', text: 'You must be authorized to check API limit' });
      return;
    }

    setMessage(null);
    setApiLimit(null);
    setApiLimitLoading(true);  // Use the new loading state

    try {
      const response = await fetch(`/api/check-api-limit?accessToken=${accessToken}&managerId=${userInfo.id}`);
      if (!response.ok) {
        throw new Error('Failed to check API limit');
      }
      const data = await response.json();
      setApiLimit(data);
      setMessage({ type: 'success', text: 'API limit checked successfully' });
    } catch (error: unknown) {
      console.error('Error checking API limit:', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      setMessage({ 
        type: 'error', 
        text: `Failed to check API limit: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setApiLimitLoading(false);  // Reset the new loading state
    }
  };

  const handleWriteToSheet = async () => {
    if (!accessToken) {
      setMessage({ type: 'error', text: 'You must be authorized to perform this action' });
      return;
    }

    if (!sheetUrl) {
      setMessage({ type: 'error', text: 'Please enter a Google Sheet URL' });
      return;
    }

    setMessage(null);
    setActionLoading(true);

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

      await response.json();
      setMessage({ type: 'success', text: 'Google Sheet updated successfully' });
    } catch (error: unknown) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const isResumeDisabled = activeTab === 'resume' && accountType === 'job_seeker';
  const isVacancyDisabled = activeTab === 'vacancy' && accountType === 'employer';

  // Add this function to handle tab changes
  const handleTabChange = (tab: 'resume' | 'vacancy') => {
    setActiveTab(tab);
    setMessage(null); // Clear the message when changing tabs
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">HH.ru Data Fetcher</h1>
      
      {accessToken ? (
        <div>
          <div className="mb-4 flex justify-between items-center">
            <div>
              <span className="mr-2">
                Logged in as: {userInfo?.first_name} {userInfo?.last_name} ({accountType === 'employer' ? 'Employer' : 'Job Seeker'})
              </span>
              <span className="mr-2">Email: {userInfo?.email}</span>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="mb-4">
            <button
              onClick={() => handleTabChange('resume')}
              className={`px-4 py-2 mr-2 rounded ${activeTab === 'resume' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Resume Fetcher
            </button>
            <button
              onClick={() => handleTabChange('vacancy')}
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
                <li>Worksheet name: &aposResume&apos</li>
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
                disabled={isResumeDisabled || actionLoading}
              />
              <button
                onClick={handleWriteToSheet}
                className={`bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-4 ${
                  isResumeDisabled || actionLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isResumeDisabled || actionLoading}
              >
                {actionLoading ? 'Updating...' : 'Write to Google Sheet'}
              </button>
              <button
                onClick={checkApiLimit}
                className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition ${
                  isResumeDisabled || apiLimitLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isResumeDisabled || apiLimitLoading}
              >
                {apiLimitLoading ? 'Checking...' : 'Check API Limit'}
              </button>
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
                <li>Worksheet name: &aposVacancy&apos</li>
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
                The tool will create a new worksheet named &aposVacancies_output&apos with the following columns:
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
      ) : (
        <button
          onClick={handleAuthorize}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          Authorize with HH.ru
        </button>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}
      {message && (
        <div className={`mt-4 p-4 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} rounded`}>
          {message.text}
        </div>
      )}

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
