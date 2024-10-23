'use client';

import React, { useState } from 'react';

interface VacancyContactTestProps {
  accessToken: string;
  disabled: boolean;
}

const VacancyContactTest: React.FC<VacancyContactTestProps> = ({ accessToken, disabled }) => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [vacancyLimit, setVacancyLimit] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/process-vacancy-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ sheetUrl, vacancyLimit }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process vacancy data');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4">
      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label htmlFor="sheetUrl" className="block mb-1">Google Sheet URL:</label>
          <input
            type="text"
            id="sheetUrl"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            required
          />
        </div>
        <div className="mb-2">
          <label htmlFor="vacancyLimit" className="block mb-1">
            Vacancy Limit per Company (1-20):
          </label>
          <input
            type="number"
            id="vacancyLimit"
            value={vacancyLimit}
            onChange={(e) => setVacancyLimit(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 20))}
            className="w-full p-2 border rounded"
            min="1"
            max="20"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Maximum number of vacancies to scrape per company (up to 20)
          </p>
        </div>
        <button
          type="submit"
          className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition ${
            disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={disabled || isLoading}
        >
          {isLoading ? 'Fetching...' : 'Fetch Vacancies'}
        </button>
      </form>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-lg font-semibold">Loading...</p>
          <p className="text-sm text-gray-500">This may take a few moments</p>
        </div>
      )}

      {error && <div className="text-red-500 mb-4">{error}</div>}

      {result && (
        <div className="mt-4">
          <h2 className="text-xl font-bold mb-2">Result:</h2>
          
          <div className="mb-4">
            <p>{result.message}</p>
          </div>

          {result && result.updatedRows && (
            <div className="mt-4">
              <h3 className="font-semibold">Processed Vacancies:</h3>
              <table className="min-w-full bg-white">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Company</th>
                    <th className="px-4 py-2">Full Name</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {result.updatedRows.map((row, index) => (
                    <tr key={index}>
                      <td className="border px-4 py-2">{row.companyName}</td>
                      <td className="border px-4 py-2">{row.fullName}</td>
                      <td className="border px-4 py-2">{row.email}</td>
                      <td className="border px-4 py-2">{row.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VacancyContactTest;
