const {app,BrowserWindow,ipcMain,clipboard,dialog,screen,Menu}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {normalize,atomicWrite,migrateLegacy}=require('./store');
const {startRightClickBridge}=require('./click-through');
let normalWin,compactWin,dataDir,state,warning='',quitting=false;
const timers=new Map();
let bridge=null,bridgeReady=false,menuOpen=false;
const alive=w=>w&&!w.isDestroyed();
const file=name=>path.join(dataDir,name);
function readBounds(name,defaults,minWidth,minHeight){
  let b;try{b=JSON.parse(fs.readFileSync(file(name),'utf8'));}catch{return defaults;}
  const result={...defaults};
  if(Number.isFinite(b.width))result.width=Math.max(minWidth,Math.min(2000,b.width));
  if(Number.isFinite(b.height))result.height=Math.max(minHeight,Math.min(1400,b.height));
  if(Number.isFinite(b.x)&&Number.isFinite(b.y)&&screen.getAllDisplays().some(d=>b.x+100>d.workArea.x&&b.x<d.workArea.x+d.workArea.width&&b.y+40>d.workArea.y&&b.y<d.workArea.y+d.workArea.height)){result.x=b.x;result.y=b.y;}
  return result;
}
function saveBounds(win,name){if(alive(win)&&!win.isMinimized()&&!win.isMaximized())try{atomicWrite(file(name),win.getBounds());}catch(e){console.error('保存窗口位置失败',e.message);}}
function broadcast(except){for(const w of [normalWin,compactWin])if(alive(w)&&w.webContents!==except)w.webContents.send('state-changed',state);}
function stopBridge(){if(bridge)bridge.stop();bridge=null;bridgeReady=false;if(alive(compactWin))compactWin.setIgnoreMouseEvents(false);}
function updateClickThrough(){
 const enabled=state.alwaysOnTop&&state.compactClickThrough&&alive(compactWin);
 if(!enabled){stopBridge();return;}
 if(process.platform!=='win32'){clickThroughFailed('点击穿透的右键支持目前仅支持 Windows');return;}
 if(!bridge){try{bridge=startRightClickBridge(compactWin,{
   ready:()=>{bridgeReady=true;if(alive(compactWin)&&state.alwaysOnTop&&state.compactClickThrough)compactWin.setIgnoreMouseEvents(true,{forward:true});},
   menu:rearm=>{if(!state.alwaysOnTop||!state.compactClickThrough){rearm();return;}openCompactMenu(()=>{rearm();});},
   failed:clickThroughFailed
 });}catch(e){clickThroughFailed(e.message);}}
 if(bridgeReady&&!menuOpen)compactWin.setIgnoreMouseEvents(true,{forward:true});
}
function clickThroughFailed(message){stopBridge();state={...state,compactClickThrough:false};try{atomicWrite(file('saved_texts.json'),state);}catch{}broadcast();dialog.showErrorBox('未启用点击穿透',message+'。已恢复普通点击，避免无法操作窗口。');}
function changeSettings(patch){try{commit(normalize({...state,...patch}));}catch(e){dialog.showErrorBox('保存失败',e.message);}}
function openCompactMenu(done=()=>{}){
 if(!alive(compactWin)||menuOpen){done();return;}
 menuOpen=true;compactWin.setIgnoreMouseEvents(false);
 const finish=()=>{menuOpen=false;done();updateClickThrough();};
 const entries=[
 {label:'返回正常窗口',click:restoreNormal},
 {label:'不透明度',submenu:[20,30,40,50,60,70,80,90,100].map(n=>({label:n+'%',type:'radio',checked:Math.round(state.compactOpacity*100)===n,click:()=>changeSettings({compactOpacity:n/100})}))},
 {label:'点击穿透（保留右键菜单）',type:'checkbox',checked:state.compactClickThrough,click:()=>changeSettings({compactClickThrough:!state.compactClickThrough})},
 {type:'separator'},{label:'退出程序',click:()=>{quitting=true;app.quit();}}
 ];
 try{Menu.buildFromTemplate(entries).popup({window:compactWin,callback:finish});}catch(e){finish();}
}
function showNormal(){if(alive(compactWin)){saveBounds(compactWin,'compact_window_position.json');compactWin.hide();}if(alive(normalWin)){if(normalWin.isMinimized())normalWin.restore();normalWin.show();normalWin.focus();}}
function showCompact(){if(!alive(compactWin))compactWin=createWindow(true);if(alive(normalWin)){saveBounds(normalWin,'window_position.json');normalWin.hide();}if(alive(compactWin)&&!compactWin.webContents.isLoading()){if(compactWin.isMinimized())compactWin.restore();compactWin.showInactive();}}
function commit(next,sender){const modeChanged=state.alwaysOnTop!==next.alwaysOnTop;atomicWrite(file('saved_texts.json'),next);state=next;if(alive(compactWin))compactWin.setOpacity(state.compactOpacity);if(modeChanged){if(state.alwaysOnTop)showCompact();else showNormal();}updateClickThrough();broadcast(sender);}
function restoreNormal(){try{commit({...state,alwaysOnTop:false});}catch(e){dialog.showErrorBox('保存失败',e.message);}}
function createWindow(compact){
  const positionFile=compact?'compact_window_position.json':'window_position.json';
  const bounds=readBounds(positionFile,compact?{width:640,height:320}:{width:920,height:560},compact?240:640,compact?80:360);
  const w=new BrowserWindow({...bounds,minWidth:compact?240:640,minHeight:compact?80:360,frame:false,show:false,focusable:!compact,backgroundColor:'#10151e',alwaysOnTop:compact,opacity:compact?state.compactOpacity:1,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
  for(const event of ['move','resize'])w.on(event,()=>{clearTimeout(timers.get(w));timers.set(w,setTimeout(()=>saveBounds(w,positionFile),250));});
  w.on('close',e=>{saveBounds(w,positionFile);if(compact&&!quitting){e.preventDefault();restoreNormal();}else if(!compact){quitting=true;app.quit();}});
  w.on('closed',()=>{clearTimeout(timers.get(w));timers.delete(w);if(compact)compactWin=null;else normalWin=null;});
  if(compact)w.webContents.on('context-menu',()=>openCompactMenu());
  w.once('ready-to-show',()=>{if((compact&&state.alwaysOnTop)||(!compact&&!state.alwaysOnTop)){if(compact)w.showInactive();else{w.show();w.focus();}}});
  w.loadFile('ui/index.html',{query:{mode:compact?'compact':'normal'}});return w;
}
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('before-quit',()=>{quitting=true;stopBridge();for(const [w,name]of [[normalWin,'window_position.json'],[compactWin,'compact_window_position.json']])saveBounds(w,name);});
app.on('second-instance',()=>{if(state?.alwaysOnTop)showCompact();else showNormal();});
app.whenReady().then(()=>{
  const base=process.env.PORTABLE_EXECUTABLE_DIR||(app.isPackaged?path.dirname(app.getPath('exe')):__dirname);
  dataDir=path.join(app.getPath('userData'),'data');
  try{fs.mkdirSync(dataDir,{recursive:true});if(migrateLegacy(path.join(base,'data'),dataDir))warning='已迁移旧数据到应用数据目录';}catch(e){dialog.showErrorBox('数据目录初始化失败',e.message);app.quit();return;}
  try{state=normalize(JSON.parse(fs.readFileSync(file('saved_texts.json'),'utf8')));}catch(e){state=normalize({items:[]});if(e.code!=='ENOENT'){warning='数据文件无法读取，原文件已备份。';try{fs.copyFileSync(file('saved_texts.json'),file(`saved_texts.corrupt-${Date.now()}.json`));}catch{dialog.showErrorBox('数据读取失败','无法备份原数据，请先检查数据目录。');app.quit();return;}}}
  ipcMain.handle('load',()=>({...state,dataDir,warning}));
  ipcMain.handle('save',(e,value)=>{commit(normalize(value),e.sender);return true;});
  ipcMain.handle('copy',(_e,text)=>{if(typeof text!=='string'||text.length>200)throw Error('内容无效');clipboard.writeText(text);});
  ipcMain.handle('window',(e,action)=>{const w=BrowserWindow.fromWebContents(e.sender);if(!alive(w))return;if(action==='close'){if(w===compactWin)restoreNormal();else{quitting=true;app.quit();}}if(action==='restore')restoreNormal();if(action==='minimize')w.minimize();if(action==='maximize'){if(w.isMaximized())w.unmaximize();else w.maximize();}});
  ipcMain.handle('export',async e=>{const r=await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender),{defaultPath:'遗物备份.json',filters:[{name:'JSON',extensions:['json']}]});if(!r.canceled){atomicWrite(r.filePath,state);return true;}return false;});
  ipcMain.handle('import',async e=>{const w=BrowserWindow.fromWebContents(e.sender);const r=await dialog.showOpenDialog(w,{properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return null;const p=r.filePaths[0];if(fs.statSync(p).size>5*1024*1024)throw Error('文件超过 5 MB');const next=normalize(JSON.parse(fs.readFileSync(p,'utf8')));const answer=await dialog.showMessageBox(w,{type:'question',buttons:['取消','导入并替换'],defaultId:0,cancelId:0,message:`导入 ${next.items.length} 条遗物？`,detail:'将替换当前列表；当前数据会先自动备份。'});if(answer.response!==1)return null;atomicWrite(file(`backup-${Date.now()}.json`),state);next.alwaysOnTop=false;commit(next,e.sender);return state;});
  normalWin=createWindow(false);if(state.alwaysOnTop)showCompact();updateClickThrough();
});
app.on('window-all-closed',()=>app.quit());
}
