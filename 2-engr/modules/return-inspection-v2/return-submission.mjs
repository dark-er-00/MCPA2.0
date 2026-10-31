import {mountMovementComposer} from '../../../js/upgrades/custody-lifecycle/composer.mjs';
export const mountReturnSubmission=(root,options)=>mountMovementComposer(root,{...options,intent:'return'});
