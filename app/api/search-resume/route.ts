import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { google } from 'googleapis';

// Add interfaces at the top of the file
interface Experience {
  company?: string;
  end?: string;
  start?: string;
  description?: string;
  position?: string;
}

interface Resume {
  id: string;
  title?: string;
  experience?: Experience[];
  age?: number;
  area?: { name: string };
  salary?: { amount: number; currency: string };
  total_experience?: { months: number };
  last_visit?: string;
  updated_at?: string;
  status?: string;
  lastJobDescription?: string;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('ru-RU');
}

const TIMEOUT_MS = 15000; // Reduced from 30s to 15s
const MAX_RETRIES = 2;    // Reduced from 3 to 2
const BATCH_SIZE = 10;    // Increased from 5 to 10
const DELAY_BETWEEN_REQUESTS = 100; // Reduced from 1000ms to 100ms
const MAX_DURATION_SEC = 60;
const SAFETY_MARGIN_SEC = 10; // Increased from 5s to 10s
const MAX_EXECUTION_MS = (MAX_DURATION_SEC - SAFETY_MARGIN_SEC) * 1000;
const MAX_RESULTS_PER_COMPANY = 1000; // Add this new limit
const ITEMS_PER_PAGE = 100;

// Add new timeout fetch wrapper
async function fetchWithTimeout(url: string, options: RequestInit, timeout = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Update fetchResumeDetails with longer delays between retries
async function fetchResumeDetails(resumeId: string, accessToken: string, retries = MAX_RETRIES): Promise<any> {
  try {
    const url = `https://api.hh.ru/resumes/${resumeId}?with_job_search_status=true`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'api-test-agent',
        'HH-User-Agent': 'api-test-agent'
      }
    });

    if (response.status === 429) {
      if (retries > 0) {
        const waitTime = (MAX_RETRIES - retries + 1) * 1000; // Reduced from 2000 to 1000
        console.log(`Rate limited, waiting ${waitTime}ms before retry`);
        await delay(waitTime);
        return fetchResumeDetails(resumeId, accessToken, retries - 1);
      }
    }

    if (!response.ok) {
      throw new Error(`Failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      status: data.job_search_status?.name || 'N/A',
      lastJobDescription: data.experience?.[0]?.description || 'N/A'
    };
  } catch (error) {
    if (retries > 0) {
      const waitTime = (MAX_RETRIES - retries + 1) * 1000;
      console.log(`Error fetching resume ${resumeId}, waiting ${waitTime}ms before retry`);
      await delay(waitTime);
      return fetchResumeDetails(resumeId, accessToken, retries - 1);
    }
    console.error(`Failed to fetch details for resume ${resumeId}:`, error);
    return null;
  }
}

// Move helper function outside
function isRecentOrCurrentExperience(exp: Experience): boolean {
  if (!exp.end) return true;
  
  const endDate = new Date(exp.end);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return endDate >= oneYearAgo;
}

// Add helper function to clean company names
function cleanCompanyName(company: string): string {
  // List of words to remove
  const removeWords = [
    'область',
    'край',
    'республика',
    'округ',
    'москва',
    'московская',
    'санкт-петербург',
    'ленинградская',
    'новосибирск',
    'район',
    'город',
    'пао',
    'оао',
    'ооо',
    'зао',
    'ао',
    'группа',
    'компаний',
    'компания',
    'корпорация',
    'холдинг',
    'филиал',
    'представительство'
  ];

  // Convert to lowercase and remove quotes
  let cleanName = company
    .toLowerCase()
    .replace(/["'«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove all words from the list
  removeWords.forEach(word => {
    cleanName = cleanName.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  });

  // Clean up extra spaces and trim
  cleanName = cleanName
    .replace(/\s+/g, ' ')
    .trim();

  return cleanName;
}

async function fetchResumes(searchText: string, limit: number, accessToken: string, companies: string[]): Promise<Resume[]> {
  const startTime = Date.now();
  let allItems: Resume[] = [];
  
  for (const company of companies) {
    // Add time check before each major operation
    if (Date.now() - startTime > MAX_EXECUTION_MS) {
      console.log('Time limit approaching, stopping search');
      break;
    }

    if (allItems.length >= limit) {
      console.log('Reached requested limit, stopping search');
      break;
    }

    // Use the new cleaning function
    const cleanName = cleanCompanyName(company);
    
    if (!cleanName) {
      console.log(`Skipping empty company name after cleaning: ${company}`);
      continue;
    }

    const fullQuery = `"${cleanName}"~1`; // Use exact phrase with distance of 1
    
    const searchParams = new URLSearchParams({
      text: fullQuery,
      search_field: 'company_name,position,skill_set',
      period: '365',
      area: '113',
      relocation: 'living_or_relocation',
      order_by: 'relevance',
      per_page: ITEMS_PER_PAGE.toString(),
      clusters: 'true',
      no_magic: 'true',
      fields: 'last_name,first_name,middle_name,age,area,salary,title,experience,total_experience,last_visit,updated_at'
    });

    console.log(`Searching for company: ${cleanName}`);
    let page = 0;
    let companyItems: Resume[] = [];

    while (true) {
      // Add time check inside the pagination loop
      if (Date.now() - startTime > MAX_EXECUTION_MS || 
          companyItems.length >= MAX_RESULTS_PER_COMPANY) {
        console.log(`Stopping search for ${cleanName} - ${
          Date.now() - startTime > MAX_EXECUTION_MS ? 'time limit' : 'result limit'
        } reached`);
        break;
      }

      searchParams.set('page', page.toString());
      const pageUrl = `https://api.hh.ru/resumes?${searchParams.toString()}`;
      
      try {
        const response = await fetchWithTimeout(pageUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'api-test-agent',
            'HH-User-Agent': 'api-test-agent'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
          console.log(`No more matches found for ${cleanName}`);
          break;
        }

        // Filter for exact company match and recent experience
        const newItems = data.items.filter((item: Resume) => 
          item.experience?.some((exp: Experience) => {
            const expCompanyClean = cleanCompanyName(exp.company || '');
            const isCompanyMatch = expCompanyClean === cleanName;
            return isCompanyMatch && isRecentOrCurrentExperience(exp);
          })
        );

        companyItems = companyItems.concat(newItems);
        console.log(`Found ${newItems.length} exact matches on page ${page} for ${cleanName}. Total for company: ${companyItems.length}/${data.found}`);

        if (page * ITEMS_PER_PAGE >= data.found) break;
        page++;
      } catch (error) {
        console.error(`Error fetching page ${page} for company ${cleanName}:`, error);
        break;
      }
    }

    // Add company results to total
    allItems = allItems.concat(companyItems);
    console.log(`Total resumes found across all companies so far: ${allItems.length}`);
  }
  
  // Limit total results
  allItems = allItems.slice(0, limit);
  
  console.log('Fetching detailed info for matching resumes...');
  const enrichedItems: Resume[] = [];
  
  // Process in smaller batches, sequentially
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > MAX_EXECUTION_MS) {
      console.log('Approaching timeout limit, stopping enrichment');
      break;
    }

    const batch = allItems.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${i/BATCH_SIZE + 1}, items ${i}-${i + batch.length}`);
    
    // Process each resume in batch sequentially
    for (const item of batch) {
      const details = await fetchResumeDetails(item.id, accessToken);
      if (details) {
        enrichedItems.push({
          ...item,
          status: details.status,
          lastJobDescription: details.lastJobDescription
        });
      } else {
        enrichedItems.push(item);
      }
      await delay(DELAY_BETWEEN_REQUESTS); // Wait between requests
    }
    
    // Add delay between batches
    if (i + BATCH_SIZE < allItems.length) {
      await delay(DELAY_BETWEEN_REQUESTS);  // Now 100ms instead of 2000ms
    }
  }

  return enrichedItems;
}

function matchesSearchCriteria(resume: any, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return true;
  const title = resume.title?.toLowerCase() || '';
  const skills = resume.skill_set?.join(' ').toLowerCase() || '';
  return searchTerms.some(term => title.includes(term) || skills.includes(term));
}

function convertToCSV(items: any[]): string {
  const headers = [
    'Искомая должность',
    'Последнее место работы - Компания',
    'Последнее место работы - Должность',
    'Последнее место работы - Описание',
    'Последнее место работы - Период',
    'Статус поиска работы',
    'Ссылка',
    'Возраст',
    'Желаемая зарплата',
    'Обновлено',
    'Город',
    'Общий опыт работы'
  ];

  const rows = items.map(item => {
    const lastJob = item.experience?.[0] || {};
    return [
      item.title || '',
      lastJob.company || '',
      lastJob.position || '',
      item.lastJobDescription || '',
      `${formatDate(lastJob.start)} - ${formatDate(lastJob.end)}`,
      item.status || '',
      `https://hh.ru/resume/${item.id}`,
      item.age || '',
      item.salary ? `${item.salary.amount || ''} ${item.salary.currency || ''}` : '',
      item.updated_at || '',
      item.area?.name || '',
      item.total_experience?.months 
        ? `${Math.floor(item.total_experience.months / 12)} лет ${item.total_experience.months % 12} месяцев`
        : ''
    ];
  });

  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

