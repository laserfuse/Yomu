const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yomu', {
  getLibraryRoot: () => ipcRenderer.invoke('library:get-root'),
  chooseLibraryRoot: () => ipcRenderer.invoke('library:choose-root'),
  openLibraryRoot: () => ipcRenderer.invoke('library:open-root'),
  exportCollection: (collectionId) => ipcRenderer.invoke('library:export-collection', collectionId),
  importCollection: () => ipcRenderer.invoke('library:import-collection'),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  getPdfZoom: (collectionId) => ipcRenderer.invoke('library:get-pdf-zoom', collectionId),
  setPdfZoom: (collectionId, zoom) => ipcRenderer.invoke('library:set-pdf-zoom', collectionId, zoom),
  saveCollection: (collection, coverBytes, coverName, removeCover) =>
    ipcRenderer.invoke('library:save-collection', collection, coverBytes, coverName, removeCover),
  deleteCollection: (id) => ipcRenderer.invoke('library:delete-collection', id),
  addChapters: (collectionId, language) => ipcRenderer.invoke('library:add-chapters', collectionId, language),
  updateBook: (book) => {
    const metadata = { ...book }
    delete metadata.file
    return ipcRenderer.invoke('library:update-book', metadata)
  },
  deleteBook: (id) => ipcRenderer.invoke('library:delete-book', id),
  readAsset: (relativePath) => ipcRenderer.invoke('library:read-asset', relativePath),
})
