const $=s=>document.querySelector(s);
const cats=['古纪','前纪','中纪','后纪'];
const colors=['common','uncommon','rare'];
let selectedCategory="古纪", selectedColor="common";
const compactWindow=new URLSearchParams(location.search).get('mode')==='compact';
let state, removed=null, queue=Promise.resolve(), pending=0;
function status(text){$('#status').textContent=text;}
function persist(){const snapshot=JSON.parse(JSON.stringify(state));pending++;queue=queue.then(()=>window.relic.save(snapshot)).then(()=>{status('已自动保存');}).catch(e=>{status('保存失败：'+e.message);}).finally(()=>pending--);return queue;}
function render(){
  document.body.classList.toggle('compact',compactWindow);
  $('#opacity').value=Math.round((state.compactOpacity??1)*100);$('#opacity-value').textContent=$('#opacity').value+'%';
  $('#columns').title=compactWindow?'拖动列标题移动窗口；在空白处右键返回正常窗口':'';
  $('#pin').classList.toggle('active',state.alwaysOnTop);$('#pin').setAttribute('aria-pressed',String(state.alwaysOnTop));
  $('#total').textContent=state.items.length;$('#columns').replaceChildren();
  for(const cat of cats){
    const col=document.createElement('section');col.className='column';
    const heading=document.createElement('h2');heading.textContent=cat;
    const items=state.items.filter(i=>i.category===cat);
    const count=document.createElement('span');count.textContent=items.length+' 枚';heading.append(count);col.append(heading);
    const list=document.createElement('div');list.className='list';
    for(const item of items){
      const b=document.createElement('button');b.className='item '+item.color;b.textContent=item.text;b.title='单击复制 · 双击删除 · 右键切换颜色';
      b.onclick=async()=>{try{await window.relic.copy(item.text);status('已复制：'+item.text);}catch(e){status('复制失败：'+e.message);}};
      b.ondblclick=()=>{removed={item,index:state.items.findIndex(i=>i.id===item.id)};state.items=state.items.filter(i=>i.id!==item.id);$('#undo').hidden=false;render();persist();};
      b.oncontextmenu=e=>{e.preventDefault();item.color=colors[(colors.indexOf(item.color)+1)%3];render();persist();};list.append(b);
    }
    if(!items.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='暂无遗物\n从上方添加第一枚';list.append(empty);}
    col.append(list);$('#columns').append(col);
  }
}
$('#add').onsubmit=e=>{e.preventDefault();if(!state)return;const text=$('#text').value.trim().replace(/[a-z]/g,c=>c.toUpperCase());if(!text)return;if(state.items.length>=10000){status('最多支持 10000 条');return;}const category=selectedCategory;if(state.items.some(i=>i.category===category&&i.text.replace(/[a-z]/g,c=>c.toUpperCase())===text)){status('该分类已有相同遗物');return;}state.items.push({id:crypto.randomUUID(),text,category,color:selectedColor});$('#text').value='';render();persist();$('#text').focus();};
for(const button of document.querySelectorAll('[data-category], [data-color]')) {
  button.onclick=()=>{
    const category=button.dataset.category;
    if(category) selectedCategory=category; else selectedColor=button.dataset.color;
    for(const peer of button.parentElement.querySelectorAll('button')) {
      const active=peer===button;peer.classList.toggle('selected',active);peer.setAttribute('aria-pressed',String(active));
    }
  };
}
$('#pin').onclick=async()=>{if(state){await queue;state.alwaysOnTop=true;render();await persist();}};
$('#undo').onclick=()=>{if(!removed)return;state.items.splice(removed.index,0,removed.item);removed=null;$('#undo').hidden=true;render();persist();};
$('#min').onclick=()=>window.relic.window('minimize');$('#max').onclick=()=>window.relic.window('maximize');
$('#close').onclick=async()=>{if(pending)await queue;window.relic.window('close');};
$('#export').onclick=async()=>{try{await queue;if(await window.relic.export())status('备份已导出');}catch(e){status('导出失败：'+e.message);}};
$('#import').onclick=async()=>{if(!state)return;$('#import').disabled=true;$('#submit').disabled=true;try{await queue;const data=await window.relic.import();if(data){state=data;removed=null;$('#undo').hidden=true;render();status('导入完成');}}catch(e){status('导入失败：'+e.message);}finally{$('#import').disabled=false;$('#submit').disabled=false;}};
window.relic.load().then(data=>{state={version:1,items:data.items,alwaysOnTop:data.alwaysOnTop,compactOpacity:data.compactOpacity??1,compactClickThrough:data.compactClickThrough===true};render();status(data.warning||'已就绪 · 自动保存');$('#status').title='数据目录：'+data.dataDir;}).catch(e=>status('加载失败：'+e.message));

async function exitCompact(){if(compactWindow&&state){await queue;await window.relic.window('restore');}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&compactWindow){e.preventDefault();exitCompact();}});
window.relic.onState(data=>{state=data;removed=null;$('#undo').hidden=true;render();});
$('#settings-toggle').onclick=()=>{const panel=$('#settings');panel.hidden=!panel.hidden;$('#settings-toggle').setAttribute('aria-expanded',String(!panel.hidden));};
$('#opacity').oninput=()=>{if(state){state.compactOpacity=Number($('#opacity').value)/100;$('#opacity-value').textContent=$('#opacity').value+'%';persist();}};
