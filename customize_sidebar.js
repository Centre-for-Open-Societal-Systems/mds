const fs = require('fs');

// 1. Update Server Chunk
const serverFile = '.next/server/chunks/ssr/[root-of-the-server]__4be6bc67._.js';
if (fs.existsSync(serverFile)) {
  let serverContent = fs.readFileSync(serverFile, 'utf8');
  const targetServerNav = 'l=[{href:"/",labelKey:"home",Icon:g},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:i},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:i},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:i},{href:"/datasets/INPUT_CATALOG",title:"Inputs",Icon:i},{href:"/geo-locations",labelKey:"geo_locations",Icon:h.MapPin},{href:"/datasets",title:"All Catalogs",Icon:i},{href:"/releases",labelKey:"releases",Icon:j},{href:"/changes",labelKey:"recent_changes",Icon:k}];';

  serverContent = serverContent.replace(
    /l=\[\{href:"\/",labelKey:"home".*?\}\];/,
    targetServerNav
  );
  serverContent = serverContent.replace(
    'let c,e="/"===(c=a.href)?"/"===g:g===c||g.startsWith(`${c}/`);',
    'let c,e="/"===(c=a.href)?"/"===g:"/datasets"===c?"/datasets"===g:g===c||g.startsWith(`${c}/`);'
  );
  serverContent = serverContent.replace(
    ',f(a.labelKey)]},a.href)',
    ',(a.title||f(a.labelKey))]},a.href)'
  );
  fs.writeFileSync(serverFile, serverContent);
  console.log('[Sidebar] Server chunk updated successfully with Crops, Livestock, Seeds!');
}

// 2. Update Client Chunk
const clientFile = '.next/static/chunks/b2ebbf2130917b8c.js';
if (fs.existsSync(clientFile)) {
  let clientContent = fs.readFileSync(clientFile, 'utf8');
  const targetClientNav = 'p=[{href:"/",labelKey:"home",Icon:l},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:s},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:s},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:s},{href:"/datasets/INPUT_CATALOG",title:"Inputs",Icon:s},{href:"/geo-locations",labelKey:"geo_locations",Icon:u.MapPin},{href:"/datasets",title:"All Catalogs",Icon:s},{href:"/releases",labelKey:"releases",Icon:c},{href:"/changes",labelKey:"recent_changes",Icon:f}];';

  clientContent = clientContent.replace(
    /p=\[\{href:"\/",labelKey:"home".*?\}\];/,
    targetClientNav
  );
  clientContent = clientContent.replace(
    'let r,n="/"===(r=e.href)?"/"===w:w===r||w.startsWith(`${r}/`);',
    'let r,n="/"===(r=e.href)?"/"===w:"/datasets"===r?"/datasets"===w:w===r||w.startsWith(`${r}/`);'
  );
  clientContent = clientContent.replace(
    ',k(e.labelKey)]},e.href)',
    ',(e.title||k(e.labelKey))]},e.href)'
  );
  fs.writeFileSync(clientFile, clientContent);
  console.log('[Sidebar] Client chunk updated successfully with Crops, Livestock, Seeds!');

  // 3. Cache-busting: Copy chunk to b2ebbf2130917b8c_v2.js and update manifests
  const cacheBustChunk = '.next/static/chunks/b2ebbf2130917b8c_v2.js';
  fs.writeFileSync(cacheBustChunk, clientContent);
  console.log('[Sidebar] Cache-busted chunk created:', cacheBustChunk);

  const manifestDir = '.next/server/app/[locale]';
  const manifestFiles = [
    `${manifestDir}/page_client-reference-manifest.js`,
    `${manifestDir}/reference-data/page_client-reference-manifest.js`,
    `${manifestDir}/reference-data/[attributeId]/page_client-reference-manifest.js`,
    `${manifestDir}/releases/page_client-reference-manifest.js`,
    `${manifestDir}/changes/page_client-reference-manifest.js`,
    `${manifestDir}/datasets/page_client-reference-manifest.js`,
    `${manifestDir}/datasets/[attributeId]/page_client-reference-manifest.js`,
    `${manifestDir}/geo-locations/page_client-reference-manifest.js`
  ];

  for (const f of manifestFiles) {
    if (fs.existsSync(f)) {
      let mc = fs.readFileSync(f, 'utf8');
      mc = mc.replaceAll('b2ebbf2130917b8c.js', 'b2ebbf2130917b8c_v2.js');
      fs.writeFileSync(f, mc);
    }
  }
  console.log('[Sidebar] All page client-reference manifests updated to v2 chunk!');
}

// 4. Disable immutable browser cache in Next.js router-server
const routerServerFile = 'node_modules/next/dist/server/lib/router-server.js';
if (fs.existsSync(routerServerFile)) {
  let rsc = fs.readFileSync(routerServerFile, 'utf8');
  if (rsc.includes("'public, max-age=31536000, immutable'")) {
    rsc = rsc.replace(
      "'public, max-age=31536000, immutable'",
      "'no-cache, no-store, must-revalidate'"
    );
    fs.writeFileSync(routerServerFile, rsc);
    console.log('[Sidebar] Next.js static cache headers patched to no-cache!');
  }
}
