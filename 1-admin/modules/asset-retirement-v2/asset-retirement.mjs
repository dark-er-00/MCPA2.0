import {mountRetirement} from '../../../js/upgrades/equipment-retirement/retirement.mjs';
export const mountAssetRetirement=(root,options)=>mountRetirement(root,{...options,admin:true});
