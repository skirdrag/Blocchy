window.addEventListener('pywebviewready', () => {
    // --- STATO DELL'APPLICAZIONE ---
    let state = {
        currentNote: null,
        isNewNote: false,
        allNotes: [],
        autosaveTimeout: null,
        renderTimeout: null,
        activeView: 'files',
    };

    // --- ELEMENTI DEL DOM ---
    const dom = {
        welcomeScreen: document.getElementById('welcome-screen'),
        editorArea: document.getElementById('editor-area'),
        nav: {
            filesBtn: document.getElementById('nav-files-btn'),
            graphBtn: document.getElementById('nav-graph-btn'),
            settingsBtn: document.getElementById('nav-settings-btn'),
        },
        sidebar: {
            container: document.getElementById('sidebar'),
            filesView: document.getElementById('files-view'),
            graphView: document.getElementById('graph-view'),
            settingsView: document.getElementById('settings-view'),
            notesList: document.getElementById('notes-list'),
            graphContainer: document.getElementById('graph-container'),
            newNoteBtn: document.getElementById('new-note-btn'),
        },
        editor: {
            title: document.getElementById('note-title'),
            textarea: document.getElementById('editor'),
            preview: document.getElementById('preview'),
            container: document.getElementById('editor-container'),
            deleteBtn: document.getElementById('delete-btn'),
            saveStatus: document.getElementById('save-status'),
            toolbar: document.querySelector('.editor-toolbar'),
            togglePreviewBtn: document.getElementById('toggle-preview-btn'),
        },
        palette: {
            overlay: document.getElementById('command-palette-overlay'),
            input: document.getElementById('palette-input'),
            results: document.getElementById('palette-results'),
        },
        deleteConfirm: {
            overlay: document.getElementById('delete-confirm-overlay'),
            message: document.getElementById('delete-confirm-message'),
            confirmBtn: document.getElementById('delete-confirm-btn'),
            cancelBtn: document.getElementById('delete-cancel-btn')
        },
        linkModal: {
            overlay: document.getElementById('link-modal-overlay'),
            urlInput: document.getElementById('link-url-input'),
            textInput: document.getElementById('link-text-input'),
            confirmBtn: document.getElementById('link-confirm-btn'),
            cancelBtn: document.getElementById('link-cancel-btn'),
        },
        settings: {
            fontSelector: document.getElementById('font-selector'),
        },
    };

    // --- FUNZIONI DI UTILITY ---
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };
    
    const renderIcons = () => feather.replace();

    // --- FUNZIONI PRINCIPALI ---

    const init = async () => {
        renderIcons();

        try {
            const config = await window.pywebview.api.get_config();
            if (config && config.ui && config.ui.preview_focused) {
                dom.editor.container.classList.add('preview-focused');
            }
        } catch (e) {
            console.error("Errore nel caricamento della configurazione UI:", e);
        }

        await loadNotesList();
        setupEventListeners();
        showWelcomeScreen();
    };
    
    const showWelcomeScreen = () => {
        dom.welcomeScreen.classList.remove('hidden');
        dom.editorArea.classList.add('hidden');
        state.currentNote = null;
        updateActiveNoteSelectionInList();
    };
    
    const showEditor = () => {
        dom.welcomeScreen.classList.add('hidden');
        dom.editorArea.classList.remove('hidden');
    };

    const loadNotesList = async () => {
        try {
            state.allNotes = await window.pywebview.api.get_notes();
            const list = dom.sidebar.notesList;
            list.innerHTML = '';
            if (state.allNotes.length === 0) {
                list.innerHTML = '<p class="placeholder">Nessuna nota. Creane una!</p>';
            } else {
                state.allNotes.forEach(noteName => {
                    const item = document.createElement('div');
                    item.className = 'note-item';
                    item.textContent = noteName;
                    item.dataset.filename = noteName;
                    item.addEventListener('click', () => openNote(noteName));
                    list.appendChild(item);
                });
            }
            updateActiveNoteSelectionInList();
        } catch (error) {
            console.error("Errore nel caricamento delle note:", error);
        }
    };

    const renderPreview = () => {
        const rawMarkdown = dom.editor.textarea.value;
        dom.editor.preview.innerHTML = marked.parse(rawMarkdown, { breaks: true });
    };
    const debouncedRender = debounce(renderPreview, 150);

    const openNote = async (noteName) => {
        if (state.currentNote === noteName && !dom.editorArea.classList.contains('hidden')) return;
        try {
            const content = await window.pywebview.api.get_note_content(noteName);
            state.currentNote = noteName;
            state.isNewNote = false;

            dom.editor.title.value = noteName;
            dom.editor.title.disabled = true;
            dom.editor.textarea.value = content;
            dom.editor.textarea.disabled = false;
            
            renderPreview();
            updateActiveNoteSelectionInList();
            showEditor();
            dom.editor.textarea.focus();
        } catch (error) {
            console.error(`Errore nell'apertura della nota ${noteName}:`, error);
        }
    };

    const createNewNote = () => {
        state.currentNote = null;
        state.isNewNote = true;
        dom.editor.title.value = '';
        dom.editor.title.placeholder = 'NomeNuovaNota';
        dom.editor.title.disabled = false;
        dom.editor.textarea.value = '# Nuova Nota\n\n';
        dom.editor.textarea.disabled = false;
        renderPreview();
        updateActiveNoteSelectionInList();
        showEditor();
        dom.editor.title.focus();
    };

    const saveCurrentNote = async () => {
        if (state.isNewNote && !dom.editor.title.value) return;
        const content = dom.editor.textarea.value;
        const filename = (dom.editor.title.value || state.currentNote).replace('.md', '');
        if (!filename) return;
        try {
            const result = await window.pywebview.api.save_note({ filename, content });
            if (result.status === 'success') {
                const needsListRefresh = state.isNewNote || state.currentNote !== result.filename;
                state.currentNote = result.filename;
                state.isNewNote = false;
                dom.editor.title.value = state.currentNote;
                dom.editor.title.disabled = true;
                if (needsListRefresh) { await loadNotesList(); }
                updateActiveNoteSelectionInList();
                showSaveStatus();
            }
        } catch (error) { console.error("Errore API nel salvataggio:", error); }
    };
    const debouncedSave = debounce(saveCurrentNote, 1500);

    const showDeleteConfirmation = () => {
        if (!state.currentNote || state.isNewNote) return;
        dom.deleteConfirm.message.textContent = `Sei sicuro di voler eliminare "${state.currentNote}"? L'azione è irreversibile.`;
        dom.deleteConfirm.overlay.classList.remove('hidden');
        renderIcons();
        dom.deleteConfirm.confirmBtn.focus();
    };
    
    const hideDeleteConfirmation = () => dom.deleteConfirm.overlay.classList.add('hidden');

    const performDelete = async () => {
        try {
            await window.pywebview.api.delete_note(state.currentNote);
            hideDeleteConfirmation();
            showWelcomeScreen();
            await loadNotesList();
        } catch (error) {
            console.error("Errore API nell'eliminazione:", error);
            hideDeleteConfirmation();
        }
    };

    const updateActiveNoteSelectionInList = () => {
        const items = dom.sidebar.notesList.querySelectorAll('.note-item');
        items.forEach(item => {
            item.classList.toggle('active', item.dataset.filename === state.currentNote);
        });
    };
    
    const showSaveStatus = () => {
        const statusEl = dom.editor.saveStatus;
        statusEl.classList.add('visible');
        setTimeout(() => statusEl.classList.remove('visible'), 2000);
    };

    const switchSidebarView = (viewName) => {
        state.activeView = viewName;
        [dom.sidebar.filesView, dom.sidebar.graphView, dom.sidebar.settingsView].forEach(v => v.classList.remove('active'));
        [dom.nav.filesBtn, dom.nav.graphBtn, dom.nav.settingsBtn].forEach(b => b.classList.remove('active'));

        if (viewName === 'files') {
            dom.sidebar.filesView.classList.add('active');
            dom.nav.filesBtn.classList.add('active');
        } else if (viewName === 'graph') {
            dom.sidebar.graphView.classList.add('active');
            dom.nav.graphBtn.classList.add('active');
            renderGraph();
        } else if (viewName === 'settings') {
            dom.sidebar.settingsView.classList.add('active');
            dom.nav.settingsBtn.classList.add('active');
        }
    };
    
    const renderGraph = async () => {
        try {
            const graphData = await window.pywebview.api.get_graph_data();
            const options = {
                nodes: {
                    shape: 'box',
                    color: {
                        background: 'var(--bg-tertiary)',
                        border: 'var(--accent-purple)',
                        highlight: {
                            background: 'var(--accent-purple)',
                            border: 'var(--border-color)'
                        }
                    },
                    font: {
                        color: 'var(--text-primary)'
                    }
                },
                edges: {
                    color: 'var(--text-tertiary)'
                },
                physics: {
                    enabled: true,
                    solver: 'barnesHut',
                    barnesHut: {
                        gravitationalConstant: -4000,
                        centralGravity: 0.1,
                        springLength: 120
                    }
                }
            };
            new vis.Network(dom.sidebar.graphContainer, graphData, options);
        } catch (e) { console.error("Errore rendering grafo", e); }
    };

    const openPalette = () => {
        populatePaletteResults(state.allNotes);
        dom.palette.overlay.classList.remove('hidden');
        dom.palette.input.focus();
    };

    const closePalette = () => {
        dom.palette.overlay.classList.add('hidden');
        dom.palette.input.value = '';
    };

    const populatePaletteResults = (results) => {
        const list = dom.palette.results;
        list.innerHTML = '';
        results.forEach((res, index) => {
            const li = document.createElement('li');
            li.className = 'palette-item';
            li.textContent = res;
            li.dataset.filename = res;
            if (index === 0) li.classList.add('selected');
            list.appendChild(li);
        });
    };

    const handlePaletteNavigation = (e) => {
        const items = Array.from(dom.palette.results.children);
        if (items.length === 0) return;
        const selected = dom.palette.results.querySelector('.selected');
        const currentIndex = items.indexOf(selected);
        if (e.key === 'ArrowDown') {
            selected.classList.remove('selected');
            const nextIndex = (currentIndex + 1) % items.length;
            items[nextIndex].classList.add('selected');
            items[nextIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            selected.classList.remove('selected');
            const prevIndex = (currentIndex - 1 + items.length) % items.length;
            items[prevIndex].classList.add('selected');
            items[prevIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const noteToOpen = selected.dataset.filename;
            openNote(noteToOpen);
            closePalette();
        }
    };
    
    const showLinkModal = () => {
        const textarea = dom.editor.textarea;
        const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        dom.linkModal.textInput.value = selectedText;
        dom.linkModal.overlay.classList.remove('hidden');
        dom.linkModal.urlInput.focus();
    };

    const hideLinkModal = () => {
        dom.linkModal.overlay.classList.add('hidden');
        dom.linkModal.urlInput.value = '';
        dom.linkModal.textInput.value = '';
    };

    const insertLinkFromModal = () => {
        const url = dom.linkModal.urlInput.value.trim();
        const text = dom.linkModal.textInput.value.trim() || url;
        if (!url) return;
        const markdownLink = `[${text}](${url})`;
        const textarea = dom.editor.textarea;
        textarea.focus();
        document.execCommand('insertText', false, markdownLink);
        hideLinkModal();
        debouncedSave();
        debouncedRender();
    };

    const formatText = (command) => {
        const textarea = dom.editor.textarea;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = textarea.value.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = textarea.value.length;
        const selectedLinesText = textarea.value.substring(lineStart, lineEnd);
        const selectedLines = selectedLinesText.split('\n');
        let newText = '';
        switch(command) {
            case 'bold':
                newText = `**${textarea.value.substring(start, end)}**`;
                textarea.setRangeText(newText, start, end, 'select');
                break;
            case 'italic':
                newText = `*${textarea.value.substring(start, end)}*`;
                textarea.setRangeText(newText, start, end, 'select');
                break;
            case 'link':
                showLinkModal();
                return;
            case 'unordered-list': {
                const isAlreadyList = selectedLines.every(line => /^\s*[*+-]\s/.test(line));
                if (isAlreadyList) {
                    newText = selectedLines.map(line => line.replace(/^\s*[*+-]\s?/, '')).join('\n');
                } else {
                    newText = selectedLines.map(line => {
                        const cleanedLine = line.replace(/^\s*(\d+\.|[*+-])\s*/, '');
                        return cleanedLine.trim() === '' ? '' : `* ${cleanedLine}`;
                    }).join('\n');
                }
                textarea.setRangeText(newText, lineStart, lineEnd, 'select');
                break;
            }
            case 'ordered-list': {
                const isAlreadyList = selectedLines.every(line => /^\s*\d+\.\s/.test(line));
                if (isAlreadyList) {
                    newText = selectedLines.map(line => line.replace(/^\s*\d+\.\s?/, '')).join('\n');
                } else {
                    newText = selectedLines.map((line, i) => {
                        const cleanedLine = line.replace(/^\s*(\d+\.|[*+-])\s*/, '');
                        return cleanedLine.trim() === '' ? '' : `${i + 1}. ${cleanedLine}`;
                    }).join('\n');
                }
                textarea.setRangeText(newText, lineStart, lineEnd, 'select');
                break;
            }
            default: return;
        }
        textarea.focus();
        debouncedSave();
        debouncedRender();
    };

    // --- SETUP EVENT LISTENERS ---
    const setupEventListeners = () => {
        
        setInterval(() => {
            const currentState = {
                window: {
                    width: parseInt(window.innerWidth, 10),
                    height: parseInt(window.innerHeight, 10),
                    x: parseInt(window.screenX, 10),
                    y: parseInt(window.screenY, 10),
                },
                ui: {
                    preview_focused: dom.editor.container.classList.contains('preview-focused')
                }
            };
            window.pywebview.api.sync_state(currentState);
        }, 2000);

        dom.nav.filesBtn.addEventListener('click', () => switchSidebarView('files'));
        dom.nav.graphBtn.addEventListener('click', () => switchSidebarView('graph'));
        dom.nav.settingsBtn.addEventListener('click', () => switchSidebarView('settings'));
        dom.sidebar.newNoteBtn.addEventListener('click', createNewNote);
        dom.editor.deleteBtn.addEventListener('click', showDeleteConfirmation);
        dom.deleteConfirm.cancelBtn.addEventListener('click', hideDeleteConfirmation);
        dom.deleteConfirm.overlay.addEventListener('click', (e) => { if (e.target === dom.deleteConfirm.overlay) hideDeleteConfirmation(); });
        dom.deleteConfirm.confirmBtn.addEventListener('click', performDelete);
        dom.linkModal.cancelBtn.addEventListener('click', hideLinkModal);
        dom.linkModal.overlay.addEventListener('click', (e) => { if (e.target === dom.linkModal.overlay) hideLinkModal(); });
        dom.linkModal.confirmBtn.addEventListener('click', insertLinkFromModal);
        dom.editor.preview.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && (link.href.startsWith('http://') || link.href.startsWith('https://'))) {
                e.preventDefault();
                window.pywebview.api.open_external_link(link.href);
            }
        });
        dom.editor.togglePreviewBtn.addEventListener('click', () => {
            dom.editor.container.classList.toggle('preview-focused');
            dom.editor.textarea.focus();
        });
        dom.editor.textarea.addEventListener('input', () => {
            debouncedSave();
            debouncedRender();
        });
        dom.editor.title.addEventListener('input', debouncedSave);
        dom.editor.textarea.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = dom.editor.textarea;
            if (scrollHeight <= clientHeight) return;
            const percentage = scrollTop / (scrollHeight - clientHeight);
            dom.editor.preview.scrollTop = percentage * (dom.editor.preview.scrollHeight - dom.editor.preview.clientHeight);
        });
        dom.settings.fontSelector.addEventListener('change', (e) => {
            document.body.className = '';
            document.body.classList.add(`font-${e.target.value}`);
        });
        dom.editor.toolbar.addEventListener('click', (e) => {
            const button = e.target.closest('.toolbar-button');
            if (button && button.dataset.command) {
                formatText(button.dataset.command);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (!dom.deleteConfirm.overlay.classList.contains('hidden')) {
                if (e.key === 'Escape') { e.preventDefault(); hideDeleteConfirmation(); }
                if (e.key === 'Enter') { e.preventDefault(); performDelete(); }
                return;
            }
            if (!dom.linkModal.overlay.classList.contains('hidden')) {
                if (e.key === 'Escape') { e.preventDefault(); hideLinkModal(); }
                if (e.key === 'Enter') { e.preventDefault(); insertLinkFromModal(); }
                return;
            }
            if (!dom.palette.overlay.classList.contains('hidden')) {
                if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) { e.preventDefault(); handlePaletteNavigation(e); }
                if (e.key === 'Escape') { closePalette(); }
                return;
            }
            if (e.key === 'Enter' && !dom.editorArea.classList.contains('hidden')) {
                const { textarea } = dom.editor;
                const pos = textarea.selectionStart;
                const currentLine = textarea.value.substring(0, pos).split('\n').pop();
                const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s*(.*)$/);
                const unorderedMatch = currentLine.match(/^(\s*)([*+-])\s*(.*)$/);
                if (orderedMatch) {
                    const [, indent, numStr, content] = orderedMatch;
                    if (content.trim() === '') {
                        textarea.setRangeText('', pos - currentLine.length, pos, 'end');
                    } else {
                        e.preventDefault();
                        textarea.setRangeText(`\n${indent}${parseInt(numStr, 10) + 1}. `, pos, pos, 'end');
                    }
                    debouncedRender();
                    return;
                }
                if (unorderedMatch) {
                    const [, indent, marker, content] = unorderedMatch;
                    if (content.trim() === '') {
                        textarea.setRangeText('', pos - currentLine.length, pos, 'end');
                    } else {
                        e.preventDefault();
                        textarea.setRangeText(`\n${indent}${marker} `, pos, pos, 'end');
                    }
                    debouncedRender();
                    return;
                }
            }
            if (e.ctrlKey) {
                switch(e.key.toLowerCase()) {
                    case 'p': e.preventDefault(); openPalette(); break;
                    case 'n': e.preventDefault(); createNewNote(); break;
                    case 'e': e.preventDefault(); switchSidebarView('files'); break;
                    case 'g': e.preventDefault(); switchSidebarView('graph'); break;
                    case 'w': e.preventDefault(); showWelcomeScreen(); break;
                    case 'b': e.preventDefault(); formatText('bold'); break;
                    case 'i': e.preventDefault(); formatText('italic'); break;
                    case 'k': e.preventDefault(); formatText('link'); break;
                    case 's': e.preventDefault(); clearTimeout(state.autosaveTimeout); saveCurrentNote(); break;
                }
            }
        });
    };

    // --- AVVIO ---
    init();
});