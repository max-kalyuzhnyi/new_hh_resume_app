import React, { useState } from 'react';
import * as XLSX from 'xlsx';

interface CompanyUploaderProps {
  onUpload: (companies: string[]) => void;
}

export default function CompanyUploader({ onUpload }: CompanyUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadedCompanies, setUploadedCompanies] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
      
      // Assuming companies are in the first column
      const companies = jsonData.map(row => row[0]).filter(Boolean);
      
      setUploadedCompanies(companies);
      onUpload(companies);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div>
      <div className="flex items-center space-x-4 mb-4">
        <input 
          type="file" 
          onChange={handleFileChange} 
          accept=".xlsx,.xls,.csv,.txt" 
          className="flex-grow"
        />
        <button
          onClick={handleUpload}
          className="bg-purple-500 text-white px-6 py-2 rounded hover:bg-purple-600 transition"
          disabled={!file}
        >
          Upload
        </button>
      </div>
      {uploadedCompanies.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Uploaded Companies ({uploadedCompanies.length}):</h3>
          <ul className="list-disc pl-5 max-h-40 overflow-y-auto bg-white p-4 rounded border">
            {uploadedCompanies.map((company, index) => (
              <li key={index}>{company}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}