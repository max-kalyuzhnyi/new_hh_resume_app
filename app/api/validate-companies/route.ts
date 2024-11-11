import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { google } from 'googleapis';

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

async function fetchCompanyInfo(companyName: string): Promise<any[]> {
  const url = `https://api.hh.ru/employers?text=${encodeURIComponent(companyName)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'api-test-agent',
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HH API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.items?.length) return [];

  // Return all matches
  return data.items.map((item: any) => ({
    originalName: companyName,
    hhName: item.name,
    hhId: item.id,
    url: item.alternate_url
  }));
}

export async function POST(request: NextRequest) {
  try {
    const { sheetUrl } = await request.json();

    // Extract sheet ID
    const matches = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!matches) throw new Error('Invalid Google Sheet URL');
    const sheetId = matches[1];

    // Get companies from sheet
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      throw new Error('No companies found in sheet');
    }

    // Skip header and process companies
    const companies = rows.slice(1).map(row => row[0]?.trim()).filter(Boolean);
    
    // Create validation sheet
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'Company_Validation!A1',
      });
    } catch (error) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: 'Company_Validation' }
            }
          }]
        }
      });
    }

    // Validate each company and flatten results
    const validationResults = (await Promise.all(
      companies.map(async (company) => {
        const matches = await fetchCompanyInfo(company);
        if (matches.length === 0) {
          return [[company, 'Not found', 'N/A', 'N/A', 'No']];
        }
        return matches.map(info => [
          company,
          info.hhName,
          info.hhId,
          info.url,
          'Yes'
        ]);
      })
    )).flat();

    // Write validation results
    const headers = ['Original Name', 'HH.ru Name', 'HH ID', 'URL', 'Found'];
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Company_Validation!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers, ...validationResults]
      }
    });

    return NextResponse.json({ 
      message: 'Company validation completed',
      totalCompanies: companies.length,
      totalMatches: validationResults.filter(r => r[4] === 'Yes').length,
      uniqueCompanies: companies.length
    });

  } catch (error) {
    console.error('Error validating companies:', error);
    return NextResponse.json({ 
      error: 'Failed to validate companies',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 