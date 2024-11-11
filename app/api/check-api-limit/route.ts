import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const HH_API_BASE_URL = 'https://api.hh.ru';

interface ApiActionInfo {
  id: string;
  serviceType: {
    id: string;
    name: string;
  };
  activatedAt: string;
  expiresAt: string;
  balance: {
    actual: number;
    initial: number;
  };
}

interface ApiLimitInfo {
  actions: ApiActionInfo[];
  message: string;
}

interface ManagerApiLimitInfo extends ApiLimitInfo {
  managerActions?: ApiActionInfo[]; // Make this optional
}

async function getEmployerId(accessToken: string): Promise<string> {
  const response = await fetch(`${HH_API_BASE_URL}/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'ResumeProcessor/1.0 (your@email.com)'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  const data = await response.json();
  if (!data.employer?.id) {
    throw new Error('No employer ID found in user data');
  }

  return data.employer.id;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accessToken = searchParams.get('accessToken');
  const managerId = searchParams.get('managerId');

  if (!accessToken) {
    return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });
  }

  if (!managerId) {
    return NextResponse.json({ error: 'Missing managerId' }, { status: 400 });
  }

  try {
    const employerId = await getEmployerId(accessToken);
    const limitInfo = await checkApiLimit(accessToken, employerId, managerId);
    return NextResponse.json(limitInfo);
  } catch (error) {
    console.error('Error checking API limit:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Failed to check API limit', details: error.message },
        { status: 500 }
      );
    } else {
      return NextResponse.json(
        { error: 'Failed to check API limit', details: 'An unknown error occurred' },
        { status: 500 }
      );
    }
  }
}

async function checkApiLimit(accessToken: string, employerId: string, managerId: string): Promise<ManagerApiLimitInfo> {
  const employerUrl = `${HH_API_BASE_URL}/employers/${employerId}/services/payable_api_actions/active`;
  const managerUrl = `${HH_API_BASE_URL}/employers/${employerId}/managers/${managerId}/services/payable_api_actions/active`;

  const employerResponse = await fetch(employerUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!employerResponse.ok) {
    throw new Error(`HTTP error! Employer status: ${employerResponse.status}`);
  }

  const employerData = await employerResponse.json();

  // Check if no active API packs
  if (!employerData.items?.length) {
    return {
      actions: [],
      message: 'No active API packs found for this employer.'
    };
  }

  let managerData = null;
  try {
    const managerResponse = await fetch(managerUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (managerResponse.ok) {
      managerData = await managerResponse.json();
    } else {
      console.warn(`Manager API call failed with status: ${managerResponse.status}`);
    }
  } catch (error) {
    console.error('Error fetching manager data:', error);
  }

  console.log('Employer API response:', JSON.stringify(employerData, null, 2));
  if (managerData) {
    console.log('Manager API response:', JSON.stringify(managerData, null, 2));
  }

  const actions: ApiActionInfo[] = employerData.items.map((item: any) => ({
    id: item.id,
    serviceType: item.service_type,
    activatedAt: item.activated_at,
    expiresAt: item.expires_at,
    balance: item.balance
  }));

  const managerActions: ApiActionInfo[] | null = managerData ? managerData.items.map((item: any) => ({
    id: item.id,
    serviceType: item.service_type,
    activatedAt: item.activated_at,
    expiresAt: item.expires_at,
    balance: item.balance
  })) : null;

  return {
    actions,
    ...(managerActions && { managerActions }), // Only include if not null
    message: managerData 
      ? 'API limit information retrieved successfully for both employer and manager.'
      : 'API limit information retrieved successfully for employer. Manager data not available.'
  };
}
