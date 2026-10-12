const fs = require('fs');

// 1. Update Server Chunk
const serverFile = '.next/server/chunks/ssr/[root-of-the-server]__4be6bc67._.js';
let serverContent = fs.readFileSync(serverFile, 'utf8');

// The current newServerNav has All Catalogs before geo-locations:
const currentServerNav = 'l=[{href:"/",labelKey:"home",Icon:g},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:i},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:i},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:i},{href:"/datasets",title:"All Catalogs",Icon:i},{href:"/geo-locations",labelKey:"geo_locations",Icon:h.MapPin},{href:"/releases",labelKey:"releases",Icon:j},{href:"/changes",labelKey:"recent_changes",Icon:k}];';
const reorderedServerNav = 'l=[{href:"/",labelKey:"home",Icon:g},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:i},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:i},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:i},{href:"/geo-locations",labelKey:"geo_locations",Icon:h.MapPin},{href:"/datasets",title:"All Catalogs",Icon:i},{href:"/releases",labelKey:"releases",Icon:j},{href:"/changes",labelKey:"recent_changes",Icon:k}];';

if (serverContent.includes(currentServerNav)) {
  serverContent = serverContent.replace(currentServerNav, reorderedServerNav);
  fs.writeFileSync(serverFile, serverContent);
  console.log('Server chunk reordered successfully!');
} else {
  console.log('Server chunk nav string not matched');
}

// 2. Update Client Chunk
const clientFile = '.next/static/chunks/b2ebbf2130917b8c.js';
let clientContent = fs.readFileSync(clientFile, 'utf8');

const currentClientNav = 'p=[{href:"/",labelKey:"home",Icon:l},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:s},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:s},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:s},{href:"/datasets",title:"All Catalogs",Icon:s},{href:"/geo-locations",labelKey:"geo_locations",Icon:u.MapPin},{href:"/releases",labelKey:"releases",Icon:c},{href:"/changes",labelKey:"recent_changes",Icon:f}];';
const reorderedClientNav = 'p=[{href:"/",labelKey:"home",Icon:l},{href:"/datasets/CROP_CATALOG",title:"Crops",Icon:s},{href:"/datasets/LIVESTOCK_CATALOG",title:"Livestock",Icon:s},{href:"/datasets/SEED_CATALOG",title:"Seeds",Icon:s},{href:"/geo-locations",labelKey:"geo_locations",Icon:u.MapPin},{href:"/datasets",title:"All Catalogs",Icon:s},{href:"/releases",labelKey:"releases",Icon:c},{href:"/changes",labelKey:"recent_changes",Icon:f}];';

if (clientContent.includes(currentClientNav)) {
  clientContent = clientContent.replace(currentClientNav, reorderedClientNav);
  fs.writeFileSync(clientFile, clientContent);
  console.log('Client chunk reordered successfully!');
} else {
  console.log('Client chunk nav string not matched');
}
