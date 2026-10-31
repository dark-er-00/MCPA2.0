# Admin - Tool Profile

- Tool Profile is a separate authorized route rendered by the masterlist module.
- The initial registration placeholder is replaced with recorded activity. If no activity exists the final timeline says no movement recorded.
- Private photos use short-lived signed URLs; photo-unavailable fallback does not hide equipment details.
- QR displays/print tags encode the asset ID. Scanning the asset tag alone is not a custody write.

## Source evidence

- [1-admin/modules/masterlist/masterlist.js:350](../../../../../1-admin/modules/masterlist/masterlist.js#L350): Route-backed asset lookup, unavailable state and full tool profile.
- [1-admin/modules/masterlist/masterlist.js:424](../../../../../1-admin/modules/masterlist/masterlist.js#L424): Filtered recorded movement timeline and external QR image.
- [1-admin/modules/masterlist/masterlist.js:441](../../../../../1-admin/modules/masterlist/masterlist.js#L441): Shared edit flow.
- [1-admin/modules/masterlist/masterlist.js:676](../../../../../1-admin/modules/masterlist/masterlist.js#L676): QR print popup; on-image-load print and close.
- [js/equipment-photos.js:54](../../../../../js/equipment-photos.js#L54): Authorized signed photo URL and unavailable-photo fallback.
