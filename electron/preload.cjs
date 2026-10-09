
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('taog', {
  appName: 'TAOG Visitor System'
});