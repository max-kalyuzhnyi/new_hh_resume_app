import React from 'react';

interface Vacancy {
  alternate_url: string;
  // Add other properties as needed
}

interface SearchResultsProps {
  results: Vacancy[] | null;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results }) => {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Search Results</h2>
      {Array.isArray(results) && results.length > 0 ? (
        <ul>
          {results.map((vacancy, index) => (
            <li key={index} className="mb-2">
              <a
                href={vacancy.alternate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {vacancy.alternate_url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No results found.</p>
      )}
    </div>
  );
};

export default SearchResults;
