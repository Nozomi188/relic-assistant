const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
// Windows helper intercepts only right clicks inside this window's current bounds.
function startRightClickBridge(win,{ready,menu,failed}){
 const handle=win.getNativeWindowHandle();
 const hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
 const source=fs.readFileSync(path.join(__dirname,'native/right-click.ps1'),'utf8');
 const command=`& { ${source}\n } -WindowHandle '${hwnd}' -ParentId ${process.pid}`;
 const encoded=Buffer.from(command,'utf16le').toString('base64');
 const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const child=spawn(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stopped=false,initialized=false,buffer='',error='';
 const timeout=setTimeout(()=>fail('右键支持启动超时'),20000);
 function fail(message){if(stopped)return;stop();failed(message);}
 function stop(){if(stopped)return;stopped=true;clearTimeout(timeout);child.kill();}
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(stopped)continue;if(line==='READY'){initialized=true;clearTimeout(timeout);ready();}if(line==='MENU'&&initialized)menu(()=>{if(!stopped)child.stdin.write('ARM\n');});}});
 child.stderr.on('data',chunk=>{error=(error+chunk).slice(-1200);});child.on('error',e=>fail(e.message));child.on('exit',()=>{if(!stopped)fail(error||'右键支持已退出');});child.stdin.on('error',()=>{});
 return {stop};
}
module.exports={startRightClickBridge};
