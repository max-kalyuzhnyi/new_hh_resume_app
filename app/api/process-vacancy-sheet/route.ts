import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import path from 'path';
import { parse } from 'url';
import * as cheerio from 'cheerio'; // You'll need to install this package
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  const log = (message: string) => {
    console.log(message); // Still log to server console
    logs.push(message); // Store log in array
  };

  try {
    const { sheetUrl, vacancyLimit = 3 } = await request.json();
    const accessToken = request.headers.get('Authorization')?.split(' ')[1];

    if (!sheetUrl || !accessToken) {
      return NextResponse.json({ error: 'Missing sheetUrl or accessToken' }, { status: 400 });
    }

    // Ensure vacancyLimit is a number between 1 and 20
    const parsedVacancyLimit = Math.min(Math.max(parseInt(vacancyLimit.toString(), 10) || 3, 1), 20);

    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheet URL');
    }

    log('Fetching sheet data...');
    const sheetData = await fetchSheetData(sheetId);
    log(`Fetched ${sheetData.length} rows of data`);
    log('Sheet data:');
    log(JSON.stringify(sheetData, null, 2)); // Pretty-print the JSON

    log('Processing sheet data...');
    const { originalData, newData } = await processSheetData(sheetData, accessToken, log, parsedVacancyLimit);
    log(`Processed ${newData.length} rows of data`);

    log('Writing to Google Sheet...');
    await writeToGoogleSheet(sheetId, newData, log);

    const formattedData = formatDataForDisplay(originalData, newData);
    
    return NextResponse.json({ 
      message: 'Google Sheet updated successfully',
      data: formattedData,
      logs: logs, // Include logs in the response
      sheetData: originalData,
      updatedRows: newData,
      apiResponses: newData.map(row => row.apiResponse)
    });
  } catch (error: unknown) {
    console.error('Error processing Google Sheet:', error);
    return NextResponse.json({ 
      error: 'Failed to process Google Sheet', 
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      logs: logs
    }, { status: 500 });
  }
}

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function fetchSheetData(sheetId: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Vacancies`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data: ${response.statusText}`);
  }
  const csvText = await response.text();
  
  // Parse CSV while preserving original formatting and removing extra quotes
  const rows = csvText.split('\n').map(row => {
    const cells = [];
    let inQuotes = false;
    let currentCell = '';
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') {
        if (!inQuotes) {
          inQuotes = true;
        } else if (row[i + 1] === '"') {
          currentCell += '"';
          i++; // Skip the next quote
        } else {
          inQuotes = false;
          cells.push(currentCell);
          currentCell = '';
        }
      } else if (row[i] === ',' && !inQuotes) {
        cells.push(currentCell);
        currentCell = '';
      } else {
        currentCell += row[i];
      }
    }
    if (currentCell !== '') {
      cells.push(currentCell);
    }
    return cells;
  });
  
  return rows;
}

