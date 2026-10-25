const fs = require('node:fs');
const path = require('node:path');
const categories = ['古纪','前纪','中纪','后纪'];
const colors = ['common','uncommon','rare'];
function normalize(data) {
  if (!data || !Array.isArray(data.items)) throw Error('文件格式不正确：需要 items 列表');
  const ids = new Set();
  const items = data.items.map(item => {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || !categories.includes(item.category) || !colors.includes(item.color) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 200) throw Error('遗物数据不合法');
    ids.add(item.id);
    return {id:item.id, category:item.category, color:item.color, text:item.text.trim()};
  });
  if (items.length > 10000) throw Error('最多支持 10000 条遗物');
  return {version:1, items, alwaysOnTop: data.alwaysOnTop === true, compactClickThrough: data.compactClickThrough === true, compactOpacity: typeof data.compactOpacity === "number" && Number.isFinite(data.compactOpacity) ? Math.max(0.2,Math.min(1,data.compactOpacity)) : 1};
}
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file+'.tmp', JSON.stringify(data,null,2), 'utf8');
  fs.renameSync(file+'.tmp', file);
}
function migrateLegacy(source, destination) {
  if (path.resolve(source) === path.resolve(destination)) return false;
  const oldFile = path.join(source,'saved_texts.json');
  const newFile = path.join(destination,'saved_texts.json');
  if (fs.existsSync(newFile) || !fs.existsSync(oldFile)) return false;
  const data = normalize(JSON.parse(fs.readFileSync(oldFile,'utf8')));
  fs.mkdirSync(destination,{recursive:true});
  const position = path.join(source,'window_position.json');
  if (fs.existsSync(position) && !fs.existsSync(path.join(destination,'window_position.json'))) {
    try { const bounds = JSON.parse(fs.readFileSync(position,'utf8')); atomicWrite(path.join(destination,'window_position.json'),bounds); } catch {}
  }
  atomicWrite(newFile,data);
  return true;
}
module.exports = {normalize, atomicWrite, categories, migrateLegacy};
