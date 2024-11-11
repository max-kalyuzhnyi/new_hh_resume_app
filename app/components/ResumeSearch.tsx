"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CLIENT_ID = process.env.NEXT_PUBLIC_HH_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_HH_REDIRECT_URI;

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('ru-RU');
}

function formatSalary(salary: any): string {
  if (!salary) return 'Не указана';
  return `${salary.amount?.toLocaleString('ru-RU') || ''} ${salary.currency || ''}`;
}

function formatExperience(experience: any): string {
  if (!experience?.months) return 'N/A';
  const years = Math.floor(experience.months / 12);
  const months = experience.months % 12;
  return `${years} лет ${months} месяцев`;
}

// Add new type
type SearchHistory = {
  timestamp: Date;
  searchText: string;
};

export default function ResumeSearch() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [accountType, setAccountType] = useState<'employer' | 'job_seeker' | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/user-data');
        if (response.ok) {
          const data = await response.json();
          setUserInfo(data);
          setAccessToken(data.access_token);
          setAccountType(data.is_employer ? 'employer' : 'job_seeker');
        } else if (response.status === 401) {
          setAccessToken(null);
          setUserInfo(null);
          setAccountType(null);
        } else {
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

  const handleSearch = async (mode: 'preview' | 'full') => {
    setIsLoading(true);
    setError(null);
    setHasSearched(mode === 'preview');

    if (!sheetUrl) {
      setError('Please enter a Google Sheet URL');
      setIsLoading(false);
      return;
    }

    // Add to search history if there's a search text
    if (searchText.trim()) {
      setSearchHistory(prev => {
        const newHistory = [{
          timestamp: new Date(),
          searchText: searchText.trim()
        }, ...prev].slice(0, 3);
        return newHistory;
      });
    }

    try {
      const queryParams = new URLSearchParams({
        mode,
        text: searchText,
        accessToken: accessToken || '',
        sheetUrl: encodeURIComponent(sheetUrl),
        totalLimit: '100'
      });

      const response = await fetch(`/api/search-resume?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (mode === 'preview') {
        setPreviewResults(data);
      } else {
        // Show success message and clear preview results
        alert(`Successfully wrote ${data.count} resumes to sheet`);
        setPreviewResults([]); // Clear preview results
        setHasSearched(false); // Reset hasSearched state
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setAccessToken(null);
    setUserInfo(null);
    setAccountType(null);
  };

  const handleValidateCompanies = async () => {
    if (!sheetUrl) {
      setError('Please enter a Google Sheet URL');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch('/api/validate-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl })
      });

      if (!response.ok) throw new Error('Validation failed');
      
      const data = await response.json();
      alert(`Validation completed!\nFound ${data.matchesFound} matches out of ${data.totalCompanies} companies.\nCheck the 'Company_Validation' sheet for details.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto">
      {accessToken ? (
        <div>
          {accountType === 'job_seeker' && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
              <p>Warning: Resume search requires an employer account. Please re-login with an employer account.</p>
            </div>
          )}

          <div className="mb-12 p-6 bg-gray-100 rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4">Step 1: Enter Google Sheet URL</h2>
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="Enter Google Sheet URL"
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Sheet should contain a column named &apos;Company&apos; with company names
              </p>
              <button
                onClick={handleValidateCompanies}
                disabled={isValidating || !sheetUrl}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition disabled:opacity-50"
              >
                {isValidating ? 'Validating...' : 'Validate Companies'}
              </button>
            </div>
          </div>
          
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Step 2: Search Resumes</h2>
            <div className="mb-4">
              <p className="text-gray-600 mb-2">
                Please input desired search criteria using AND/OR operators. Examples:
              </p>
              <p className="text-sm text-gray-500 mb-4">
                • Use quotes for exact phrases: &apos;внутренние коммуникации&apos;~3<br />
                • Combine with OR: &apos;внутренние коммуникации&apos;~3 OR &apos;компенсаций льгот&apos;~3<br />
                • The ~3 allows for slight variations in word order and form
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Search is performed across all resume sections (description, job experience, etc) for the last year
              </p>
            </div>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder='Example: "внутренние коммуникации"~3 OR "компенсаций льгот"~3 OR "hr директор"~3'
              className="w-full p-2 border rounded mb-4"
            />

            {searchHistory.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-gray-600">Recent:</span>
                {searchHistory.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => setSearchText(item.searchText)}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    {item.searchText}
                  </button>
                ))}
              </div>
            )}

            <div className="flex space-x-4">
              <button
                onClick={() => handleSearch('preview')}
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition"
                disabled={isLoading || !sheetUrl}
              >
                Preview
              </button>
              <button
                onClick={() => handleSearch('full')}
                className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 transition"
                disabled={isLoading || !sheetUrl}
              >
                Write to Sheet
              </button>
            </div>
          </div>
          
          {isLoading && <p className="text-lg font-semibold">Loading...</p>}
          {error && <p className="text-lg font-semibold text-red-500">{error}</p>}
          
          {!isLoading && (
            <>
              {previewResults.length === 0 && searchText && hasSearched ? (
                <div className="mb-8">
                  <p className="text-lg font-semibold text-gray-600">No matching resumes found</p>
                </div>
              ) : previewResults.length > 0 && (
                <div className="mb-8 overflow-x-auto">
                  <h2 className="text-2xl font-semibold mb-4">Результаты поиска</h2>
                  <table className="w-full border-collapse border min-w-max">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="border p-2">Должность</th>
                        <th className="border p-2">Возраст</th>
                        <th className="border p-2">Желаемая зарплата</th>
                        <th className="border p-2">Последний онлайн</th>
                        <th className="border p-2">Обновлено</th>
                        <th className="border p-2">Опыт работы</th>
                        <th className="border p-2">Последнее место работы</th>
                        <th className="border p-2">Город</th>
                        <th className="border p-2">Ссылка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResults.map((item) => {
                        const lastJob = item.experience?.[0] || {};
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="border p-2">{item.title || 'N/A'}</td>
                            <td className="border p-2">{item.age || 'N/A'}</td>
                            <td className="border p-2">{formatSalary(item.salary)}</td>
                            <td className="border p-2">{formatDate(item.last_visit)}</td>
                            <td className="border p-2">{formatDate(item.updated_at)}</td>
                            <td className="border p-2">{formatExperience(item.total_experience)}</td>
                            <td className="border p-2 max-w-md">
                              <div className="space-y-1">
                                <div><strong>Компания:</strong> {lastJob.company || 'N/A'}</div>
                                <div><strong>Должность:</strong> {lastJob.position || 'N/A'}</div>
                                <div><strong>Период:</strong> {formatDate(lastJob.start)} - {formatDate(lastJob.end)}</div>
                                <div className="text-sm">
                                  <strong>Описание:</strong>
                                  <div className="whitespace-pre-wrap">{lastJob.description || 'N/A'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="border p-2">{item.area?.name || 'N/A'}</td>
                            <td className="border p-2">
                              <a 
                                href={`https://hh.ru/resume/${item.id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700"
                              >
                                Открыть
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
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
    </div>
  );
}