async function processSheetData(
  sheetData: string[][],
  accessToken: string,
  log: (message: string) => void,
  vacancyLimit: number
): Promise<{ originalData: string[][], newData: { [key: string]: any }[] }> {
  const headers = sheetData[0];
  const columnIndexes = {
    companyName: headers.indexOf('Company name'),
    inn: headers.indexOf('INN'),
    link: headers.indexOf('Link to vacancy')
  };

  log('Column Indexes:');
  log(JSON.stringify(columnIndexes, null, 2));

  // Deduplicate vacancies based on the link
  const uniqueVacancies = new Map();
  for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex++) {
    const row = sheetData[rowIndex];
    const vacancyLink = row[columnIndexes.link];
    if (vacancyLink && !uniqueVacancies.has(vacancyLink)) {
      uniqueVacancies.set(vacancyLink, {
        companyName: row[columnIndexes.companyName],
        inn: row[columnIndexes.inn],
        link: vacancyLink
      });
    }
  }

  log(`Deduplicated vacancies: ${uniqueVacancies.size}`);

  const newData: { [key: string]: any }[] = [];

  for (const [vacancyLink, vacancyData] of Array.from(uniqueVacancies)) {
    log(`Processing vacancy link: ${vacancyLink}`);
    try {
      const vacancyInfos = await fetchVacancyContactInfo(vacancyLink, accessToken, log, vacancyLimit);
      
      vacancyInfos.forEach((vacancyInfo, index) => {
        log(`API response for vacancy ${index + 1}:`);
        log(JSON.stringify(vacancyInfo, null, 2));

        const phoneInfo = vacancyInfo.contacts?.phones?.[0];
        const phoneNumber = phoneInfo?.formatted || 'N/A';
        const phoneComment = phoneInfo?.comment || '';

        newData.push({
          companyName: vacancyData.companyName,
          inn: vacancyData.inn,
          fullName: vacancyInfo.contacts?.name || 'N/A',
          email: vacancyInfo.contacts?.email || 'N/A',
          phone: phoneNumber,
          phoneComment: phoneComment,
          individualVacancyLink: vacancyInfo.alternate_url || vacancyLink,
          apiResponse: vacancyInfo
        });
      });
    } catch (error: unknown) {
      log(`Error processing vacancy ${vacancyLink}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { originalData: sheetData, newData };
}

async function fetchVacancyContactInfo(
  vacancyLink: string,
  accessToken: string,
  log: (message: string) => void,
  vacancyLimit: number
): Promise<any[]> {
  log(`Fetching vacancy info for: ${vacancyLink}`);
  
  // Follow redirects to get the final URL
  const response = await fetch(vacancyLink, { redirect: 'follow' });
  const finalUrl = response.url;
  log(`Final URL after potential redirects: ${finalUrl}`);
  
  const parsedUrl = parse(finalUrl, true);
  
  if (parsedUrl.pathname?.includes('/search/vacancy') || parsedUrl.pathname?.includes('/employer/')) {
    // This is an employer vacancy list page
    log('Detected employer vacancy list page. Extracting individual vacancy links...');
    const individualVacancyLinks = await getIndividualVacancyLinks(finalUrl, log, vacancyLimit);
    log(`Found ${individualVacancyLinks.length} individual vacancy links`);
    
    if (individualVacancyLinks.length === 0) {
      log('No vacancies found. Returning empty array.');
      return [];
    }
    
    const vacancyInfos = [];
    for (const link of individualVacancyLinks) {
      try {
        const info = await fetchSingleVacancyInfo(link, accessToken, log);
        vacancyInfos.push(info);
      } catch (error: unknown) {
        log(`Error fetching vacancy info for ${link}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return vacancyInfos;
  }
  
  // Single vacancy link
  const singleVacancyInfo = await fetchSingleVacancyInfo(finalUrl, accessToken, log);
  return [singleVacancyInfo];
}

async function fetchSingleVacancyInfo(vacancyLink: string, accessToken: string, log: (message: string) => void): Promise<any> {
  const parsedUrl = parse(vacancyLink, true);
  const vacancyId = parsedUrl.pathname?.split('/').pop();
  
  if (!vacancyId) {
    log(`Invalid vacancy link: ${vacancyLink}`);
    throw new Error('Invalid vacancy link');
  }

  const vacancyUrl = `https://api.hh.ru/vacancies/${vacancyId}`;
  log(`Making API request to: ${vacancyUrl}`);

  try {
    const vacancyResponse = await fetch(vacancyUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Your App Name (your@email.com)'
      }
    });

    if (!vacancyResponse.ok) {
      const errorBody = await vacancyResponse.text();
      log(`API request failed. Status: ${vacancyResponse.status}, Body: ${errorBody}`);
      throw new Error(`HTTP error! status: ${vacancyResponse.status}, body: ${errorBody}`);
    }

    const vacancyData = await vacancyResponse.json();
    log(`Successfully fetched vacancy data for ID: ${vacancyId}`);
    return vacancyData;
  } catch (error: unknown) {
    log(`Error fetching vacancy data: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function writeToGoogleSheet(sheetId: string, newData: { [key: string]: any }[], log: (message: string) => void) {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Ensure Vacancies_output sheet exists
  await ensureSheetExists(sheets, sheetId, 'Vacancies_output', log);

  // Prepare headers
  const headers = [
    'Company name', 'INN', 'Full name', 'Email', 'Phone', 'Phone Comment', 'Individual Vacancy Link'
  ];

  // Prepare data for writing
  const dataToWrite = [headers];

  for (const row of newData) {
    const rowData = [
      row.companyName,
      row.inn,
      row.fullName,
      row.email,
      row.phone,
      row.phoneComment,
      row.individualVacancyLink
    ];

    dataToWrite.push(rowData);
  }

  // Write data
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Vacancies_output!A1',
    valueInputOption: 'RAW',
    resource: { values: dataToWrite },
  });

  log(`Written ${newData.length} vacancies to "Vacancies_output" sheet`);
}

function chunkString(str: string, length: number): string[] {
  const chunks = [];
  let i = 0;
  while (i < str.length) {
    chunks.push(str.slice(i, i + length));
    i += length;
  }
  return chunks;
}

async function ensureSheetExists(sheets: any, sheetId: string, sheetName: string, log: (message: string) => void) {
  try {
    await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      ranges: [`${sheetName}!A1`],
    });
    log(`Sheet "${sheetName}" already exists`);
  } catch (error: unknown) {
    // Sheet doesn't exist, create it
    if (error instanceof Error && error.message.includes('not found')) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
      log(`Created new sheet: ${sheetName}`);
    } else {
      // If it's not the expected error, rethrow it
      log(`Unexpected error while checking sheet existence: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

async function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

function formatDataForDisplay(sheetData: string[][], updatedRows: { [key: string]: any }[]): string {
  const headers = ['Company name', 'Individual Vacancy Link', 'Full name', 'Email', 'Phone', 'Phone Comment'];
  let output = headers.join('\t') + '\n';

  updatedRows.forEach(row => {
    output += `${row.companyName}\t${row.individualVacancyLink}\t${row.fullName}\t${row.email}\t${row.phone}\t${row.phoneComment}\n`;
  });

  return output;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// In your processing loop:
await delay(1000); // 1 second delay between requests

async function getIndividualVacancyLinks(employerUrl: string, log: (message: string) => void, vacancyLimit: number = 3): Promise<string[]> {
  log(`Fetching employer page: ${employerUrl}`);
  const response = await fetch(employerUrl);
  const html = await response.text();
  
  log(`Received HTML content (length: ${html.length} characters)`);

  const vacancyLinks: string[] = [];
  
  // Regular expression to find all vacancy data
  const regex = /"@showContact":(true|false),"vacancyId":(\d+),"name":"([^"]+)"/g;
  let match;

  while ((match = regex.exec(html)) !== null && vacancyLinks.length < vacancyLimit) {
    const showContact = match[1] === 'true';
    const vacancyId = match[2];
    const name = match[3];

    if (showContact) {
      const fullUrl = `https://hh.ru/vacancy/${vacancyId}`;
      vacancyLinks.push(fullUrl);
      log(`Found vacancy with contacts: ${name} - ${fullUrl}`);
    } else {
      log(`Skipping vacancy without contacts: ${name}`);
    }

    if (vacancyLinks.length >= vacancyLimit) {
      log(`Reached vacancy limit of ${vacancyLimit}. Stopping search.`);
      break;
    }
  }

  if (vacancyLinks.length === 0) {
    log('No vacancy links with contact buttons found.');
  } else {
    log(`Found ${vacancyLinks.length} vacancy links with contact buttons (limited to ${vacancyLimit})`);
  }
  
  return vacancyLinks;
}

function extractVacancyLinks($: cheerio.CheerioAPI): string[] {
  const vacancyLinks: string[] = [];
  
  // Target the specific elements containing vacancy links
  const selector = 'a.magritte-link___b4rEM_4-3-2[data-qa="serp-item__title"]';
  
  $(selector).each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      // hh.ru links are already full URLs, so we don't need to prepend the domain
      vacancyLinks.push(href);
    }
  });
  
  if (vacancyLinks.length === 0) {
    log('No vacancy links found. Dumping page content for debugging:');
    log($.html().substring(0, 1000) + '...'); // Log first 1000 characters of HTML
  } else {
    log(`Found ${vacancyLinks.length} vacancy links`);
  }
  
  return vacancyLinks;
}
