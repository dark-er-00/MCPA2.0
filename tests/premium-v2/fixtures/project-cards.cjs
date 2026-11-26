// Demonstration records only. These image associations have no real-project meaning.
const {randomUUID} = require('node:crypto');

exports.seed = function seed({sites, actors, site}) {
  sites.architect.name = 'Studio Field Office';
  const rows = [
    [601, 'Architectural Study 01', 'Marilao, Bulacan', 'sky', 'Planning/Designing', 'project-10.jpg'],
    [602, 'Architectural Study 02', 'Guiguinto, Bulacan', 'architect', 'Construction Phase', 'project-7.webp'],
    [603, 'Courtyard Handover', 'San Rafael, Bulacan', 'sky', 'Turnover'],
    [604, 'East Annex', 'Malolos, Bulacan', null, null],
    [605, 'Garden Workshop', 'Plaridel, Bulacan', 'pau', 'Permitting'],
    [606, 'Groundworks Pavilion', 'Santa Maria, Bulacan', 'architect', 'Groundbreaking'],
    [607, 'Hillside Study', 'Pandi, Bulacan', 'pau', ' planning / designing '],
    [608, 'Library and Community Resource Center for the North River District', 'Upper Riverside Road, Barangay San Isidro, Municipality of San Rafael, Bulacan', 'sky', 'Construction Phase'],
    [609, 'River Archive', 'Baliwag, Bulacan', 'sky', 'Turnover'],
    [610, 'West Extension', 'Bocaue, Bulacan', 'pau', 'Unverified legacy phase']
  ];
  for (const [number, name, location, owner, project_stage, file] of rows) {
    const record = {...site(number, name, actors[owner]), location, project_stage};
    if (file) record.project_photo_url = 'assets/images/login-slideshow/' + file;
    if (number === 604) record.assigned_engineer = 'Former display name';
    if (number === 609) Object.assign(record, {is_active:false, archived_at:'2026-11-15T01:00:00Z'});
    sites[record.id] = record;
  }
};

// Only the opt-in, memory-backed review server calls this form adapter.
exports.save = function save({sites, actors, history, person, args, error}) {
  if (person.role !== 'admin') error('Admin required.', '42501');
  const previous = Object.values(sites).find(row => row.id === args.p_id);
  if (args.p_id && (!previous || previous.project_version !== args.p_version))
    error('Project changed. Reload and retry.', '40001');
  const patch = args.p_patch || {};
  const allowed = ['name','location','assigned_engineer_id','project_stage','current_work_area','status','last_inventory_check','construction_work_areas','is_active'];
  if (Object.keys(patch).some(key => !allowed.includes(key))) error('Unsupported project field.');
  const record = {...(previous || {id:randomUUID(), is_active:true, archived_at:null, status:'planning'}), ...patch};
  const owner = Object.values(actors).find(actor => actor.id === record.assigned_engineer_id);
  if (!previous || record.assigned_engineer_id !== previous.assigned_engineer_id) {
    if (!owner || owner.account_status !== 'active' || !['engineer','architect'].includes(owner.role))
      error('Select an active Engineer / Architect.');
    record.assigned_engineer = owner.name;
  }
  if (!record.name?.trim() || !record.location?.trim()) error('Enter the project name and location.');
  if ('is_active' in patch) {
    if (!previous || typeof patch.is_active !== 'boolean') error('Invalid archive state.');
    record.archived_at = patch.is_active ? null : previous.archived_at || new Date().toISOString();
  }
  record.project_version = (previous?.project_version || 0) + 1;
  const types = previous ? ['details'] : ['created'];
  if (previous && previous.assigned_engineer_id !== record.assigned_engineer_id) types.push('assignment');
  history.unshift({id:randomUUID(), project_id:record.id, changed_at:new Date().toISOString(),
    change_types:types, actor_id:person.id, actor_name:person.name, before_values:previous ? {...previous} : {},
    after_values:{...record}, reason:args.p_reason || null});
  if (previous) Object.assign(previous, record);
  else sites[record.id] = record;
  return record;
};
