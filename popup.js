const API_URL = 'https://api-production-cad4.up.railway.app';

let data = { folders: [] };
let navStack = [{ type: 'root' }];
let searchQuery = '';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function currentView() {
  return navStack[navStack.length - 1];
}

// ---- API helpers ----
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_URL + path, opts);
  return res.json();
}

async function loadData() {
  try {
    const remote = await api('GET', '/data');
    if (remote && remote.folders) {
      return remote;
    }
  } catch (e) {
    console.warn('API unreachable:', e);
  }
  return { folders: [] };
}

function saveLocal() {
  // no-op, all data lives in the database
}

// ---- API sync wrappers ----
async function createFolder(id, name, parentId) {
  await api('POST', '/folders', { id, name, parent_id: parentId || null });
}

async function updateFolder(id, name) {
  await api('PUT', '/folders/' + id, { name });
}

async function removeFolder(id) {
  await api('DELETE', '/folders/' + id);
}

async function createResponse(id, folderId, title, content) {
  await api('POST', '/responses', { id, folder_id: folderId, title, content });
}

async function updateResponse(id, title, content) {
  await api('PUT', '/responses/' + id, { title, content });
}

async function removeResponse(id) {
  await api('DELETE', '/responses/' + id);
}

// ---- UI ----
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  backBtn.style.display = navStack.length > 1 ? 'flex' : 'none';

  let html = '';
  navStack.forEach((item, i) => {
    const isLast = i === navStack.length - 1;
    let name = 'Home';
    if (item.type === 'folder') {
      const f = data.folders.find(f => f.id === item.id);
      name = f ? f.name : '?';
    } else if (item.type === 'subfolder') {
      const f = data.folders.find(f => f.id === item.folderId);
      const sf = f?.subfolders?.find(s => s.id === item.subId);
      name = sf ? sf.name : '?';
    }
    if (i > 0) html += '<span class="breadcrumb-sep">&#9656;</span>';
    html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" data-nav="${i}">${esc(name)}</span>`;
  });
  bc.innerHTML = html;

  bc.querySelectorAll('.breadcrumb-item:not(.active)').forEach(el => {
    el.addEventListener('click', () => {
      navStack = navStack.slice(0, parseInt(el.dataset.nav) + 1);
      render();
    });
  });
}

function render() {
  renderBreadcrumb();
  const view = currentView();
  const content = document.getElementById('content');
  const q = searchQuery.toLowerCase();

  if (view.type === 'root') {
    let html = '';
    data.folders.forEach(folder => {
      const total = (folder.responses?.length || 0) +
        (folder.subfolders?.reduce((a, sf) => a + (sf.responses?.length || 0), 0) || 0);
      if (q && !folder.name.toLowerCase().includes(q) && !hasMatch(folder, q)) return;
      html += folderHTML(folder.id, null, folder.name, total, folder.subfolders?.length || 0);
    });

    if (q) {
      data.folders.forEach(folder => {
        folder.responses?.forEach(r => {
          if (matchR(r, q)) html += responseHTML(r, folder.name);
        });
        folder.subfolders?.forEach(sf => {
          sf.responses?.forEach(r => {
            if (matchR(r, q)) html += responseHTML(r, folder.name + ' / ' + sf.name);
          });
        });
      });
    }

    content.innerHTML = html || '<div class="empty-state"><p>No folders yet. Click "+ New" to create one.</p></div>';
    bindClicks();

  } else if (view.type === 'folder') {
    const folder = data.folders.find(f => f.id === view.id);
    if (!folder) return;
    let html = '';

    folder.subfolders?.forEach(sf => {
      if (q && !sf.name.toLowerCase().includes(q) && !sf.responses?.some(r => matchR(r, q))) return;
      html += folderHTML(folder.id, sf.id, sf.name, sf.responses?.length || 0, 0);
    });

    folder.responses?.forEach(r => {
      if (q && !matchR(r, q)) return;
      html += responseHTML(r);
    });

    content.innerHTML = html || '<div class="empty-state"><p>Empty folder. Click "+ New" to add.</p></div>';
    bindClicks();

  } else if (view.type === 'subfolder') {
    const folder = data.folders.find(f => f.id === view.folderId);
    const sf = folder?.subfolders?.find(s => s.id === view.subId);
    if (!sf) return;
    let html = '';

    sf.responses?.forEach(r => {
      if (q && !matchR(r, q)) return;
      html += responseHTML(r);
    });

    content.innerHTML = html || '<div class="empty-state"><p>Empty subfolder. Click "+ New" to add.</p></div>';
    bindClicks();
  }
}

function matchR(r, q) {
  return r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
}

function hasMatch(folder, q) {
  if (folder.responses?.some(r => matchR(r, q))) return true;
  return folder.subfolders?.some(sf => sf.responses?.some(r => matchR(r, q)));
}

