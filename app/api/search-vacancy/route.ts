import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

async function fetchVacancies(url: string, limit: number): Promise<any[]> {
  let allItems: any[] = [];
  let page = 0;
  
  while (allItems.length < limit) {
    const pageUrl = `${url}&page=${page}&per_page=100`;
    console.log(`Fetching: ${pageUrl}`);
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'api-test-agent',
        'Accept': 'application/json'
      }
    });
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      allItems = allItems.concat(data.items);
      console.log(`Fetched ${data.items.length} items. Total: ${allItems.length}`);
      page++;
    } else {
      console.log('No more items found');
      break;
    }
  }
  
  return allItems.slice(0, limit);
}

async function fetchCompanyIds(companyName: string): Promise<string[]> {
  const url = `https://api.hh.ru/employers?text=${encodeURIComponent(companyName)}`;
  console.log(`Searching for company: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'api-test-agent',
      'Accept': 'application/json'
    }
  });
  const data = await response.json();
  
  if (data.items && data.items.length > 0) {
    const ids = data.items.map((item: any) => item.id);
    console.log(`Found companies for "${companyName}": ${ids.join(', ')}`);
    return ids;
  }
  console.log(`No companies found for: ${companyName}`);
  return [];
}

function matchesSearchCriteria(vacancy: any, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return true;
  const title = vacancy.name.toLowerCase();
  const description = vacancy.snippet?.requirement?.toLowerCase() || '';
  return searchTerms.some(term => title.includes(term) || description.includes(term));
}

function escapeCSV(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function convertToCSV(items: any[]): string {
  if (items.length === 0) {
    return 'No vacancies found';
  }
  const headers = ['ID', 'Name', 'Employer', 'Salary From', 'Salary To', 'Currency', 'URL'];
  const rows = items.map(item => [
    item.id,
    escapeCSV(item.name),
    escapeCSV(item.employer.name),
    item.salary?.from || '',
    item.salary?.to || '',
    item.salary?.currency || '',
    item.alternate_url
  ]);
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

async function getVacancyDetails(vacancyId: string) {
  const response = await fetch(`https://api.hh.ru/vacancies/${vacancyId}`);
  if (!response.ok) {
    console.error(`Failed to fetch vacancy details for ID ${vacancyId}: ${response.statusText}`);
    return null;
  }
  const data = await response.json();
  console.log(`Vacancy details for ID ${vacancyId}:`, JSON.stringify(data, null, 2));
  return data;
}

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const text = searchParams.get('text') || '';
    const companies = searchParams.get('companies')?.split(',') || [];
    const totalLimit = parseInt(searchParams.get('totalLimit') || '100', 10);
    const limitPerCompany = parseInt(searchParams.get('limitPerCompany') || '3', 10);
    const mode = searchParams.get('mode') || 'full'; // 'preview' or 'full'
    
    console.log(`Received request - Mode: ${mode}, Text: "${text}", Companies: ${companies.join(', ')}, Total Limit: ${totalLimit}, Limit per Company: ${limitPerCompany}`);

    const searchTerms = text ? text.toLowerCase().split(' OR ').map(term => term.replace(/['"~]/g, '').trim()) : [];
    let allItems: any[] = [];

    for (const company of companies) {
      const companyIds = await fetchCompanyIds(company);
      for (const companyId of companyIds) {
        if (allItems.length >= totalLimit) break;
        
        const baseUrl = `https://api.hh.ru/vacancies?employer_id=${companyId}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
        console.log(`Fetching vacancies for company: ${company} (ID: ${companyId})`);
        const companyItems = await fetchVacancies(baseUrl, limitPerCompany);
        allItems = allItems.concat(companyItems);
        console.log(`Found ${companyItems.length} matching vacancies for ${company} (ID: ${companyId})`);
        
        if (allItems.length >= totalLimit) break;
      }
      if (allItems.length >= totalLimit) break;
    }

    const isPreview = searchParams.get('preview') === 'true';
    const previewLimit = isPreview ? 10 : totalLimit;

    allItems = allItems.slice(0, previewLimit);
    console.log(`Total vacancies found: ${allItems.length}`);

    if (mode === 'preview') {
      return NextResponse.json(allItems);
    } else {
      const csv = convertToCSV(allItems);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=vacancies.csv'
        }
      });
    }

    // ... error handling ...
  } catch (error: unknown) {
    console.error('Error fetching from HH API:', error);
    
    let errorMessage = 'Failed to fetch data from HH API';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ error: 'Failed to fetch data from HH API', details: errorMessage }, { status: 500 });
  }
}
