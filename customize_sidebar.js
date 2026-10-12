const fs = require('fs');

// 1. Update Server Chunk
const serverFile = '.next/server/chunks/ssr/[root-of-the-server]__4be6bc67._.js';
let serverContent = fs.readFileSync(serverFile, 'utf8');

const oldServerNav = 'l=[{href:"/",labelKey:"home",Icon:g},{href:"/datasets",labelKey:"reference_data",Icon:i},{href:"/geo-locations",labelKey:"geo_locations",Icon:h.MapPin},{href:"/releases",labelKey:"releases",Icon:j},{href:"/changes",labelKey:"recent_changes",Icon:k}];';
const newServerNav = 'l=[{href:"/",labelKey:"home",Icon:g},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:i},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:i},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:i},{href:"/datasets",title:"All Catalogs",Icon:i},{href:"/geo-locations",labelKey:"geo_locations",Icon:h.MapPin},{href:"/releases",labelKey:"releases",Icon:j},{href:"/changes",labelKey:"recent_changes",Icon:k}];';

if (serverContent.includes(oldServerNav)) {
  serverContent = serverContent.replace(oldServerNav, newServerNav);
  serverContent = serverContent.replace(
    'let c,e="/"===(c=a.href)?"/"===g:g===c||g.startsWith(`${c}/`);',
    'let c,e="/"===(c=a.href)?"/"===g:"/datasets"===c?"/datasets"===g:g===c||g.startsWith(`${c}/`);'
  );
  serverContent = serverContent.replace(
    ',f(a.labelKey)]},a.href)',
    ',(a.title||f(a.labelKey))]},a.href)'
  );
  fs.writeFileSync(serverFile, serverContent);
  console.log('Server chunk updated successfully!');
} else {
  console.log('Server old nav string not found or already updated.');
}

// 2. Update Client Chunk
const clientFile = '.next/static/chunks/b2ebbf2130917b8c.js';
let clientContent = fs.readFileSync(clientFile, 'utf8');

const oldClientNav = 'p=[{href:"/",labelKey:"home",Icon:l},{href:"/datasets",labelKey:"reference_data",Icon:s},{href:"/geo-locations",labelKey:"geo_locations",Icon:u.MapPin},{href:"/releases",labelKey:"releases",Icon:c},{href:"/changes",labelKey:"recent_changes",Icon:f}];';
const newClientNav = 'p=[{href:"/",labelKey:"home",Icon:l},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:s},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:s},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:s},{href:"/datasets",title:"All Catalogs",Icon:s},{href:"/geo-locations",labelKey:"geo_locations",Icon:u.MapPin},{href:"/releases",labelKey:"releases",Icon:c},{href:"/changes",labelKey:"recent_changes",Icon:f}];';

if (clientContent.includes(oldClientNav)) {
  clientContent = clientContent.replace(oldClientNav, newClientNav);
  clientContent = clientContent.replace(
    'let r,n="/"===(r=e.href)?"/"===w:w===r||w.startsWith(`${r}/`);',
    'let r,n="/"===(r=e.href)?"/"===w:"/datasets"===r?"/datasets"===w:w===r||w.startsWith(`${r}/`);'
  );
  clientContent = clientContent.replace(
    ',k(e.labelKey)]},e.href)',
    ',(e.title||k(e.labelKey))]},e.href)'
  );
  fs.writeFileSync(clientFile, clientContent);
  console.log('Client chunk updated successfully!');
} else {
  console.log('Client old nav string not found or already updated.');
}
