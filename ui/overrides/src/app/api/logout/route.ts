import { NextRequest, NextResponse } from 'next/server';
import { getBackendConfig } from '../_lib/backend-config';

export async function GET(req: NextRequest) {
    if (process.env.MDS_STANDALONE_AUTH === 'true' || !process.env.IAM_URL) {
        const res = NextResponse.redirect(new URL('/', req.url));
        res.headers.append('Set-Cookie', 'X-Access-Token=; Path=/; Max-Age=0');
        res.headers.append('Set-Cookie', 'X-Session-Id=; Path=/; Max-Age=0');
        res.headers.append('Set-Cookie', 'X-CSRF-Token=; Path=/; Max-Age=0');
        return res;
    }

    const backendConfig = getBackendConfig();
    return NextResponse.redirect(`${backendConfig.iamUrl}/auth/logout`);
}

