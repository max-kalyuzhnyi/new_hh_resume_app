"use client";

import { useState } from 'react';
import CompanyUploader from '../../components/CompanyUploader';

export default function Home() {
  const [searchText, setSearchText] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompaniesUpload = (uploadedCompanies: string[]) => {
    setCompanies(uploadedCompanies);
    console.log('Companies uploaded:', uploadedCompanies);
  };

  const handleSearch = async (mode: 'preview' | 'full') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/search-resume?mode=${mode}&text=${encodeURIComponent(searchText)}&companies=${encodeURIComponent(companies.join(','))}&totalLimit=100&limitPerCompany=3`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      if (mode === 'preview') {
        const data = await response.json();
        setPreviewResults(data);
      } else {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'vacancies.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">HH.ru Vacancy Search</h1>
      
      <div className="mb-12 p-6 bg-gray-100 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">Step 1: Upload Companies</h2>
        <CompanyUploader onUpload={handleCompaniesUpload} />
      </div>
      
      <div className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Step 2: Search Vacancies</h2>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Enter search terms"
          className="w-full p-2 border rounded mb-4"
        />
        <div className="flex space-x-4">
          <button
            onClick={() => handleSearch('preview')}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition"
            disabled={isLoading || companies.length === 0}
          >
            Search
          </button>
          <button
            onClick={() => handleSearch('full')}
            className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 transition"
            disabled={isLoading || companies.length === 0}
          >
            Download CSV
          </button>
        </div>
      </div>
      
      {isLoading && <p className="text-lg font-semibold">Loading...</p>}
      {error && <p className="text-lg font-semibold text-red-500">{error}</p>}
      
      {previewResults.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Preview Results</h2>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">ID</th>
                <th className="border p-2">Name</th>
                <th className="border p-2">Employer</th>
                <th className="border p-2">Contact Name</th>
                <th className="border p-2">Contact Email</th>
                <th className="border p-2">Contact Phone</th>
                <th className="border p-2">Response URL</th>
              </tr>
            </thead>
            <tbody>
              {previewResults.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="border p-2">{item.id}</td>
                  <td className="border p-2">{item.name}</td>
                  <td className="border p-2">{item.employer.name}</td>
                  <td className="border p-2">{item.contacts?.name || 'N/A'}</td>
                  <td className="border p-2">{item.contacts?.email || 'N/A'}</td>
                  <td className="border p-2">
                    {item.contacts?.phones?.[0] || item.phone || 'N/A'}
                  </td>
                  <td className="border p-2">
                    {item.response_url ? (
                      <a href={item.response_url} target="_blank" rel="noopener noreferrer">
                        Apply
                      </a>
                    ) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
