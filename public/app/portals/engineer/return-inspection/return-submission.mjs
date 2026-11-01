import {mountMovementComposer} from '../../../features/custody-lifecycle/composer.mjs';
export const mountReturnSubmission=(root,options)=>mountMovementComposer(root,{...options,intent:'return'});
