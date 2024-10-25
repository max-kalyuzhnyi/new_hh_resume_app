import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import got from 'got'; // You'll need to install this package

// Remove hardcoded values
const CLIENT_ID = process.env.HH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.HH_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.HH_REDIRECT_URI || '';

const MAX_RETRIES = 1; // Reduced from 3
const RETRY_DELAY = 2000; // Reduced from 5000 (2 seconds)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAccessToken(code: string, retryCount = 0): Promise<any> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('Missing required environment variables');
  }

  try {
    const response = await got.post('https://api.hh.ru/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      followRedirect: true,
      https: {
        rejectUnauthorized: false,
      },
      timeout: {
        request: 5000,
      },
    });

    return JSON.parse(response.body);
  } catch (error) {
    if (error instanceof Error) {
      if ('response' in error) {
        const httpError = error as { response: { statusCode: number, body: string } };
        console.error('HTTP Error:', httpError.response.statusCode, httpError.response.body);
        
        if (httpError.response.statusCode === 403 && retryCount < MAX_RETRIES) {
          console.log(`Retrying in ${RETRY_DELAY / 1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await sleep(RETRY_DELAY);
          return getAccessToken(code, retryCount + 1);
        }
        
        throw new Error(`HTTP error ${httpError.response.statusCode}: ${httpError.response.body}`);
      } else {
        console.error('Error:', error.message);
        throw new Error(`Failed to get access token: ${error.message}`);
      }
    } else {
      console.error('Unknown error:', error);
      throw new Error('An unknown error occurred while getting the access token');
    }
  }
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
    console.error('Error getting access token:', error instanceof Error ? error.message : String(error));
    // Redirect back to the main page with an error parameter
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent('Failed to get access token')}`, request.url));
  }
}
