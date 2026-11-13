/* ============================================================
   MASTERLIST DATA
   Shared application data used by module scripts.
   ============================================================ */
const TOOLS = [
  {id:"GRD-001", name:"Grinder", cat:"Power Tool", brand:"Bosch", qty:1, site:"San Gabriel", holder:"Mark Reyes", status:"inuse", acquired:"Mar 12, 2026"},
  {id:"GRD-002", name:"Grinder", cat:"Power Tool", brand:"Bosch", qty:1, site:"Casa Buena", holder:"—", status:"available", acquired:"Mar 12, 2026"},
  {id:"GRD-004", name:"Grinder", cat:"Power Tool", brand:"Makita", qty:1, site:"Casa Buena", holder:"—", status:"repair", acquired:"Apr 02, 2026"},
  {id:"GRD-009", name:"Grinder", cat:"Power Tool", brand:"Bosch", qty:1, site:"Metropolis", holder:"John Kiel", status:"missing", acquired:"May 18, 2026"},
  {id:"BRN-001", name:"Barena (Post Hole Digger)", cat:"Hand Tool", brand:"Stanley", qty:1, site:"San Gabriel", holder:"—", status:"available", acquired:"Feb 20, 2026"},
  {id:"BRN-004", name:"Barena (Post Hole Digger)", cat:"Hand Tool", brand:"Stanley", qty:1, site:"Metropolis", holder:"Engineer B", status:"inuse", acquired:"Feb 20, 2026"},
  {id:"CMP-001", name:"Compressor", cat:"Power Tool", brand:"Hitachi", qty:1, site:"Casa Buena", holder:"—", status:"repair", acquired:"Jan 15, 2026"},
  {id:"CMP-002", name:"Compressor", cat:"Power Tool", brand:"Hitachi", qty:1, site:"Riverside Warehouse", holder:"—", status:"underrepair", acquired:"Jan 15, 2026"},
  {id:"CRS-004", name:"Circular Saw", cat:"Power Tool", brand:"DeWalt", qty:1, site:"Casa Buena", holder:"Team Carpentry", status:"inuse", acquired:"Jun 01, 2026"},
  {id:"CRS-011", name:"Circular Saw", cat:"Power Tool", brand:"DeWalt", qty:1, site:"Casa Buena", holder:"Team Carpentry", status:"missing", acquired:"Jun 01, 2026"},
  {id:"BRC-002", name:"Bar Cutter", cat:"Power Tool", brand:"Makita", qty:1, site:"Casa Buena", holder:"Mark Reyes", status:"inuse", acquired:"Mar 28, 2026"},
  {id:"BRC-005", name:"Bar Cutter", cat:"Power Tool", brand:"Makita", qty:1, site:"Riverside Warehouse", holder:"—", status:"repair", acquired:"Mar 28, 2026"},
  {id:"WLD-002", name:"Welding Machine", cat:"Power Tool", brand:"Lincoln Electric", qty:1, site:"Riverside Warehouse", holder:"—", status:"repair", acquired:"Jul 09, 2026"},
  {id:"CVB-001", name:"Concrete Vibrator", cat:"Power Tool", brand:"Wacker Neuson", qty:1, site:"Casa Buena", holder:"John Kiel", status:"inuse", acquired:"May 02, 2026"},
  {id:"SCF-010", name:"Scaffolding Set", cat:"Structural", brand:"Generic", qty:5, site:"Casa Buena", holder:"—", status:"available", acquired:"Jan 05, 2026"},
  {id:"JHM-003", name:"Jackhammer", cat:"Power Tool", brand:"Bosch", qty:1, site:"Northgate Depot", holder:"—", status:"available", acquired:"Feb 11, 2026"},
];

const STATUS_LABEL = window.MCPADisplay.statuses.equipment;
