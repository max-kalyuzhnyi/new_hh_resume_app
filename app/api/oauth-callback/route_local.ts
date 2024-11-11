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
    return NextResponse.redirect(new URL('http://localhost:3000/?error=no_code'));
  }

  try {
    const tokenData = await getAccessToken(code);
    console.log('Received token data:', tokenData);
    
    // Create a response that redirects to localhost:3000
    const response = NextResponse.redirect('http://localhost:3000/');
    
    // Store tokens in HTTP-only cookies
    response.cookies.set('hh_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: false, // Set to false for localhost
      sameSite: 'lax', // Changed to 'lax' for cross-site redirect
      maxAge: tokenData.expires_in
    });
    response.cookies.set('hh_refresh_token', tokenData.refresh_token, {
      httpOnly: true,
      secure: false, // Set to false for localhost
      sameSite: 'lax' // Changed to 'lax' for cross-site redirect
    });
    
    console.log('Redirecting to:', response.url);
    return response;
  } catch (error) {
    console.error('Error getting access token:', error);
    return NextResponse.redirect('http://localhost:3000/?error=token_error');
  }
}
