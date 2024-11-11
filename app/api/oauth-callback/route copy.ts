import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

// Remove hardcoded values
const CLIENT_ID = process.env.HH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.HH_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.HH_REDIRECT_URI || '';

async function getAccessToken(code: string) {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('Missing required environment variables');
  }

  const response = await fetch('https://hh.ru/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'YourAppName/1.0 (your@email.com)',
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
    const errorBody = await response.text();
    console.error('Error response:', errorBody);
    throw new Error(`Failed to get access token: ${response.statusText}. Error: ${errorBody}`);
  }

  return await response.json();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    console.error('No code provided in OAuth callback');
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  // Verify that the state matches what you sent in the initial request
  // if (state !== expectedState) {
  //   console.error('State mismatch in OAuth callback');
  //   return NextResponse.redirect(new URL('/?error=state_mismatch', request.url));
  // }

  try {
    const tokenData = await getAccessToken(code);
    console.log('Received token data:', tokenData);
    
    // Store tokens in HTTP-only cookies
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set('hh_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: tokenData.expires_in
    });
    response.cookies.set('hh_refresh_token', tokenData.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    console.log('Redirecting to:', response.url);
    console.log(`Access token will expire in ${tokenData.expires_in} seconds`);
    return response;
  } catch (error) {
    console.error('Error getting access token:', error);
    return NextResponse.redirect(new URL('/?error=token_error', request.url));
  }
}
