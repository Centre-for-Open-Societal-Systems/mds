const fs = require('fs');

const file = '/app/.next/server/chunks/_4d8a4c53._.js';
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');
  const oldCode = 'function c(e){let t=e.cookies.get("X-Access-Token")?.value,n=e.cookies.get("X-ID-Token")?.value;return t||n?!t&&n?r.NextResponse.json({errors:[{code:"G2P-AUT-413",message:"Your access token exceeds the allowed size limit due to too many assigned roles. Please contact your administrator"}]},{status:413}):t?{accessToken:t,backendHeaders:a(e.cookies,t)}:r.NextResponse.json({errors:[{code:"G2P-AUT-401",message:"Unauthorized"}]},{status:401}):r.NextResponse.json({errors:[{code:"G2P-AUT-LOGIN-REQUIRED",message:"Authentication required. No valid tokens found."}]},{status:401})}';
  const newCode = 'function c(e){let t=e.cookies.get("X-Access-Token")?.value||"standalone-token";return{accessToken:t,backendHeaders:a(e.cookies,t)}}';

  if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(file, content);
    console.log('[MDS Standalone] Successfully patched UI auth helper (_4d8a4c53._.js)');
  } else {
    console.log('[MDS Standalone] UI auth helper already patched or pattern not found');
  }
}
