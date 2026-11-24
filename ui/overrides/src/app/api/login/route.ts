import { NextRequest, NextResponse } from 'next/server';
import { getBackendConfig } from '../_lib/backend-config';

export async function GET(req: NextRequest) {
    const redirectUri = req.nextUrl.searchParams.get('redirect_uri') || '/';

    // Standalone Auth Mode: bypass external IAM and set local session cookies directly
    if (process.env.MDS_STANDALONE_AUTH === 'true' || !process.env.IAM_URL) {
        const res = NextResponse.redirect(new URL(redirectUri, req.url));
        res.headers.append('Set-Cookie', 'X-Access-Token=standalone; Path=/; SameSite=Lax');
        res.headers.append('Set-Cookie', 'X-Session-Id=standalone; Path=/; SameSite=Lax');
        res.headers.append('Set-Cookie', 'X-CSRF-Token=standalone; Path=/; SameSite=Lax');
        return res;
    }

    const backendConfig = getBackendConfig();
    const iamUrl = `${backendConfig.iamUrl}/auth/start_authentication_transaction`;
    const url = `${iamUrl}?id=${backendConfig.loginProviderId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: '',
    });

    const data = await res.json();
    if (!data.redirectUrl) {
        return NextResponse.json({ error: 'Failed to initiate auth' }, { status: 500 });
    }

    return NextResponse.redirect(data.redirectUrl);
}

