const sources=[{path:'js/auth.js',line:115,note:'Profile verification, sign-in, reset, demo, sign-out and callback boot.'},{path:'js/app.js',line:48,note:'Authorized module loading and retry.'},{path:'js/permissions.js',line:6,note:'Admin and identical Engineer / Architect route permissions.'}];
module.exports=[{key:'authentication',title:'Authentication and session',roles:['admin','engineer','architect'],sources,notes:['Entry points include the sign-in screen, invitation/reset callbacks and account-menu logout. These are documented entry events, not an invented authenticated menu.','Existing sessions are checked by getSession and mcpa_my_profile. Invalid callbacks are rejected before workspace entry.'],actions:[
 {title:'Sign in or restore a session',steps:[
  {type:'io',text:'Open SiteTrace; enter email and password\nif an existing session is unavailable.'},
  {type:'process',text:'Use Auth getSession for restoration, or\nsignInWithPassword for submitted credentials.'},
  {type:'decision',text:'Authenticated session\navailable?',no:['No existing session: show normal sign-in.\nSubmitted login failure: show error and retry.'],retry:true},
  {type:'process',text:'Clear submitted password after sign-in;\nread mcpa_my_profile for the session user.'},
  {type:'decision',text:'Profile read succeeds?',no:['Show profile-verification error.\nCheck connection and sign in again.']},
  {type:'decision',text:'Active, supported\ncompany profile?',no:['Show unauthorized or inactive-account message;\ncontact Admin. Workspace remains closed.']},
  {type:'process',text:'Switch MovementStore to live mode; build\npermitted menus and initialize monitoring.'},
  {type:'io',text:'Open permitted initial route if supplied;\notherwise open Dashboard.'}
 ],outcome:'Authorized workspace opened'},
 {title:'Request password recovery',steps:[
  {type:'io',text:'Enter a valid email on sign-in;\nchoose Forgot password.'},
  {type:'decision',text:'Email passes native\nform validity?',no:['Browser requests a valid email.\nCorrect the email before continuing.'],retry:true},
  {type:'process',text:'Call resetPasswordForEmail with the email\nand root sign-in URL as redirect.'},
  {type:'decision',text:'Reset request succeeds?',no:['Show unable-to-request-reset message;\ncheck connection and retry.'],retry:true},
  {type:'io',text:'Show neutral confirmation: if the account\nexists, a reset link has been sent.'}
 ],outcome:'Await email callback'},
 {title:'Set password from invitation or reset',steps:[
  {type:'io',text:'Open invitation/reset email callback\nor resume pending password setup.'},
  {type:'decision',text:'Callback valid and\nsession available?',no:['Reject invalid/expired link; request\na fresh invitation or password reset.']},
  {type:'process',text:'Hide workspace; remember setup user/kind\nin sessionStorage and clean callback URL.'},
  {type:'io',text:'Enter new password (at least 12 characters);\nsubmit Set your password.'},
  {type:'decision',text:'Password meets native\nminimum length?',no:['Correct password; setup form remains open.'],retry:true},
  {type:'process',text:'Call Auth updateUser with new password.'},
  {type:'decision',text:'Password saved?',no:['Show save failure; check connection/password.\nExpired links require a fresh email link.'],retry:true},
  {type:'process',text:'Clear setup state and attempt local sign-out;\nfailed sign-out offers Retry sign out.'},
  {type:'io',text:'Show password-saved message;\nsign in with the new password.'}
 ],outcome:'Password setup completed'},
 {title:'Sign out and retry failed sign-out',steps:[
  {type:'io',text:'Choose Log Out in the account menu\nor Cancel and sign out during setup.'},
  {type:'process',text:'Clear profile, application, navigation and\nsetup/demo session flags; show sign-in.'},
  {type:'process',text:'Call Auth signOut with local scope.'},
  {type:'decision',text:'Sign-out confirmed?',no:['Show unconfirmed sign-out and Retry sign out.\nUse that button to repeat local sign-out.'],retry:true,retryTarget:'previous-process'},
  {type:'io',text:'Display signed-out confirmation.'}
 ],outcome:'Local session ended'},
 {title:'Use and exit offline demonstration',steps:[
  {type:'io',text:'Choose Try offline demo; select Admin,\nEngineer or Architect sample identity.'},
  {type:'process',text:'Set sample profile and demo role in\nsessionStorage; use browser-only demo store.'},
  {type:'io',text:'Open demo Dashboard. Users, Consumables and\nPurchases are blocked in demo mode.'},
  {type:'process',text:'Perform supported sample workflows locally;\nno live credentials or database writes.'},
  {type:'io',text:'Choose Exit demo in account menu.'},
  {type:'process',text:'Clear demo session role and workspace;\nretain browser sample records.'},
  {type:'io',text:'Show Demo closed on sign-in screen.'}
 ],outcome:'Demo session ended'},
 {title:'Handle session boot and revalidation',steps:[
  {type:'process',text:'On boot, request Auth session; on focus,\nAuth storage change or 60-second check, verify session.'},
  {type:'decision',text:'Session service\nresponds?',no:['On boot show service-load error; refresh.\nOffline demonstration remains available.']},
  {type:'decision',text:'Authenticated session\nstill exists?',no:['Clear workspace and navigation;\nshow sign-in after session ends.']},
  {type:'process',text:'Recheck mcpa_my_profile; refresh account UI\nor rebuild workspace for changed identity/role.'},
  {type:'decision',text:'Profile verification\nsucceeds?',no:['Close workspace; show verification,\ninactive-account or authorization feedback.']},
  {type:'io',text:'Continue authorized workspace.'}
 ],outcome:'Session state reconciled'},
 {title:'Load authorized module and retry loading',steps:[
  {type:'io',text:'Select module, detail link or browser-history\nroute from the workspace.'},
  {type:'decision',text:'Role can access route?',no:['Show Access restricted with Return to workspace.\nDo not load the restricted module.']},
  {type:'process',text:'Reuse active module, or load mapped module\nHTML, CSS and script; dispose previous views.'},
  {type:'decision',text:'HTML and script load?',no:['Show Unable to load this screen and Retry.\nRetry repeats the requested route.'],retry:true},
  {type:'process',text:'Render the requested view; preserve\ncurrent route context and navigation history.'},
  {type:'io',text:'Display authorized module or detail screen.'}
 ],outcome:'Module rendered'}
]}];
