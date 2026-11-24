import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../_lib/requireAuth';
import { getBackendConfig } from '../_lib/backend-config';
import { jsonResponseFromBackend } from '../_lib/auth-cookies';

export async function GET(req: NextRequest) {
    if (process.env.MDS_STANDALONE_AUTH === 'true') {
        return NextResponse.json({
            sub: 'standalone-admin',
            name: 'Standalone Admin',
            preferred_username: 'admin',
            given_name: 'Standalone',
            family_name: 'Admin',
            email: 'admin@mds.local',
            email_verified: true,
            address: {},
        }, { status: 200 });
    }

    const auth = requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    const backendConfig = getBackendConfig();
    const iamUrl = `${backendConfig.iamUrl}/auth/get_logged_in_user`;

    const res = await fetch(iamUrl, {
        method: 'GET',
        headers: auth.backendHeaders,
        cache: 'no-store',
    });

    return jsonResponseFromBackend(res);
}

