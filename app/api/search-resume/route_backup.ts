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
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('ru-RU');
}

async function fetchResumeDetails(resumeId: string, accessToken: string): Promise<any> {
  const url = `https://api.hh.ru/resumes/${resumeId}?with_job_search_status=true`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'api-test-agent',
      'HH-User-Agent': 'api-test-agent'
    }
  });

  if (!response.ok) {
    console.error(`Failed to fetch details for resume ${resumeId}`);
    return null;
  }

  const data = await response.json();
  return {
    status: data.job_search_status?.name || 'N/A',
    lastJobDescription: data.experience?.[0]?.description || 'N/A'
  };
}

// Move helper function outside
function isRecentOrCurrentExperience(exp: Experience): boolean {
  if (!exp.end) return true;
  
  const endDate = new Date(exp.end);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return endDate >= oneYearAgo;
}

async function fetchResumes(searchText: string, limit: number, accessToken: string, companies: string[]): Promise<Resume[]> {
  let allItems: Resume[] = [];
  const MAX_ITEMS = 2000;
  const ITEMS_PER_PAGE = 100;
  
  // Fix company query formatting
  const companyQuery = companies.map(company => {
    // Remove any existing quotes and ООО/ОАО/etc prefixes
    const cleanName = company
      .replace(/^(ООО|ОАО|ЗАО|АО)\s*["']?/i, '')  // Remove legal entity prefix
      .replace(/["']/g, '')                        // Remove any quotes
      .trim();
    
    return `"${cleanName}"`; // Add single set of quotes
  }).join(' OR ');
  
  const fullQuery = `(${companyQuery}) AND (${searchText})`;
  
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

  let page = 0;
  while (allItems.length < MAX_ITEMS) {
    searchParams.set('page', page.toString());
    const pageUrl = `https://api.hh.ru/resumes?${searchParams.toString()}`;
    console.log(`Fetching page ${page}. Query: ${fullQuery}`);
    
    const response = await fetch(pageUrl, {
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
      console.log('No more matches found');
      break;
    }

    // Log the first resume as an example
    if (page === 0 && data.items?.[0]) {
      console.log('Example resume structure:', JSON.stringify(data.items[0], null, 2));
    }

    // Update the company matching filter with proper types
    const newItems = data.items.filter((item: Resume) => 
      item.experience?.some((exp: Experience) => 
        companies.some(company => {
          const isCompanyMatch = exp.company?.toLowerCase().trim() === company.toLowerCase().trim();
          return isCompanyMatch && isRecentOrCurrentExperience(exp);
        })
      )
    );

    allItems = allItems.concat(newItems);
    console.log(`Found ${newItems.length} exact matches on page ${page}. Total: ${allItems.length}/${data.found}`);

    if (page * ITEMS_PER_PAGE >= data.found) break;
    page++;
  }
  
  console.log('Fetching detailed info for matching resumes...');
  const enrichedItems = await Promise.all(
    allItems.slice(0, limit).map(async (item) => {
      const details = await fetchResumeDetails(item.id, accessToken);
      return {
        ...item,
        status: details?.status,
        lastJobDescription: details?.lastJobDescription
      };
    })
  );

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
      // Write results to sheet
      await writeResumesToSheet(sheetId, limitedItems);
      // Return success message instead of CSV
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
