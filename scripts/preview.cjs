// Synthetic in-memory fixtures only; no PHP, SQL, environment or live SDK.
const port=Number(process.env.PORT||4183);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be a valid TCP port.');
require('../tests/engineer-assignment-preview.cjs').start({port});
