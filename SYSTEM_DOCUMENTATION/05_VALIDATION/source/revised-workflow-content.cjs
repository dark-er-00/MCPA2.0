// Documentation model only. Labels are source-reviewed, not executable app behavior.
const t=text=>({type:'terminator',text});
const p=text=>({type:'process',text});
const io=text=>({type:'io',text});
const end=text=>t('End · '+text);
const stop=(message,result='Attempt ends')=>[io(message),end(result)];
const q=(text,no,yes='Yes',noLabel='No')=>({type:'decision',text,no,yes,noLabel});
const circle=(ref,direction)=>({type:'onpage',text:ref,ref,direction});
const off=(ref,page,direction,context)=>({type:'offpage',ref,page,direction,text:`${ref} · ${direction==='out'?'To':'From'} page ${page}\n${context}`});
const page=(title,nodes,note='',extras=[])=>({title,nodes,note,extras});
const flow=(stem,title,sources,pages)=>({stem:stem+'_Revised',title,sources,pages});
const auth=['js/auth.js','js/permissions.js','index.html'];
const core=['js/movement-cloud.js','js/permissions.js','supabase/migrations/202610060002_recipient_identity.sql'];
const portal='supabase/migrations/202610100001_engineer_portal.sql';
const office='supabase/migrations/202610120002_office_returns.sql';
const cancel='supabase/migrations/202610100004_movement_cancellation.sql';
const guarded=question=>q(question,stop('Show permission,\nvalidation or conflict\nmessage to the user.','No change saved'));
const refresh=()=>q('Records refreshed?',stop('Show saved-success\nwarning. Block new\nchanges until reload.','Saved; reload needed'));
module.exports=[
 flow('01_Authentication','User authentication and login',auth,[
  page('Credentials and session',[
   t('Start · Open SiteTrace login'),circle('A','in'),io('Enter email and password;\nsubmit the login form.'),p('Call Supabase Auth sign-in\nwith the supplied credentials.'),
   q('Sign-in successful?',[io('Show credential, email\nconfirmation or network\nerror; retain login form.'),circle('A','out')]),
   p('Clear the password field;\nload the authenticated session.'),off('B',2,'out','Validate company profile')
  ],'A returns to credential entry after an unsuccessful sign-in. Existing sessions resume on page 2.'),
  page('Company profile and role destination',[
   off('B',1,'in','Authenticated session'),p('Read the current company profile\nusing mcpa_my_profile.'),
   q('Profile active and\nrole supported?',stop('Show access-unavailable\nmessage on login.\nDo not enter the app.','Access denied')),
   q('Role is Secretary?',[p('Enter dashboard for\nAdmin, Engineer, Architect\nor Tool Handler.'),end('Role home opened')]),
   p('Enter the consumables module\nfor the Secretary role.'),end('Role home opened')
  ],'Offline demo is browser-only and documented separately. UI routing does not replace backend authorization.')
 ]),
 flow('02_Equipment_Registration','Equipment registration',[
  '1-admin/modules/masterlist/masterlist.js','js/equipment-photos.js','js/equipment-tracking.js','supabase/migrations/202610120004_equipment_office_default.sql'
 ],[
  page('New item and verified Office',[
   t('Start · Admin adds equipment'),io('Enter equipment metadata, tracking type,\nwhole-record quantity and optional photo.'),
   guarded('Active Admin and\nvalid item form?'),p('Allocate a stable asset ID (T-…)\nand internal UUID for this new item.'),
   p('Resolve and verify the configured\nactive inventory Office.'),q('Office verified?',stop('Show Office configuration\nerror; preserve the form.','Item not inserted')),off('A',2,'out','Prepare optional photo')
  ],'New-item path only. Existing-item editing preserves its existing assignment; this diagram does not reassign inventory.'),
  page('Optional private photograph',[
   off('A',1,'in','Office already verified'),
   q('Photograph selected?',[circle('B','out')]),
   p('Validate JPEG / PNG / WebP signature\nand size (1 byte–5 MiB); prepare\nprivate immutable upload or staged reuse.'),
   q('Photo preparation\nsuccessful?',stop('Show photo error;\nkeep the form and\nstaged state for retry.','Item not inserted')),
   circle('B','in'),off('C',3,'out','Insert the new equipment record')
  ],'B joins the no-photo path with the completed-photo path. Office validation occurs before any photo preparation.'),
  page('Insert, verify and refresh',[
   off('C',2,'in','Metadata and optional photo ready'),p('Recheck active screen and Admin identity;\ninsert AVAILABLE equipment with\nexplicit Office site_id and stable asset_id.'),
   q('Save and returned\nIDs verified?',stop('Keep the form. Read\nexisting records before\nretry if save is uncertain.','Save needs checking')),
   p('Close the form and refresh inventory.'),q('Inventory refreshed?',stop('Show: item saved;\nrefresh failed. Reload\nthe inventory list.','Saved; reload needed')),io('Display the saved equipment in inventory.'),end('Registration complete')
  ],'A response/verification failure is not proof that no insert occurred. Preserve data and reconcile before retry.')
 ]),
 flow('03_Equipment_Request_Approval','Equipment request and approval',[
  ...core,portal,'supabase/migrations/202610120003_optional_request_purpose.sql'
 ],[
  page('Field request submission',[
   t('Start · Engineer / Architect requests'),io('Choose own active assigned project,\nAVAILABLE unheld tools and optional\npurpose / needed-until date.'),
   guarded('Role, assignment and\nrequest data valid?'),p('Create Pending request using\na reusable operation UUID.\nStock and custody remain unchanged.'),
   q('Request saved?',stop('Show failure; reload\nstate before retrying\nthe same operation.','Request not confirmed')),off('A',2,'out','Admin reviews Pending request')
  ],'Select whole equipment records; no partial quantity requests. Pending requests do not reserve equipment.'),
  page('Admin approval or rejection',[
   off('A',1,'in','Pending request'),io('Admin reviews the request and\nselects approval or rejection.'),
   guarded('Active Admin and\nrequest still Pending?'),
   q('Approve request?',[off('B',3,'out','Record rejection reason')]),
   p('Revalidate availability and competing\nlocks; atomically reserve every item\nand save Approved, or roll back.'),
   q('Approval committed?',stop('Show conflict / error;\nrefresh the request\nand inventory.','No approval saved')),end('Approved; ready for release')
  ],'Approval creates reservations; it does not change equipment holder or site. Rejection reserves nothing.'),
  page('Required rejection reason',[
   off('B',2,'in','Admin chooses rejection'),io('Enter a required rejection reason\n(maximum 2,000 characters).'),guarded('Reason valid and\nrequest still Pending?'),p('Atomically mark request Rejected\nand record the rejection reason.'),q('Rejection committed?',stop('Show error / conflict;\nreload request before\nretrying operation.','No rejection saved')),io('Display Rejected request and reason.'),end('Request rejected')
  ],'Rejecting a Pending request creates no inventory reservation and changes no custody.')
 ]),
 flow('04_Equipment_Release_Assignment','Equipment release and assignment',core,[
  page('Approved request to pending handover',[
   t('Start · Admin releases Approved request'),io('Review approved items and\nthe named Engineer / Architect receiver.'),
   guarded('Admin, receiver and\nreservations valid?'),p('Atomically create Pending transfer with\nsource snapshots; rebind reservations\nto it and mark request Released.'),
   q('Release committed?',stop('Show conflict / failure;\nreload current state\nbefore retry.','Release not saved')),off('A',2,'out','Publish pending assignment')
  ],'The release operation is atomic and idempotent. An approved request alone is not evidence of a physical handover.'),
  page('Pending handover and UI state',[
   off('A',1,'in','Committed release'),p('Reload movement records for the UI.'),refresh(),io('Display Pending handover for\nthe named receiver to inspect.'),end('Await receiver confirmation')
  ],'Equipment holder, site and status remain unchanged until receipt. See workflow 06 for the separate receipt transaction.')
 ]),
 flow('05_QR_Equipment_Transfer','QR-based equipment transfer',[
  ...core,portal,'2-engr/modules/transfers/transfers.js'
 ],[
  page('Resolve the named receiver',[
   t('Start · Field sender or Tool Handler'),io('Choose receiver / active destination\nmanually, or scan a receiver QR.'),
   q('Receiver QR used?',[circle('A','out')]),p('Resolve the token hash; check expiry,\nrevocation, active field receiver and\ncurrent destination assignment.'),
   q('QR resolves correctly?',stop('Show invalid / expired\nQR message; obtain\na fresh code.','No transfer created')),circle('A','in'),off('B',2,'out','Validate transfer and submit')
  ],'A joins manual selection with resolved QR selection. Receiver creates a 15-minute token for an assigned active site; QR itself moves no stock.'),
  page('Select eligible assets and create handover',[
   off('B',1,'in','Named receiver and destination'),io('Select whole equipment records;\nreview the outgoing handover.'),
   guarded('Sender, destination and\nassets eligible?'),p('Create Pending transfer with source\nsnapshots and exclusive reservations;\nretain equipment custody and status.'),
   q('Transfer committed?',stop('Show validation /\nreservation conflict;\nreload state for retry.','No transfer saved')),p('Refresh movement records.'),refresh(),end('Await named receiver inspection')
  ],'Engineer / Architect sends own held IN_USE tools. Tool Handler sends eligible AVAILABLE unheld stock; no named receipt authority.')
 ]),
 flow('06_Transfer_Receipt','Transfer receipt and confirmation',core,[
  page('Named receiver and complete inspection',[
   t('Start · Receiver opens handover'),io('Named field receiver inspects each tool:\nGood, Damaged or Missing; test every\nnon-missing tool and record required notes.'),
   guarded('Named receiver and\ncomplete inspection?'),p('Recheck Pending state, reservation\nand unchanged source holder, site,\nstatus and whole-record quantity.'),
   q('Source state still valid?',stop('Show stale / conflict\nmessage. Reload and\ninspect current state.','Receipt not saved')),off('A',2,'out','Apply each inspection atomically')
  ],'Damaged acceptance requires explicit custody acceptance. The backend enforces receiver identity; Admin cannot substitute.'),
  page('Classify each inspected equipment record',[
   off('A',1,'in','Validated receipt transaction'),circle('D','in'),
   q('Item marked Missing?',[off('B',3,'out','Non-missing inspection')]),p('Set MISSING and open missing case;\nretain the source holder and site.'),circle('C','in'),
   q('More inspected items?',[off('E',4,'out','Finalize the receipt')]),circle('D','out')
  ],'D repeats classification for the next item. C joins items from page 3. All item effects commit together.',[
   [off('C',3,'in','Good / damaged item classified'),circle('C','out')]
  ]),
  page('Good or accepted-damaged classification',[
   off('B',2,'in','Non-missing item'),
   q('Item marked Damaged?',[p('Assign receiver and\ndestination; set IN_USE.'),circle('F','out')]),
   p('Assign receiver and destination;\nset REPAIR and open a repair case.'),circle('F','in'),off('C',2,'out','Continue at connector C')
  ],'F merges Good and accepted-damaged outcomes. Page 2 then selects the next item or completes the transaction.'),
  page('Receipt outcome',[
   off('E',2,'in','All item inspections applied'),p('Mark transfer Received and linked\nrequest Received; release reservations;\nrecord activity using the operation UUID.'),
   q('Transaction committed?',stop('Roll back all item\nchanges; show error\nand reload state.','Receipt not saved')),p('Refresh movement records.'),refresh(),end('Receipt saved')
  ],'Missing tools retain source custody; Good and accepted-damaged tools transfer to the named receiver. A refresh failure does not undo receipt.')
 ]),
 flow('07_Office_Return_Receiving','Equipment return and Office receiving',[
  ...core,office,'2-engr/modules/returns/returns.js'
 ],[
  page('Office destination and return inspection',[
   t('Start · Engineer / Architect returns tools'),p('Read the pinned, active, uniquely\nconfigured inventory Office destination.'),
   q('Office configuration valid?',stop('Show Office setup error;\ncontact Admin and\nretain the form.','No return saved')),io('Select own held IN_USE tools; inspect\nGood / Damaged / Missing and supply\nrequired condition notes.'),
   guarded('Actor, assets and\ninspections valid?'),off('A',2,'out','Apply return classifications')
  ],'Backend rejects forged destinations. No QR receipt or separate Admin acceptance stage exists for Office returns.'),
  page('Physical return or missing record',[
   off('A',1,'in','Validated return transaction'),circle('D','in'),
   q('Item marked Missing?',[off('B',3,'out','Physically returned item')]),p('Set MISSING and open missing case;\nretain the source holder and site.'),circle('C','in'),
   q('More return items?',[off('E',4,'out','Commit return and refresh')]),circle('D','out')
  ],'D repeats classification for the next item. C joins completed classifications. The return is one atomic operation.',[
   [off('C',3,'in','Good / damaged item classified'),circle('C','out')]
  ]),
  page('Good or damaged physical return',[
   off('B',2,'in','Physical Office return'),
   q('Item marked Damaged?',[p('Move to Office; clear\nholder; set AVAILABLE.'),circle('F','out')]),
   p('Move to Office; clear personal holder;\nset REPAIR and open a repair case.'),circle('F','in'),off('C',2,'out','Continue at connector C')
  ],'Damaged physical returns clear personal custody in the Office-return wrapper. Missing tools never move to Office through this path.'),
  page('Atomic return and refreshed records',[
   off('E',2,'in','All return items classified'),p('Save the return and activity together\nunder the reusable operation UUID;\ncommit all classified item updates.'),
   q('Return committed?',stop('Roll back item changes;\nshow failure and\nreload current state.','Return not saved')),p('Refresh movement records.'),refresh(),end('Return received and recorded')
  ],'A retry reuses the saved operation identity and historical destination. There is no pending-return approval state.')
 ]),
 flow('08_Equipment_Repair','Equipment repair',core,[
  page('Field report',[
   t('Start · Field holder reports repair'),io('Select own eligible IN_USE equipment\nand enter required repair notes.'),guarded('Held asset, role and\nnotes valid?'),
   p('Atomically create Reported repair case\nand set equipment REPAIR; retain\ncurrent holder and site.'),q('Report committed?',stop('Show failure; reload\ncurrent state before\nretrying operation.','No report saved')),off('A',2,'out','Admin handles repair case')
  ],'Damaged transfer receipts and Office returns can also create repair cases. Their custody rules remain those of the originating workflow.'),
  page('Admin repair lifecycle',[
   off('A',1,'in','Reported repair case'),io('Admin reviews the Reported case\nand starts the repair.'),
   guarded('Admin and Reported\ncase still valid?'),p('Save case as Under repair.\nEquipment remains in REPAIR status.'),q('Start-repair committed?',stop('Show failure / conflict;\nreload case before\nretrying operation.','Repair not started')),off('B',3,'out','Complete the repair later')
  ],'Starting repair does not mark equipment AVAILABLE. Physical repair work happens before completion is recorded.'),
  page('Admin completion',[
   off('B',2,'in','Under repair case'),io('After the work, Admin confirms\ncompletion and the recorded destination.'),guarded('Admin and Under repair\ncase still valid?'),p('Atomically complete the case, clear\npersonal holder and set equipment\nAVAILABLE at the recorded destination.'),q('Completion committed?',stop('Show failure / conflict;\nreload case before\nretrying operation.','Not completed')),p('Refresh movement records.'),refresh(),end('Repair completed')
  ],'Start and completion are separate validated, idempotent actions. A refresh failure after commit does not undo completion.')
 ]),
 flow('09_Missing_Recovery','Missing equipment and recovery',core,[
  page('Field missing report',[
   t('Start · Field holder reports missing'),io('Select own eligible IN_USE equipment\nand enter required missing notes.'),guarded('Actor, held asset\nand notes valid?'),
   p('Atomically create missing case and\nset MISSING; retain source holder/site.'),q('Report committed?',stop('Show failure and reload\nstate before retrying\nthe same operation.','No report saved')),off('A',2,'out','Admin records recovery')
  ],'Missing inspections during transfer receipt or return also open missing cases and retain the source holder/site.'),
  page('Admin recovery and resulting condition',[
   off('A',1,'in','Open missing case'),io('Admin records recovery destination,\nGood / Damaged condition and damage\nnotes when applicable.'),guarded('Admin, missing case\nand data valid?'),
   q('Recovered as Damaged?',[p('Clear holder; assign\ndestination; set\nequipment AVAILABLE.'),circle('D','out')]),
   p('Clear holder; assign destination;\nset REPAIR and create linked repair case.'),circle('D','in'),off('C',3,'out','Commit recovered equipment')
  ],'Classification and case completion belong to one recovery transaction; the changes shown here are not committed separately.'),
  page('Recovery transaction outcome',[
   off('C',2,'in','Recovery classification prepared'),p('Mark missing case Recovered and save\nclassification, equipment updates and\nactivity in one atomic operation.'),
   q('Recovery committed?',stop('Roll back classification\nand case changes;\nshow error and reload.','Recovery not saved')),p('Refresh movement records.'),refresh(),end('Recovery recorded')
  ],'Recovered damaged equipment continues through the repair lifecycle. Good recovery makes the equipment AVAILABLE.')
 ]),
 flow('10_Consumables_Procurement','Consumables procurement and receipt',[
  '1-admin/modules/consumables/consumables.js','1-admin/modules/consumables/setup.sql','supabase/migrations/202610040001_authenticated_access.sql'
 ],[
  page('Create stock request',[
   t('Start · Admin / Secretary requests stock'),io('Choose item; enter positive quantity\n(up to 3 decimals), purpose, requester\nand optional needed-by date.'),
   guarded('Authorized and no open\nrequest for this item?'),p('Create Pending request with stable ID.\nDo not increase stock; no separate\napproval state is implemented.'),q('Request saved?',stop('Show validation /\nconflict error; refresh\nrequest records.','No request confirmed')),off('A',2,'out','Record a physical receipt')
  ],'One Pending / Partially received request per item. Purchase ledger recording is separate (workflow 13) and does not receive stock.'),
  page('Receive quantity and retain outstanding balance',[
   off('A',1,'in','Pending / partially received request'),circle('D','in'),io('After physical delivery, enter received\nquantity and note for this request.'),
   guarded('Quantity positive and\nwithin outstanding?'),p('Validate role/version and lock item then\nrequest; atomically add stock and receipt\nhistory using the operation UUID.'),
   off('C',3,'out','Check commit and outstanding quantity')
  ],'D returns to quantity entry for a later delivery. Already received stock stays recorded when outstanding procurement is canceled.',[
   [off('B',3,'in','Later partial delivery'),circle('D','out')]
  ]),
  page('Complete or continue procurement',[
   off('C',2,'in','Stock receipt operation'),q('Receipt committed?',stop('Show conflict / error;\nreload quantities and\nretry stable operation.','Receipt not saved')),p('Refresh the saved stock and\nrequest quantities from the backend.'),
   q('Request fully received?',[io('Display Partially\nreceived and remaining\noutstanding quantity.'),off('B',2,'out','Later delivery; enter quantity')]),
   io('Display Received request status\nand updated stock balance.'),end('Procurement fulfilled')
  ],'A receipt increases stock. Saving a supplier purchase record does not. Cancellation is documented in workflow 11.')
 ]),
 flow('11_Cancellation_Refusal','Controlled cancellation and refusal',[
  ...core,cancel,'1-admin/modules/consumables/setup.sql','supabase/migrations/202610040001_authenticated_access.sql'
 ],[
  page('Optional field interruption controls',[
   t('Start · Field user opens allowed action'),p('Load current scoped snapshot and\nserver-provided allowedActions.'),
   guarded('Installed action, owner\nand state permit it?'),io('Choose withdrawal, reservation cancel,\ntransfer cancel, refusal or reopen;\nconfirm and enter required reason.'),
   q('Refuse a handover?',[off('B',3,'out','Other permitted field actions')]),off('A',2,'out','Refuse the complete handover')
  ],'These field controls depend on the cancellation migration/capability. Admin and Tool Handler do not gain these interruption powers.'),
  page('Named receiver refuses the entire transfer',[
   off('A',1,'in','Named receiver refusal'),io('Inspect every tool; decline custody\nfor at least one Damaged tool.\nConfirm refusal; enter reason and notes.'),
   guarded('Receiver, inspection and\nPending state valid?'),p('Atomically save Refused transfer\nand immutable refusal evidence.\nRetain custody, status and reservations.'),
   q('Refusal committed?',stop('Show failure / conflict;\nreload the handover\nbefore retry.','No refusal saved')),io('Display Refused status. Original field\nsender may reopen; eligible originator\nmay cancel using allowedActions.'),end('Entire handover refused')
  ],'Refusal is not partial receipt and does not transfer custody. Initial request releases are subject to the receiver-owned rules.'),
  page('Cancel, withdraw or reopen field records',[
   off('B',1,'in','Permitted field action'),p('Validate original actor, record state\nand action-specific ownership again.'),
   guarded('Action remains allowed?'),p('Apply selected action atomically:\nwithdraw Pending request; cancel Approved\nreservation or Pending / Refused transfer;\nor reopen Refused transfer to Pending.'),
   q('Action committed?',stop('Show conflict / error;\nreload record state\nand allowedActions.','No change saved')),io('Display new state. Cancellation frees\nreservations; linked request is canceled\nwith transfer. Reopen keeps audit evidence.'),end('Field interruption saved')
  ],'Only original field sender can reopen. Canceling transfer also permits the eligible requester of its linked released request.'),
  page('Cancel outstanding consumables procurement',[
   t('Start · Cancel consumables request'),io('Admin / Secretary chooses Pending /\nPartially received request and enters\nthe required cancellation reason.'),
   guarded('Role, version, reason\nand open state valid?'),p('Atomically mark request Canceled\nand close its outstanding balance.\nPreserve all already received stock.'),
   q('Cancellation committed?',stop('Show conflict / error;\nreload request and\nstock records.','Cancel not saved')),io('Display canceled procurement request\nand its historical receipts.'),end('Outstanding procurement canceled')
  ],'This is a separate consumables action with Admin / Secretary authority, independent of optional field movement cancellation.')
 ]),
 flow('12_Password_Recovery_Setup','Password recovery and account setup',auth,[
  page('Request a reset email',[
   t('Start · User selects Forgot password'),io('Enter the account email address.'),q('Email format valid?',stop('Show field validity\nmessage; correct\nthe email address.','Email required')),
   p('Call Supabase password-reset email\nwith the application callback URL.'),q('Request accepted?',stop('Show connection error;\nretain email for retry.','Reset request failed')),
   io('Show generic message: if the account\nexists, a reset email will be sent.'),off('A',2,'out','User opens the emailed link')
  ],'The generic message does not disclose account existence. No credentials, tokens or real email addresses appear in this documentation.'),
  page('Recovery or invitation password setup',[
   off('A',1,'in','Email callback; invitations also enter here'),p('Handle recovery / invite callback\nbefore ordinary session restoration.'),
   q('Valid Auth session\nfor password setup?',stop('Show expired / invalid\nlink message; request\na new reset or invite.','Setup unavailable')),io('Enter a new password\nof at least 12 characters.'),
   p('Validate the form; call updateUser\nwith the new password; preserve form\nand show error if update fails.'),q('Password saved?',stop('Show validation / Auth\nerror; keep setup form\nfor a corrected retry.','Password not saved')),p('Sign out and show saved confirmation\non login; user signs in again.'),end('Password setup complete')
  ],'Account access still depends on an active supported company profile. A password change does not activate a disabled profile.')
 ]),
 flow('13_Purchase_Ledger','Purchase ledger',[
  'supabase/migrations/202610100005_purchase_ledger.sql','1-admin/modules/consumables/consumables.js'
 ],[
  page('Record supplier purchase (separate from receipt)',[
   t('Start · Admin / Secretary records purchase'),io('Enter supplier, reference, purchase date,\n1–100 item lines, quantities / unit prices,\noptional request link and private receipt.'),
   guarded('Role, lines and optional\nreceipt reference valid?'),p('Calculate totals; enforce precision,\nversion and operation UUID; validate\nprivate receipt object when supplied.'),
   p('Save purchase ledger and line history\natomically. Do not change stock levels.'),q('Ledger committed?',stop('Show validation /\nconflict error; reload\nledger before retry.','Purchase not saved')),io('Display purchase and computed total.\nRecord physical receipt through workflow 10.'),end('Purchase record saved')
  ],'Quantities use at most 3 decimals; unit prices at most 2. Ledger recording is independent of physical stock receipt.')
 ]),
 flow('14_Offline_Demo','Offline demonstration',['js/auth.js','js/movement-store.js','js/movement-cloud.js'],[
  page('Browser-only offline demonstration',[
   t('Start · User chooses offline demo'),io('Choose Admin, Engineer or Architect\ndemo identity from the login page.'),p('Initialize browser-only demo state\nand enter the selected role view.'),
   io('Show sample records and demo actions\ninside the local demonstration.'),end('Demo session opened')
  ],'This is an independent local demonstration. It grants no production company access.')
 ])
];
