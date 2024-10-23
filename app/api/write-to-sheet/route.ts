import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

const HH_API_BASE_URL = 'https://api.hh.ru';

export async function POST(request: NextRequest) {
  const { sheetUrl, accessToken } = await request.json();

  if (!sheetUrl || !accessToken) {
    return NextResponse.json({ error: 'Missing sheetUrl or accessToken' }, { status: 400 });
  }

  try {
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheet URL');
    }

    console.log('Fetching sheet data...');
    const sheetData = await fetchSheetData(sheetId);
    console.log('Sheet data fetched:', sheetData.length, 'rows');

    console.log('Processing sheet data...');
    const updatedRows = await processSheetData(sheetData, accessToken);
    console.log('Sheet data processed:', updatedRows.length, 'rows');

    console.log('Writing data to Google Sheet...');
    await writeToGoogleSheet(sheetId, updatedRows);
    console.log('Data written to Google Sheet');

    return NextResponse.json({ 
      message: 'Google Sheet updated successfully'
    });
  } catch (error: unknown) {
    console.error('Error processing Google Sheet:', error);
    return NextResponse.json({ 
      error: 'Failed to process Google Sheet', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

async function fetchSheetData(sheetId: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Resume`;
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

async function processSheetData(sheetData: string[][], accessToken: string): Promise<{ [key: string]: string }[]> {
  const headers = sheetData[0];
  const columnIndexes = {
    fullName: headers.indexOf('Full name'),
    currentTitle: headers.indexOf('Current title'),
    phone: headers.indexOf('Phone'),
    email: headers.indexOf('Email'),
    link: headers.indexOf('Link to resume')
  };

  const updatedRows = await Promise.all(sheetData.slice(1).map(async (row, rowIndex) => {
    const resumeLink = row[columnIndexes.link];
    if (!resumeLink) return null;

    const resumeInfo = await fetchResumeInfo(resumeLink, accessToken);
    
    if (!resumeInfo) return null;
    
    return {
      rowIndex: rowIndex + 2,
      fullName: resumeInfo.fullName,
      currentTitle: resumeInfo.currentTitle,
      phone: resumeInfo.phone,
      email: resumeInfo.email
    };
  }));

  return updatedRows.filter(row => row !== null);
}

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchResumeInfo(resumeLink: string, accessToken: string): Promise<any> {
  const resumeId = resumeLink.split('/').pop();
  const url = `${HH_API_BASE_URL}/resumes/${resumeId}`;

  await delay(1000);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Error fetching resume ${resumeId}: HTTP status ${response.status}`);
      return null;
    }

    const resumeData = await response.json();

    let resumeInfo: any = {
      fullName: resumeData.last_name && resumeData.first_name ? `${resumeData.last_name} ${resumeData.first_name}` : '',
      currentTitle: resumeData.title || '',
      phone: '',
      email: ''
    };

    if (resumeData.actions && resumeData.actions.get_with_contact) {
      const getWithContactUrl = resumeData.actions.get_with_contact.url;

      await delay(1000);

      const contactResponse = await fetch(getWithContactUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (contactResponse.ok) {
        const contactData = await contactResponse.json();
        
        resumeInfo.fullName = `${contactData.first_name || ''} ${contactData.last_name || ''}`.trim();
        resumeInfo.currentTitle = contactData.title || resumeInfo.currentTitle;
        
        if (Array.isArray(contactData.contact)) {
          const phoneContact = contactData.contact.find((c: any) => c.type.id === 'cell' || c.type.id === 'phone');
          const emailContact = contactData.contact.find((c: any) => c.type.id === 'email');

          if (phoneContact) {
            resumeInfo.phone = phoneContact.value.formatted || phoneContact.value.number;
          }
          if (emailContact) {
            resumeInfo.email = emailContact.value;
          }
        }
      }
    } else {
      if (Array.isArray(resumeData.contact)) {
        const phoneContact = resumeData.contact.find((c: any) => c.type.id === 'cell' || c.type.id === 'phone');
        const emailContact = resumeData.contact.find((c: any) => c.type.id === 'email');

        if (phoneContact) {
          resumeInfo.phone = phoneContact.value.formatted || phoneContact.value.number;
        }
        if (emailContact) {
          resumeInfo.email = emailContact.value;
        }
      }
    }

    return resumeInfo;
  } catch (error: unknown) {
    console.error(`Error processing resume ${resumeId}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function writeToGoogleSheet(sheetId: string, data: { rowIndex: number, fullName: string, currentTitle: string, phone: string, email: string }[]) {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // Prepare data for writing
    const dataToWrite = data.map(row => [
      row.fullName,
      row.currentTitle,
      row.phone,
      row.email
    ]);

    // Write data
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Resume!D2',
      valueInputOption: 'RAW',
      requestBody: { values: dataToWrite },
    });

    console.log(`Written ${data.length} rows to "Resume" sheet`);
  } catch (error: unknown) {
    console.error('Error writing to Google Sheet:', error instanceof Error ? error.message : String(error));
    throw error; // Re-throw the error to be handled by the caller
  }
}

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