function folderHTML(folderId, subId, name, count, subCount) {
  const dataAttr = subId
    ? `data-folder-id="${folderId}" data-subfolder-id="${subId}"`
    : `data-folder-id="${folderId}"`;
  const countText = subCount ? `${count} responses, ${subCount} subfolders` : `${count} responses`;

  return `
    <div class="folder-item" ${dataAttr}>
      <div class="folder-icon">
        <svg fill="none" stroke="#F26522" stroke-width="2" viewBox="0 0 24 24" width="16" height="16">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
      </div>
      <div class="folder-info">
        <div class="folder-name">${esc(name)}</div>
        <div class="folder-count">${countText}</div>
      </div>
      <div class="item-actions">
        <button class="action-btn edit-item" title="Edit">&#9998;</button>
        <button class="action-btn delete delete-item" title="Delete">&times;</button>
      </div>
      <span class="folder-arrow">&#9656;</span>
    </div>
  `;
}

function responseHTML(r, contextLabel) {
  return `
    <div class="response-item" data-response-id="${r.id}">
      <div class="response-icon">
        <svg fill="none" stroke="#9E9E9E" stroke-width="2" viewBox="0 0 24 24" width="16" height="16">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
      </div>
      <div class="response-info">
        <div class="response-title">${esc(r.title)}</div>
        <div class="response-preview">${contextLabel ? '<b>' + esc(contextLabel) + ':</b> ' : ''}${esc(r.content)}</div>
      </div>
      <div class="response-actions">
        <button class="action-btn edit-response" title="Edit">&#9998;</button>
        <button class="action-btn delete delete-response" title="Delete">&times;</button>
      </div>
      <span class="copy-badge">Copied!</span>
    </div>
  `;
}

function bindClicks() {
  document.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.item-actions')) return;
      const fid = el.dataset.folderId;
      const sid = el.dataset.subfolderId;
      if (sid) {
        navStack.push({ type: 'subfolder', folderId: fid, subId: sid });
      } else {
        navStack.push({ type: 'folder', id: fid });
      }
      render();
    });

    el.querySelector('.edit-item')?.addEventListener('click', e => {
      e.stopPropagation();
      const sid = el.dataset.subfolderId;
      if (sid) {
        const folder = data.folders.find(f => f.id === el.dataset.folderId);
        const sf = folder?.subfolders?.find(s => s.id === sid);
        if (sf) editFolderModal(sf);
      } else {
        const folder = data.folders.find(f => f.id === el.dataset.folderId);
        if (folder) editFolderModal(folder);
      }
    });

    el.querySelector('.delete-item')?.addEventListener('click', async e => {
      e.stopPropagation();
      const sid = el.dataset.subfolderId;
      if (sid) {
        const folder = data.folders.find(f => f.id === el.dataset.folderId);
        if (folder) {
          folder.subfolders = folder.subfolders.filter(s => s.id !== sid);
          removeFolder(sid);
        }
      } else {
        const fid = el.dataset.folderId;
        data.folders = data.folders.filter(f => f.id !== fid);
        removeFolder(fid);
      }
      saveLocal();
      render();
    });
  });

  document.querySelectorAll('.response-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.response-actions')) return;
      const r = findResponse(el.dataset.responseId);
      if (r) {
        navigator.clipboard.writeText(r.content);
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1200);
      }
    });

    el.querySelector('.edit-response')?.addEventListener('click', e => {
      e.stopPropagation();
      const r = findResponse(el.dataset.responseId);
      if (r) editResponseModal(r);
    });

    el.querySelector('.delete-response')?.addEventListener('click', e => {
      e.stopPropagation();
      const rid = el.dataset.responseId;
      deleteResponseLocal(rid);
      removeResponse(rid);
      saveLocal();
      render();
    });
  });
}

function findResponse(id) {
  for (const f of data.folders) {
    const r = f.responses?.find(r => r.id === id);
    if (r) return r;
    for (const sf of (f.subfolders || [])) {
      const r = sf.responses?.find(r => r.id === id);
      if (r) return r;
    }
  }
  return null;
}

function findResponseFolderId(id) {
  for (const f of data.folders) {
    if (f.responses?.some(r => r.id === id)) return f.id;
    for (const sf of (f.subfolders || [])) {
      if (sf.responses?.some(r => r.id === id)) return sf.id;
    }
  }
  return null;
}

function deleteResponseLocal(id) {
  for (const f of data.folders) {
    const idx = f.responses?.findIndex(r => r.id === id);
    if (idx >= 0) { f.responses.splice(idx, 1); return; }
    for (const sf of (f.subfolders || [])) {
      const idx = sf.responses?.findIndex(r => r.id === id);
      if (idx >= 0) { sf.responses.splice(idx, 1); return; }
    }
  }
}

