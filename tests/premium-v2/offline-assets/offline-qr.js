/* Local transport substitute for the accepted QR image service. Uses its existing QRCode dependency. */
window.MCPAOfflineQR=Object.freeze({image(value,size=150){
 const host=document.createElement('div');
 new QRCode(host,{text:String(value),width:Number(size),height:Number(size),colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
 const canvas=host.querySelector('canvas');
 if(!canvas)throw new Error('Local QR canvas could not be generated.');
 return canvas.toDataURL('image/png');
}});
