import React from 'react';
import styles from './CompanyInput.module.css';

interface CompanyInputProps {
  company: string;
  setCompany: (company: string) => void;
}

const CompanyInput: React.FC<CompanyInputProps> = ({ company, setCompany }) => {
  return (
    <input
      type="text"
      value={company}
      onChange={(e) => setCompany(e.target.value)}
      placeholder="Enter company name (optional)"
      className={styles.input}
    />
  );
};

export default CompanyInput;