// Add function to fetch companies from Google Sheet
async function fetchCompaniesFromSheet(spreadsheetUrl: string): Promise<string[]> {
  try {
    // Extract the spreadsheet ID from the URL
    const matches = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!matches) {
      throw new Error('Invalid Google Sheet URL format');
    }
    const spreadsheetId = matches[1];

    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,  // Use the extracted ID, not the full URL
      range: 'A:A', // Assumes companies are in column A
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No companies found in the sheet');
    }

    // Skip header row and get unique companies
    return Array.from(new Set(rows.slice(1).map(row => row[0]?.trim()).filter(Boolean)));
  } catch (error) {
    console.error('Error fetching from Google Sheet:', error);
    throw new Error('Failed to fetch companies from Google Sheet');
  }
}

// Add getGoogleAuth function
async function getGoogleAuth() {
  const credentialsString = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsString) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set');
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsString);
  } catch (error) {
    throw new Error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS: ' + (error instanceof Error ? error.message : String(error)));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

// Update writeResumesToSheet to use getGoogleAuth instead of getGoogleAuthClient
async function writeResumesToSheet(sheetId: string, items: any[]): Promise<void> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = [
    'Искомая должность',
    'Последнее место работы - Компания',
    'Последнее место работы - Должность',
    'Последнее место работы - Описание',
    'Последнее место работы - Период',
    'Статус поиска работы',
    'Ссылка',
    'Возраст',
    'Желаемая зарплата',
    'Обновлено',
    'Город',
    'Общий опыт работы'
  ];

  const rows = items.map(item => {
    const lastJob = item.experience?.[0] || {};
    return [
      item.title || '',
      lastJob.company || '',
      lastJob.position || '',
      item.lastJobDescription || '',
      `${formatDate(lastJob.start)} - ${formatDate(lastJob.end)}`,
      item.status || '',
      `https://hh.ru/resume/${item.id}`,
      item.age || '',
      item.salary ? `${item.salary.amount || ''} ${item.salary.currency || ''}` : '',
      item.updated_at || '',
      item.area?.name || '',
      item.total_experience?.months 
        ? `${Math.floor(item.total_experience.months / 12)} лет ${item.total_experience.months % 12} месяцев`
        : ''
    ];
  });

  const dataToWrite = [headers, ...rows];

  // Ensure Resume_output sheet exists
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Resume_output!A1',
    });
  } catch (error) {
    // Sheet doesn't exist, create it
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: 'Resume_output' }
          }
        }]
      }
    });
  }

  // Write data
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Resume_output!A1',
    valueInputOption: 'RAW',
    requestBody: { values: dataToWrite },
  });
}

