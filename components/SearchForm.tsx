import React, { useState, useRef } from 'react';
import styles from './TestHHAPI.module.css';
import CompanyInput from './CompanyInput';
import * as XLSX from 'xlsx';

const TestHHAPI: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [totalLimit, setTotalLimit] = useState('100');
  const [limitPerCompany, setLimitPerCompany] = useState('3');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        const companyList = jsonData.flat().filter(Boolean);
        setCompanies(companyList);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/test-hh?text=${encodeURIComponent(searchText)}&companies=${encodeURIComponent(companies.join(','))}&totalLimit=${totalLimit}&limitPerCompany=${limitPerCompany}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'vacancies.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputGroup}>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Enter search text"
          className={styles.input}
        />
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileUpload}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <button onClick={() => fileInputRef.current?.click()} className={styles.button}>
          Upload Companies (CSV/XLSX)
        </button>
      </div>
      
      {companies.length > 0 && (
        <div className={styles.companiesList}>
          Companies: {companies.join(', ')}
        </div>
      )}

      <div className={styles.customizationZone}>
        <div className={styles.inputGroup}>
          <label htmlFor="totalLimit">Total Limit:</label>
          <input
            id="totalLimit"
            type="number"
            value={totalLimit}
            onChange={(e) => setTotalLimit(e.target.value)}
            min="1"
            max="1000"
            className={styles.limitInput}
          />
        </div>
        <div className={styles.inputGroup}>
          <label htmlFor="limitPerCompany">Limit per Company:</label>
          <input
            id="limitPerCompany"
            type="number"
            value={limitPerCompany}
            onChange={(e) => setLimitPerCompany(e.target.value)}
            min="1"
            max="100"
            className={styles.limitInput}
          />
        </div>
      </div>

      <button onClick={handleSearch} disabled={isLoading} className={styles.button}>
        {isLoading ? 'Searching...' : 'Search and Download CSV'}
      </button>
      
      {error && <p className={styles.error}>{error}</p>}
      
      {isLoading && <p>Preparing CSV file...</p>}
    </div>
  );
};

export default TestHHAPI;