// Modals
function showModal(title, bodyHtml, onSave) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('modalSave').onclick = () => { onSave(); closeModal(); };
  setTimeout(() => {
    const inp = document.querySelector('.modal input, .modal textarea');
    if (inp) inp.focus();
  }, 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function editFolderModal(folder) {
  showModal('Edit Folder', `
    <label>Name</label>
    <input type="text" id="inputName" value="${esc(folder.name)}">
  `, () => {
    const newName = document.getElementById('inputName').value.trim() || folder.name;
    folder.name = newName;
    updateFolder(folder.id, newName);
    saveLocal();
    render();
  });
}

function editResponseModal(response) {
  showModal('Edit Response', `
    <label>Title</label>
    <input type="text" id="inputTitle" value="${esc(response.title)}">
    <label>Content</label>
    <textarea id="inputContent">${esc(response.content)}</textarea>
  `, () => {
    response.title = document.getElementById('inputTitle').value.trim() || response.title;
    response.content = document.getElementById('inputContent').value.trim() || response.content;
    updateResponse(response.id, response.title, response.content);
    saveLocal();
    render();
  });
}

// Add button
document.getElementById('addBtn').addEventListener('click', () => {
  const view = currentView();
  if (view.type === 'root') {
    showModal('New Folder', `
      <label>Folder Name</label>
      <input type="text" id="inputName" placeholder="e.g. My Company">
    `, () => {
      const name = document.getElementById('inputName').value.trim();
      if (!name) return;
      const id = generateId();
      data.folders.push({ id, name, subfolders: [], responses: [] });
      createFolder(id, name, null);
      saveLocal();
      render();
    });
  } else if (view.type === 'folder') {
    showModal('Add New', `
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-primary" id="pickSubfolder" style="flex:1">Subfolder</button>
        <button class="btn btn-primary" id="pickResponse" style="flex:1">Response</button>
      </div>
      <div id="addFields"></div>
    `, () => {
      const fields = document.getElementById('addFields');
      const folder = data.folders.find(f => f.id === view.id);
      if (!folder) return;

      if (fields.dataset.type === 'subfolder') {
        const name = document.getElementById('inputName')?.value.trim();
        if (!name) return;
        const id = generateId();
        if (!folder.subfolders) folder.subfolders = [];
        folder.subfolders.push({ id, name, responses: [] });
        createFolder(id, name, folder.id);
      } else if (fields.dataset.type === 'response') {
        const title = document.getElementById('inputTitle')?.value.trim();
        const content = document.getElementById('inputContent')?.value.trim();
        if (!title || !content) return;
        const id = generateId();
        if (!folder.responses) folder.responses = [];
        folder.responses.push({ id, title, content });
        createResponse(id, folder.id, title, content);
      }
      saveLocal();
      render();
    });

    setTimeout(() => {
      document.getElementById('pickSubfolder')?.addEventListener('click', () => {
        const f = document.getElementById('addFields');
        f.dataset.type = 'subfolder';
        f.innerHTML = `<label>Subfolder Name</label><input type="text" id="inputName" placeholder="e.g. Sales">`;
        f.querySelector('input').focus();
      });
      document.getElementById('pickResponse')?.addEventListener('click', () => {
        const f = document.getElementById('addFields');
        f.dataset.type = 'response';
        f.innerHTML = `<label>Title</label><input type="text" id="inputTitle" placeholder="e.g. Welcome message"><label>Content</label><textarea id="inputContent" placeholder="Type your quick response..."></textarea>`;
        f.querySelector('input').focus();
      });
    }, 50);
  } else if (view.type === 'subfolder') {
    showModal('New Response', `
      <label>Title</label>
      <input type="text" id="inputTitle" placeholder="e.g. Welcome message">
      <label>Content</label>
      <textarea id="inputContent" placeholder="Type your quick response..."></textarea>
    `, () => {
      const title = document.getElementById('inputTitle').value.trim();
      const content = document.getElementById('inputContent').value.trim();
      if (!title || !content) return;
      const folder = data.folders.find(f => f.id === view.folderId);
      const sf = folder?.subfolders?.find(s => s.id === view.subId);
      if (sf) {
        const id = generateId();
        if (!sf.responses) sf.responses = [];
        sf.responses.push({ id, title, content });
        createResponse(id, sf.id, title, content);
        saveLocal();
        render();
      }
    });
  }
});

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
  if (navStack.length > 1) { navStack.pop(); render(); }
});

// Search
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  if (searchQuery && currentView().type !== 'root') {
    navStack = [{ type: 'root' }];
  }
  render();
});

// Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('modalOverlay').classList.contains('active')) {
      closeModal();
    } else if (navStack.length > 1) {
      navStack.pop();
      render();
    }
  }
});

// Cancel
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Init
loadData().then(d => { data = d; render(); });