// Modify the GET handler to write to sheet
export const GET = async (request: NextRequest) => {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const text = searchParams.get('text') || '';
    const totalLimit = parseInt(searchParams.get('totalLimit') || '100', 10);
    const mode = searchParams.get('mode') || 'full';
    const accessToken = searchParams.get('accessToken');
    const sheetUrl = searchParams.get('sheetUrl');

    if (!accessToken || !sheetUrl) {
      throw new Error('Access token and Google Sheet URL are required');
    }

    // Extract sheet ID from URL
    const matches = decodeURIComponent(sheetUrl).match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!matches) throw new Error('Invalid Google Sheet URL');
    const sheetId = matches[1];

    // Fetch companies from Google Sheet
    const companies = await fetchCompaniesFromSheet(decodeURIComponent(sheetUrl));
    console.log(`Fetched ${companies.length} companies from sheet`);

    const allItems = await fetchResumes(text, totalLimit, accessToken, companies);
    const isPreview = mode === 'preview';
    const limitedItems = allItems.slice(0, isPreview ? 10 : totalLimit);

    if (!isPreview) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        return NextResponse.json({ 
          success: false,
          message: 'Operation timed out, partial results obtained',
          count: allItems.length 
        });
      }
      
      await writeResumesToSheet(sheetId, limitedItems);
      return NextResponse.json({ 
        success: true, 
        message: 'Data successfully written to sheet',
        count: limitedItems.length 
      });
    } else {
      return NextResponse.json(limitedItems);
    }
  } catch (error: unknown) {
    console.error('Error in resume search:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
};

export const dynamic = 'force-dynamic';

export const maxDuration = 60; // Set to 60 seconds
