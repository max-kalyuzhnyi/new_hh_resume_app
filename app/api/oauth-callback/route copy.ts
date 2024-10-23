import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const CLIENT_ID = 'PUPM3TF5H8G3NVSBQ0FL36CQ8F8M8KR54J1S5275OBAUM1KA7DR0T6CCL8F0IH3L';
const CLIENT_SECRET = 'HAK4SKEMGM7BJNMLVRCKHSU3K3G8MDKHDO38NVV04HSDJCPU7QG50URB2DSNECBQ';
const REDIRECT_URI = 'http://localhost:3000/api/oauth-callback';

async function getAccessToken(code: string) {
  const response = await fetch('https://hh.ru/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  return await response.json();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    console.error('No code provided in OAuth callback');
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    const tokenData = await getAccessToken(code);
    console.log('Received token data:', tokenData);
    
    // Redirect back to the main page with the access token as a query parameter
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    console.log('Redirecting to:', redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Error getting access token:', error);
    return NextResponse.redirect(new URL('/?error=token_error', request.url));
  }
}
