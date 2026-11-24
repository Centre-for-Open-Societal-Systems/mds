import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../_lib/requireAuth';
import { getBackendConfig } from '../_lib/backend-config';
import { jsonResponseFromBackend } from '../_lib/auth-cookies';

export async function GET(req: NextRequest) {
    if (process.env.MDS_STANDALONE_AUTH === 'true') {
        return NextResponse.json([
            {
                application_mnemonic: 'master-data',
                permissions: [
                    'referenceData:create',
                    'referenceData:edit',
                    'referenceData:delete',
                    'referenceData:publish',
                    'geo:create',
                    'geo:edit',
                    'geo:delete',
                    'geo:publish',
                ],
            },
        ], { status: 200 });
    }

    const auth = requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const backendConfig = getBackendConfig();
    const iamUrl = `${backendConfig.iamUrl}/user-access/get_application_permissions_for_user?application_mnemonic=${backendConfig.applicationMnemonic}`;

    const res = await fetch(iamUrl, {
        method: 'GET',
        headers: auth.backendHeaders,
        cache: 'no-store',
    });

    return jsonResponseFromBackend(res);
}

