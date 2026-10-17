import { INITIAL_WORDS } from './words.js';

const STORAGE_KEY = 'personal_dictionary_words';

const POS_MAP = {
  'noun': 'noun', 'n': 'noun', 'n.': 'noun',
  'verb': 'verb', 'v': 'verb', 'v.': 'verb',
  'adjective': 'adjective', 'adj': 'adjective', 'adj.': 'adjective', 'a': 'adjective', 'a.': 'adjective',
  'adverb': 'adverb', 'adv': 'adverb', 'adv.': 'adverb',
  'phrase': 'phrase', 'idiom': 'phrase', 'expression': 'phrase',
  'preposition': 'preposition', 'prep': 'preposition', 'prep.': 'preposition',
  'conjunction': 'conjunction', 'conj': 'conjunction',
  'interjection': 'interjection', 'interj': 'interjection',
  'pronoun': 'pronoun', 'pron': 'pronoun',
  'other': 'other'
};

const SUGGESTED_TAGS = ['architecture', 'botany and zoology', 'christian', 'color', 'french', 'geology', 'latin', 'medical', 'military', 'nautical', 'textiles'];
const CUSTOM_TAGS_STORAGE_KEY = 'personal_dictionary_custom_tags';

/**
 * Clean and normalize a tag string.
 */
export function normalizeTag(tag) {
  if (!tag) return '';
  return String(tag).replace(/^#/, '').trim().toLowerCase();
}

/**
 * Retrieve user custom tags from localStorage.
 */
export function getCustomTags() {
  try {
    const raw = localStorage.getItem(CUSTOM_TAGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeTag).filter(Boolean);
      }
    }
  } catch {}
  return [];
}

/**
 * Save user custom tags to localStorage.
 */
export function saveCustomTags(tags) {
  try {
    const clean = Array.from(new Set(tags.map(normalizeTag).filter(Boolean)));
    localStorage.setItem(CUSTOM_TAGS_STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.error('Failed to save custom tags:', err);
  }
}

/**
 * Register one or more new custom tags in persistent storage.
 */
export function registerCustomTags(newTags) {
  if (!newTags) return;
  const list = Array.isArray(newTags) ? newTags : [newTags];
  const existing = getCustomTags();
  let changed = false;
  list.forEach(t => {
    const clean = normalizeTag(t);
    if (clean && !SUGGESTED_TAGS.includes(clean) && !existing.includes(clean)) {
      existing.push(clean);
      changed = true;
    }
  });
  if (changed) {
    saveCustomTags(existing);
  }
}

/**
 * Get all available tags (suggested tags + tags on words + persistent custom tags).
 */
export function getAllTags() {
  const tagSet = new Set(SUGGESTED_TAGS);

  if (state.words && Array.isArray(state.words)) {
    state.words.forEach(entry => {
      if (Array.isArray(entry.tags)) {
        entry.tags.forEach(t => {
          const clean = normalizeTag(t);
          if (clean) tagSet.add(clean);
        });
      }
    });
  }

  getCustomTags().forEach(t => tagSet.add(t));

  const customSorted = Array.from(tagSet)
    .filter(t => !SUGGESTED_TAGS.includes(t))
    .sort((a, b) => a.localeCompare(b));

  return [...SUGGESTED_TAGS, ...customSorted];
}

/**
 * Normalize and canonicalize a single part of speech string.
 */
export function normalizePos(str) {
  if (!str) return '';
  const cleaned = str.trim().toLowerCase().replace(/[\(\)\[\]\.\,]/g, '');
  return POS_MAP[cleaned] || cleaned;
}

/**
 * Check if a token represents a known part of speech.
 */
export function isKnownPos(token) {
  if (!token) return false;
  const cleaned = token.trim().toLowerCase().replace(/[\(\)\[\]\.\,]/g, '');
  return Boolean(POS_MAP[cleaned]);
}

/**
 * Parse a string or array into an array of normalized parts of speech.
 * Handles delimiters like '/', ',', '&', '+', and 'and'.
 */
export function parsePosList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(normalizePos).filter(Boolean);
  }
  return String(input)
    .split(/[/,&+]|\band\b/i)
    .map(normalizePos)
    .filter(Boolean);
}

/**
 * Retrieve parts of speech for an entry as an array of normalized strings.
 */
export function getPartsOfSpeech(entry) {
  if (!entry) return [];
  return parsePosList(entry.partOfSpeech);
}

/**
 * Helper to parse various date formats (e.g. 3/28/21, 2021-03-28) to ISO format.
 */
function parseDateString(str) {
  if (!str) return '';
  const s = str.trim();
  const slashMatch = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    let y = parseInt(slashMatch[3], 10);
    if (y < 100) y += 2000;
    const m = String(parseInt(slashMatch[1], 10)).padStart(2, '0');
    const d = String(parseInt(slashMatch[2], 10)).padStart(2, '0');
    return `${y}-${m}-${d}T12:00:00.000Z`;
  }
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00.000Z`;
  }
  return '';
}

/**
 * Intelligent parser that extracts word, partOfSpeech, definition, source, tags, and date.
 */
export function parseWordInput(rawText) {
  const result = {
    word: '',
    partOfSpeech: [],
    definition: '',
    source: '',
    tags: [],
    dateAdded: ''
  };

  if (!rawText || !rawText.trim()) {
    return result;
  }

  let text = rawText.trim();

  // 1. Extract hashtags: #medical, #latin, etc.
  const hashtagMatches = text.match(/#([a-zA-Z0-9_-]+)/g);
  if (hashtagMatches) {
    hashtagMatches.forEach(tag => {
      const clean = normalizeTag(tag);
      if (clean && !result.tags.includes(clean)) {
        result.tags.push(clean);
      }
    });
    text = text.replace(/#([a-zA-Z0-9_-]+)/g, ' ').trim();
  }

  // 2. Extract bracketed source: [Source Name]
  const bracketMatch = text.match(/\[(?:source:\s*|from:\s*|found in:\s*|found:\s*|in:\s*)?([^\]]+)\]/i);
  if (bracketMatch) {
    result.source = bracketMatch[1].trim();
    text = text.replace(bracketMatch[0], ' ').trim();
  }

  // 3. Check for explicit labeled lines (Word:, POS:, Def:, Source:, Tags:)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const unhandledLines = [];

  for (const line of lines) {
    const wordLabel = line.match(/^(?:word|term)\s*[:=-]\s*(.+)$/i);
    const posLabel = line.match(/^(?:pos|part of speech|type)\s*[:=-]\s*(.+)$/i);
    const defLabel = line.match(/^(?:def|definition|meaning)\s*[:=-]\s*(.+)$/i);
    const srcLabel = line.match(/^(?:source|found in|found|from|in|book|via)\s*[:=-]\s*(.+)$/i);
    const tagLabel = line.match(/^(?:tags?|categories?)\s*[:=-]\s*(.+)$/i);
    const dateLabel = line.match(/^(?:date|added|date added)\s*[:=-]\s*(.+)$/i);

    if (wordLabel) {
      result.word = wordLabel[1].trim();
    } else if (posLabel) {
      parsePosList(posLabel[1]).forEach(p => {
        if (!result.partOfSpeech.includes(p)) result.partOfSpeech.push(p);
      });
    } else if (defLabel) {
      result.definition = defLabel[1].trim();
    } else if (srcLabel) {
      result.source = srcLabel[1].trim();
    } else if (dateLabel) {
      result.dateAdded = parseDateString(dateLabel[1]);
    } else if (tagLabel) {
      const tagsParsed = tagLabel[1].split(/[,;]+/).map(normalizeTag).filter(Boolean);
      tagsParsed.forEach(t => {
        if (!result.tags.includes(t)) result.tags.push(t);
      });
    } else {
      unhandledLines.push(line);
    }
  }

  if (result.word && result.definition) {
    return result;
  }

  // 4. Freeform fallback
  let remainingText = unhandledLines.join('\n');

  if (result.partOfSpeech.length === 0) {
    // Check for parenthetical POS, e.g. (noun), (n/adj), (n., v.), (adj / adv)
    const parenMatches = remainingText.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      for (const pMatch of parenMatches) {
        const inner = pMatch.slice(1, -1).trim();
        const tokens = inner.split(/[/,&+]|\band\b/i).map(s => s.trim()).filter(Boolean);
        if (tokens.length > 0 && tokens.every(isKnownPos)) {
          tokens.forEach(t => {
            const norm = normalizePos(t);
            if (!result.partOfSpeech.includes(norm)) result.partOfSpeech.push(norm);
          });
          remainingText = remainingText.replace(pMatch, ' ').trim();
          break;
        }
      }
    }
  }

  if (!result.source) {
    const inlineSourceMatch = remainingText.match(/(?:found in|from|source|via)\s*[:=-]\s*([^\n\r.]+)/i);
    if (inlineSourceMatch) {
      result.source = inlineSourceMatch[1].trim();
      remainingText = remainingText.replace(inlineSourceMatch[0], ' ').trim();
    }
  }

  const cleanLines = remainingText.split('\n').map(l => l.trim()).filter(Boolean);

  if (cleanLines.length >= 2) {
    if (!result.word) {
      result.word = cleanLines[0].replace(/^[-*•]\s*/, '').replace(/[:=-]$/, '').trim();
    }

    let defStartIndex = result.word === cleanLines[0] ? 1 : 0;

    if (result.partOfSpeech.length === 0 && cleanLines.length > defStartIndex) {
      const lineTokens = cleanLines[defStartIndex].split(/[/,&+]|\band\b/i).map(s => s.trim()).filter(Boolean);
      if (lineTokens.length > 0 && lineTokens.every(isKnownPos)) {
        lineTokens.forEach(t => {
          const norm = normalizePos(t);
          if (!result.partOfSpeech.includes(norm)) result.partOfSpeech.push(norm);
        });
        defStartIndex++;
      }
    }

    if (!result.source && cleanLines.length > defStartIndex + 1) {
      const lastLine = cleanLines[cleanLines.length - 1];
      if (/^(?:in|from|source|book):/i.test(lastLine) || (!/[.!?]$/.test(lastLine) && lastLine.length < 50)) {
        result.source = lastLine.replace(/^(?:in|from|source|book)\s*[:=-]\s*/i, '').trim();
        cleanLines.pop();
      }
    }

    if (!result.definition && cleanLines.length > defStartIndex) {
      result.definition = cleanLines.slice(defStartIndex).join(' ').trim();
    }
  } else if (cleanLines.length === 1) {
    const line = cleanLines[0].replace(/^[-*•]\s*/, '').trim();
    const parts = line.split(/\s*[:\-–—]\s*/);

    if (parts.length >= 2) {
      if (!result.word) {
        result.word = parts[0].trim();
      }

      let remainingParts = parts.slice(1);

      if (result.partOfSpeech.length === 0 && remainingParts.length > 0) {
        const tokenCandidates = remainingParts[0].split(/[/,&+]|\band\b/i).map(s => s.trim()).filter(Boolean);
        if (tokenCandidates.length > 0 && tokenCandidates.every(isKnownPos)) {
          tokenCandidates.forEach(t => {
            const norm = normalizePos(t);
            if (!result.partOfSpeech.includes(norm)) result.partOfSpeech.push(norm);
          });
          remainingParts = remainingParts.slice(1);
        }
      }

      if (!result.definition && remainingParts.length > 0) {
        result.definition = remainingParts[0].trim();
        remainingParts = remainingParts.slice(1);
      }

      if (!result.source && remainingParts.length > 0) {
        result.source = remainingParts.join(' - ').trim();
      }
    } else {
      if (!result.word) {
        result.word = line;
      }
    }
  }

  if (result.word) {
    result.word = result.word.replace(/^["'`]|["'`]$/g, '').trim();
  }
  if (result.definition) {
    result.definition = result.definition.replace(/^["'`]|["'`]$/g, '').trim();
  }
  if (result.source) {
    result.source = result.source.replace(/^["'`]|["'`]$/g, '').trim();
  }

  return result;
}

/**
 * Normalize an entry object ensuring partOfSpeech is an array.
 */
function normalizeEntry(entry) {
  if (!entry) return entry;
  return {
    ...entry,
    partOfSpeech: getPartsOfSpeech(entry)
  };
}

/**
 * Load words from localStorage or fallback to INITIAL_WORDS,
 * merging INITIAL_WORDS so newly imported words are immediately visible.
 */
function loadWords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const wordMap = new Map();
        INITIAL_WORDS.forEach(w => wordMap.set(w.word.toLowerCase(), normalizeEntry(w)));
        parsed.forEach(w => {
          const norm = normalizeEntry(w);
          const initial = wordMap.get(norm.word.toLowerCase());
          if (initial && initial.partOfSpeech.length > norm.partOfSpeech.length) {
            norm.partOfSpeech = initial.partOfSpeech;
          }
          wordMap.set(norm.word.toLowerCase(), norm);
        });
        return Array.from(wordMap.values());
      }
    }
  } catch (err) {
    console.warn('Could not read from localStorage:', err);
  }
  return INITIAL_WORDS.map(normalizeEntry);
}

/**
 * Save words array to localStorage.
 */
function persistWords(words) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (err) {
    console.error('Could not save to localStorage:', err);
  }
}

// Application state
const state = {
  words: loadWords(),
  searchQuery: '',
  selectedPos: 'all',
  selectedTag: 'all',
  selectedSort: 'alpha-asc'
};

// DOM Elements
const wordsContainer = document.getElementById('words-container');
const alphabetNav = document.getElementById('alphabet-nav');
const alphabetNavInner = document.getElementById('alphabet-nav-inner');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const posFilterContainer = document.getElementById('pos-filter-container');
const tagFilterContainer = document.getElementById('tag-filter-container');
const sortSelect = document.getElementById('sort-select');
const totalCountBadge = document.getElementById('total-count-badge');
const backToTopBtn = document.getElementById('back-to-top-btn');

// Smart Add Modal Elements
const addWordDialog = document.getElementById('add-word-dialog');
const openAddModalBtn = document.getElementById('open-add-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const addWordForm = document.getElementById('add-word-form');
const smartTextInput = document.getElementById('smart-text-input');
const addPosPicker = document.getElementById('add-pos-picker');
const addTagPicker = document.getElementById('add-tag-picker');
const addCustomTags = document.getElementById('add-custom-tags');
const submitWordBtn = document.getElementById('submit-word-btn');

// Add Preview Elements
const previewWord = document.getElementById('preview-word');
const previewPos = document.getElementById('preview-pos');
const previewDef = document.getElementById('preview-def');
const previewSource = document.getElementById('preview-source');
const previewTags = document.getElementById('preview-tags');
const previewDate = document.getElementById('preview-date');
const addDateInput = document.getElementById('add-date-input');

// Edit Modal Elements
const editWordDialog = document.getElementById('edit-word-dialog');
const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
const cancelEditModalBtn = document.getElementById('cancel-edit-modal-btn');
const editWordForm = document.getElementById('edit-word-form');
const editWordId = document.getElementById('edit-word-id');
const editWordInput = document.getElementById('edit-word-input');
const editPosPicker = document.getElementById('edit-pos-picker');
const editCustomPos = document.getElementById('edit-custom-pos');
const editDefInput = document.getElementById('edit-def-input');
const editSourceInput = document.getElementById('edit-source-input');
const editTagPicker = document.getElementById('edit-tag-picker');
const editCustomTags = document.getElementById('edit-custom-tags');
const editDateInput = document.getElementById('edit-date-input');

// Export Modal Elements
const exportDialog = document.getElementById('export-dialog');
const openExportModalBtn = document.getElementById('open-export-modal-btn');
const closeExportModalBtn = document.getElementById('close-export-modal-btn');
const cancelExportModalBtn = document.getElementById('cancel-export-modal-btn');
const downloadExportBtn = document.getElementById('download-export-btn');
const exportPreview = document.getElementById('export-preview');
const exportAllCountLabel = document.getElementById('export-all-count-label');
const exportFilteredOption = document.getElementById('export-filtered-option');
const exportFilteredCountLabel = document.getElementById('export-filtered-count-label');

// Google Drive Sync Elements
const driveSyncBtn = document.getElementById('drive-sync-btn');
const driveSyncIndicator = document.getElementById('drive-sync-indicator');
const driveStatusLabel = document.getElementById('drive-status-label');
const syncPopover = document.getElementById('sync-popover');
const syncUserAvatar = document.getElementById('sync-user-avatar');
const syncUserName = document.getElementById('sync-user-name');
const syncUserEmail = document.getElementById('sync-user-email');
const syncPopoverStatus = document.getElementById('sync-popover-status');
const syncNowBtn = document.getElementById('sync-now-btn');
const syncSettingsBtn = document.getElementById('sync-settings-btn');
const syncSignoutBtn = document.getElementById('sync-signout-btn');
const driveSettingsModal = document.getElementById('drive-settings-modal');
const closeDriveModalBtn = document.getElementById('close-drive-modal-btn');
const cancelDriveModalBtn = document.getElementById('cancel-drive-modal-btn');
const saveDriveClientIdBtn = document.getElementById('save-drive-client-id-btn');
const driveClientIdInput = document.getElementById('drive-client-id-input');

/**
 * Format ISO date string into readable text.
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

/**
 * Filter and sort words based on active search, filters, and sort mode.
 */
function getFilteredAndSortedWords() {
  const query = state.searchQuery.trim().toLowerCase();
  const pos = state.selectedPos;
  const tagFilter = state.selectedTag;

  // 1. Filter
  const filtered = state.words.filter(entry => {
    if (pos !== 'all') {
      const entryPosList = getPartsOfSpeech(entry);
      if (!entryPosList.includes(pos)) {
        return false;
      }
    }

    if (tagFilter !== 'all') {
      const entryTags = (entry.tags || []).map(normalizeTag);
      if (!entryTags.includes(tagFilter)) {
        return false;
      }
    }

    if (query) {
      const matchWord = (entry.word || '').toLowerCase().includes(query);
      const matchDef = (entry.definition || '').toLowerCase().includes(query);
      const matchSource = (entry.source || '').toLowerCase().includes(query);
      const matchTags = entry.tags ? entry.tags.some(t => normalizeTag(t).includes(query)) : false;
      const matchPos = getPartsOfSpeech(entry).some(p => p.toLowerCase().includes(query));

      return matchWord || matchDef || matchSource || matchTags || matchPos;
    }

    return true;
  });

  // 2. Sort
  return filtered.sort((a, b) => {
    switch (state.selectedSort) {
      case 'alpha-desc':
        return (b.word || '').localeCompare(a.word || '', undefined, { sensitivity: 'base' });
      case 'date-asc':
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
      case 'date-desc':
        return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
      case 'alpha-asc':
      default:
        return (a.word || '').localeCompare(a.word || '', undefined, { sensitivity: 'base' });
    }
  });
}

/**
 * Delete a word entry by ID.
 */
function deleteWord(id) {
  const target = state.words.find(w => w.id === id);
  const wordLabel = target ? `"${target.word}"` : 'this word';
  if (confirm(`Remove ${wordLabel} from your dictionary?`)) {
    state.words = state.words.filter(w => w.id !== id);
    persistWords(state.words);
    renderTagFilterBar();
    renderAddTagPicker();
    render();
    syncDictionaryChanges();
  }
}

/**
 * Render the tag filter row with all default and custom tags.
 */
export function renderTagFilterBar() {
  if (!tagFilterContainer) return;
  const allTags = getAllTags();
  const currentTag = state.selectedTag || 'all';

  tagFilterContainer.innerHTML = `
    <span class="tag-filter-label">Tags:</span>
    <button class="tag-filter-btn ${currentTag === 'all' ? 'active' : ''}" data-tag="all">all</button>
    ${allTags.map(tag => `
      <button class="tag-filter-btn ${currentTag === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join('')}
  `;
}

/**
 * Render the tag choices in the Add modal.
 */
export function renderAddTagPicker(selectedTags = []) {
  if (!addTagPicker) return;
  const allTags = getAllTags();
  const selectedSet = new Set((selectedTags || []).map(normalizeTag));

  addTagPicker.innerHTML = allTags.map(tag => {
    const isActive = selectedSet.has(tag);
    return `<button type="button" class="tag-choice-btn ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}">+ ${escapeHtml(tag)}</button>`;
  }).join('');
}

/**
 * Render the tag choices in the Edit modal.
 */
export function renderEditTagPicker(selectedTags = []) {
  if (!editTagPicker) return;
  const allTags = getAllTags();
  const selectedSet = new Set((selectedTags || []).map(normalizeTag));

  editTagPicker.innerHTML = allTags.map(tag => {
    const isActive = selectedSet.has(tag);
    return `<button type="button" class="tag-choice-btn ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}">+ ${escapeHtml(tag)}</button>`;
  }).join('');
}

/**
 * Select a tag filter programmatically.
 */
function selectTagFilter(tagName) {
  state.selectedTag = tagName;
  renderTagFilterBar();
  render();
}

/**
 * Open the Edit modal for a specific word.
 */
function openEditModal(entry) {
  editWordId.value = entry.id;
  editWordInput.value = entry.word || '';

  const currentPos = getPartsOfSpeech(entry);
  const standardPos = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'other'];
  const customPos = [];

  if (editPosPicker) {
    editPosPicker.querySelectorAll('.pos-choice-btn').forEach(btn => {
      const p = btn.getAttribute('data-pos');
      const isSelected = currentPos.includes(p);
      btn.classList.toggle('active', isSelected);
    });
  }

  currentPos.forEach(p => {
    if (!standardPos.includes(p)) {
      customPos.push(p);
    }
  });

  if (editCustomPos) {
    editCustomPos.value = customPos.join(', ');
  }

  editDefInput.value = entry.definition || '';
  editSourceInput.value = entry.source || '';

  const entryTags = (entry.tags || []).map(normalizeTag);
  registerCustomTags(entryTags);
  renderEditTagPicker(entryTags);
  editCustomTags.value = '';

  // Set date in edit input
  if (entry.dateAdded) {
    try {
      const d = new Date(entry.dateAdded);
      if (!isNaN(d.getTime())) {
        editDateInput.value = d.toISOString().split('T')[0];
      } else {
        editDateInput.value = '';
      }
    } catch {
      editDateInput.value = '';
    }
  } else {
    editDateInput.value = '';
  }

  editWordDialog.showModal();
  editWordInput.focus();
}

/**
 * Close the Edit modal and reset.
 */
function closeEditModal() {
  editWordDialog.close();
  editWordForm.reset();
  if (editPosPicker) {
    editPosPicker.querySelectorAll('.pos-choice-btn').forEach(btn => btn.classList.remove('active'));
  }
  if (editCustomPos) editCustomPos.value = '';
  if (editDateInput) editDateInput.value = '';
}

/**
 * Create a minimal word entry element.
 */
function createWordItem(entry) {
  const item = document.createElement('article');
  item.className = 'word-item';
  item.id = `word-${entry.id || entry.word}`;

  const formattedDate = formatDate(entry.dateAdded);
  const metaParts = [];
  if (entry.source) {
    metaParts.push(`<span class="word-meta-item">Found in: ${escapeHtml(entry.source)}</span>`);
  }
  if (formattedDate) {
    metaParts.push(`<span class="word-meta-item">Added ${escapeHtml(formattedDate)}</span>`);
  }

  const metaHtml = metaParts.length > 0
    ? `<div class="word-meta">${metaParts.join('<span class="word-meta-dot">&bull;</span>')}</div>`
    : '';

  const tagsList = (entry.tags || []).map(normalizeTag).filter(Boolean);
  const tagsHtml = tagsList.length > 0
    ? `<div class="word-tags">${tagsList.map(t => `<span class="tag-badge" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const posList = getPartsOfSpeech(entry);
  const posHtml = posList.length > 0
    ? `<span class="word-pos">${escapeHtml(posList.join(' / '))}</span>`
    : '';

  item.innerHTML = `
    <div class="word-header">
      <div class="word-term-group">
        <h2 class="word-term">${escapeHtml(entry.word)}</h2>
        ${posHtml}
      </div>
      <div class="word-actions">
        <button class="edit-word-btn" title="Edit entry" aria-label="Edit ${escapeHtml(entry.word)}">edit</button>
        <button class="delete-word-btn" title="Delete entry" aria-label="Delete ${escapeHtml(entry.word)}">✕</button>
      </div>
    </div>
    <p class="word-definition">${escapeHtml(entry.definition)}</p>
    ${tagsHtml}
    ${metaHtml}
  `;

  // Attach Edit handler
  const editBtn = item.querySelector('.edit-word-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openEditModal(entry);
    });
  }

  // Attach Delete handler
  const deleteBtn = item.querySelector('.delete-word-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deleteWord(entry.id);
    });
  }

  // Clicking a tag filters by that tag
  item.querySelectorAll('.tag-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const tag = badge.getAttribute('data-tag');
      if (tag) {
        selectTagFilter(tag);
      }
    });
  });

  return item;
}

/**
 * Render empty state.
 */
function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'empty-state';

  if (state.words.length === 0) {
    empty.innerHTML = `
      <p class="empty-title">Your dictionary is currently empty.</p>
      <p class="empty-hint">Click <strong>+ Add word</strong> above to add your first entry.</p>
    `;
  } else {
    empty.innerHTML = `
      <p class="empty-title">No matching words found.</p>
      <p class="empty-hint">Try adjusting your search query or selecting "all" in filters.</p>
    `;
  }

  return empty;
}

/**
 * Escape HTML to prevent injection.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Extract and normalize the first letter of a word for alphabetical grouping.
 * Handles diacritics, unicode replacement characters, and punctuation.
 */
export function getFirstLetter(word) {
  if (!word) return '#';
  let clean = String(word).trim();
  if (clean.toLowerCase().includes('claircissement')) return 'E';
  clean = clean.replace(/^[\ufffd\uFFFD\?]+/, '').trim();
  if (!clean) return '#';
  const normalized = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const firstChar = normalized.charAt(0).toUpperCase();
  return /[A-Z]/.test(firstChar) ? firstChar : '#';
}

/**
 * Create a visual section header for an alphabetical group of words.
 */
function createLetterSectionHeader(letter, count) {
  const header = document.createElement('div');
  header.className = 'letter-section-header';
  header.id = `letter-${letter}`;
  header.setAttribute('data-letter', letter);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'letter-section-title-wrap';

  const charSpan = document.createElement('h2');
  charSpan.className = 'letter-section-char';
  charSpan.textContent = letter;

  const countSpan = document.createElement('span');
  countSpan.className = 'letter-section-count';
  countSpan.textContent = `${count} ${count === 1 ? 'word' : 'words'}`;

  titleWrap.appendChild(charSpan);
  titleWrap.appendChild(countSpan);

  const topBtn = document.createElement('button');
  topBtn.type = 'button';
  topBtn.className = 'letter-section-top-link';
  topBtn.title = 'Back to top of dictionary';
  topBtn.setAttribute('aria-label', `Back to top from section ${letter}`);
  topBtn.innerHTML = '↑ top';
  topBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  header.appendChild(titleWrap);
  header.appendChild(topBtn);

  return header;
}

/**
 * Render the alphabet jump navigation bar with live available letter status.
 */
function renderAlphabetNav(letterCounts = {}) {
  if (!alphabetNavInner) return;

  const hasHash = Boolean(letterCounts['#'] && letterCounts['#'] > 0);
  const letters = [...ALPHABET];
  if (hasHash) {
    letters.push('#');
  }

  let html = `
    <button type="button" class="alpha-jump-btn top-btn" data-action="top" title="Back to top" aria-label="Back to top">↑</button>
  `;

  letters.forEach(letter => {
    const count = letterCounts[letter] || 0;
    const isDisabled = count === 0;
    const title = isDisabled
      ? `No words starting with ${letter}`
      : `${letter}: ${count} ${count === 1 ? 'word' : 'words'}`;

    html += `
      <button
        type="button"
        class="alpha-jump-btn ${isDisabled ? 'disabled' : ''}"
        data-letter="${letter}"
        title="${title}"
        aria-label="Jump to letter ${letter}${count > 0 ? ` (${count} words)` : ''}"
        ${isDisabled ? 'disabled aria-disabled="true"' : ''}
      >${letter}</button>
    `;
  });

  alphabetNavInner.innerHTML = html;
}

/**
 * Smoothly scroll to the requested letter section.
 * Automatically switches to alphabetical sort if currently sorted by date.
 */
function jumpToLetter(letter) {
  if (!letter) return;

  if (state.selectedSort !== 'alpha-asc' && state.selectedSort !== 'alpha-desc') {
    state.selectedSort = 'alpha-asc';
    if (sortSelect) sortSelect.value = 'alpha-asc';
    render();
  }

  const target = document.getElementById(`letter-${letter}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.remove('highlight-pulse');
    void target.offsetWidth; // Force reflow to re-trigger animation
    target.classList.add('highlight-pulse');

    if (alphabetNavInner) {
      alphabetNavInner.querySelectorAll('.alpha-jump-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-letter') === letter);
      });
    }

    try {
      history.replaceState(null, '', `#letter-${letter}`);
    } catch {}
  }
}

let scrollSpyTicking = false;

/**
 * ScrollSpy listener: highlights the letter button in the jump bar
 * corresponding to the section currently in view.
 */
function updateActiveLetterOnScroll() {
  if (scrollSpyTicking) return;
  scrollSpyTicking = true;

  requestAnimationFrame(() => {
    scrollSpyTicking = false;
    const headers = document.querySelectorAll('.letter-section-header');
    if (!headers || headers.length === 0) {
      if (alphabetNavInner) {
        alphabetNavInner.querySelectorAll('.alpha-jump-btn').forEach(btn => btn.classList.remove('active'));
      }
      return;
    }

    const navHeight = alphabetNav ? alphabetNav.offsetHeight : 45;
    const threshold = navHeight + 35;

    let activeLetter = '';

    if (window.scrollY < 120) {
      activeLetter = headers[0].getAttribute('data-letter');
    } else {
      for (let i = 0; i < headers.length; i++) {
        const rect = headers[i].getBoundingClientRect();
        if (rect.top <= threshold) {
          activeLetter = headers[i].getAttribute('data-letter');
        } else {
          break;
        }
      }
    }

    if (alphabetNavInner) {
      alphabetNavInner.querySelectorAll('.alpha-jump-btn').forEach(btn => {
        const letter = btn.getAttribute('data-letter');
        btn.classList.toggle('active', Boolean(activeLetter && letter === activeLetter));
      });
    }
  });
}

/**
 * Render the word list, alphabet jump bar, and counts.
 */
function render() {
  const items = getFilteredAndSortedWords();
  wordsContainer.innerHTML = '';

  // Calculate letter counts for filtered items
  const letterCounts = {};
  items.forEach(entry => {
    const letter = getFirstLetter(entry.word);
    letterCounts[letter] = (letterCounts[letter] || 0) + 1;
  });

  // Render the alphabet navigation bar with live counts and disabled states
  renderAlphabetNav(letterCounts);

  if (items.length === 0) {
    wordsContainer.appendChild(createEmptyState());
  } else {
    const isAlphaSort = state.selectedSort === 'alpha-asc' || state.selectedSort === 'alpha-desc';

    if (isAlphaSort) {
      let currentLetter = '';
      items.forEach(entry => {
        const letter = getFirstLetter(entry.word);
        if (letter !== currentLetter) {
          currentLetter = letter;
          wordsContainer.appendChild(createLetterSectionHeader(letter, letterCounts[letter]));
        }
        wordsContainer.appendChild(createWordItem(entry));
      });
    } else {
      items.forEach(entry => {
        wordsContainer.appendChild(createWordItem(entry));
      });
    }
  }

  const count = state.words.length;
  totalCountBadge.textContent = `${count} ${count === 1 ? 'word' : 'words'}`;

  updateActiveLetterOnScroll();
}

/**
 * Collect all active parts of speech for the Add modal.
 */
function getActiveAddPos() {
  const parsed = parseWordInput(smartTextInput.value);
  const posSet = new Set(parsed.partOfSpeech || []);

  if (addPosPicker) {
    addPosPicker.querySelectorAll('.pos-choice-btn.active').forEach(btn => {
      posSet.add(btn.getAttribute('data-pos'));
    });
  }

  return Array.from(posSet);
}

/**
 * Collect all active tags for the Add modal.
 */
function getActiveAddTags() {
  const parsed = parseWordInput(smartTextInput.value);
  const tagsSet = new Set(parsed.tags || []);

  addTagPicker.querySelectorAll('.tag-choice-btn.active').forEach(btn => {
    tagsSet.add(btn.getAttribute('data-tag'));
  });

  if (addCustomTags.value) {
    addCustomTags.value.split(/[,;]+/).map(normalizeTag).filter(Boolean).forEach(t => tagsSet.add(t));
  }

  return Array.from(tagsSet);
}

/**
 * Update the live detection preview as user types in the smart text box.
 */
function updateLivePreview() {
  const text = smartTextInput.value;
  const parsed = parseWordInput(text);
  const combinedPos = getActiveAddPos();
  const combinedTags = getActiveAddTags();

  previewWord.textContent = parsed.word || '—';
  previewPos.textContent = combinedPos.length > 0 ? combinedPos.join(' / ') : '—';
  previewDef.textContent = parsed.definition || '—';
  previewSource.textContent = parsed.source || '—';
  previewTags.textContent = combinedTags.length > 0 ? combinedTags.map(t => `#${t}`).join(' ') : '—';

  // Preview date: if manual date is input, use it; else if parsed date, use it; else default to today
  let previewDateVal = '—';
  if (addDateInput && addDateInput.value) {
    previewDateVal = formatDate(addDateInput.value + 'T12:00:00Z');
  } else if (parsed.dateAdded) {
    previewDateVal = formatDate(parsed.dateAdded);
    if (addDateInput && !addDateInput.dataset.manual) {
      addDateInput.value = parsed.dateAdded.substring(0, 10);
    }
  } else {
    previewDateVal = formatDate(new Date().toISOString());
  }
  if (previewDate) {
    previewDate.textContent = previewDateVal;
  }

  const isValid = Boolean(parsed.word && parsed.word.trim());
  submitWordBtn.disabled = !isValid;

  return parsed;
}

/**
 * Open the Add Word modal.
 */
function openAddModal() {
  addWordDialog.showModal();
  smartTextInput.value = '';
  addCustomTags.value = '';
  if (addDateInput) {
    addDateInput.value = '';
    delete addDateInput.dataset.manual;
  }
  if (addPosPicker) {
    addPosPicker.querySelectorAll('.pos-choice-btn').forEach(btn => btn.classList.remove('active'));
  }
  renderAddTagPicker();
  updateLivePreview();
  smartTextInput.focus();
}

/**
 * Close the Add Word modal and reset.
 */
function closeAddModal() {
  addWordDialog.close();
  smartTextInput.value = '';
  addCustomTags.value = '';
  if (addDateInput) {
    addDateInput.value = '';
    delete addDateInput.dataset.manual;
  }
  if (addPosPicker) {
    addPosPicker.querySelectorAll('.pos-choice-btn').forEach(btn => btn.classList.remove('active'));
  }
  addTagPicker.querySelectorAll('.tag-choice-btn').forEach(btn => btn.classList.remove('active'));
  updateLivePreview();
}

/**
 * Format entry date for export (e.g., "3/28/2021").
 */
function formatExportDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  } catch {
    return '';
  }
}

/**
 * Generate standard dictionary format (organized by A-Z headers).
 */
export function generateStandardExport(words) {
  const sorted = [...words].sort((a, b) => (a.word || '').localeCompare(b.word || '', undefined, { sensitivity: 'base' }));

  const now = new Date();
  const dateFormatted = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  let text = `================================================================================\n`;
  text += `CHELSEA'S DICTIONARY\n`;
  text += `Exported: ${dateFormatted}\n`;
  text += `Total Entries: ${sorted.length}\n`;
  text += `================================================================================\n\n`;

  let currentLetter = '';

  sorted.forEach(entry => {
    const letter = getFirstLetter(entry.word);

    if (letter !== currentLetter) {
      currentLetter = letter;
      text += `\n${currentLetter}\n${'─'.repeat(40)}\n\n`;
    }

    const posList = getPartsOfSpeech(entry);
    const posStr = posList.length > 0 ? ` (${posList.join(' / ')})` : '';

    text += `${entry.word}${posStr}\n`;
    text += `${entry.definition || ''}\n`;

    const metaParts = [];
    if (entry.source) metaParts.push(`Source: ${entry.source}`);
    const dateStr = formatExportDate(entry.dateAdded);
    if (dateStr) metaParts.push(`Added: ${dateStr}`);
    const tags = (entry.tags || []).map(normalizeTag).filter(Boolean);
    if (tags.length > 0) metaParts.push(`Tags: ${tags.map(t => '#' + t).join(' ')}`);

    if (metaParts.length > 0) {
      text += `[${metaParts.join(' • ')}]\n`;
    }

    text += `\n`;
  });

  return text.trim() + '\n';
}

/**
 * Generate compact notes format (one line per word, matching original notes).
 */
export function generateCompactExport(words) {
  const sorted = [...words].sort((a, b) => (a.word || '').localeCompare(b.word || '', undefined, { sensitivity: 'base' }));

  let text = '';
  let currentLetter = '';

  sorted.forEach(entry => {
    const letter = getFirstLetter(entry.word).toLowerCase();

    if (letter !== currentLetter) {
      currentLetter = letter;
      text += `${currentLetter}\n`;
    }

    const posList = getPartsOfSpeech(entry);
    const posStr = posList.length > 0 ? `, ${posList.join('/')}.` : '';

    let line = `${entry.word}${posStr} ${entry.definition || ''}`;

    const parenDetails = [];
    if (entry.source) {
      parenDetails.push(entry.source.startsWith('from ') ? entry.source : `from ${entry.source}`);
    }
    const dateStr = formatExportDate(entry.dateAdded);
    if (dateStr) {
      parenDetails.push(dateStr);
    }

    if (parenDetails.length > 0) {
      line += ` (${parenDetails.join(', ')})`;
    }

    const tags = (entry.tags || []).map(normalizeTag).filter(Boolean);
    if (tags.length > 0) {
      line += ` ${tags.map(t => '#' + t).join(' ')}`;
    }

    text += `${line.trim()}\n`;
  });

  return text.trim() + '\n';
}

/**
 * Trigger browser file download with text content.
 */
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Get the words to export based on selected scope radio.
 */
function getExportWords() {
  if (!exportDialog) return state.words;
  const scopeRadio = exportDialog.querySelector('input[name="export-scope"]:checked');
  const scope = scopeRadio ? scopeRadio.value : 'all';
  if (scope === 'filtered') {
    return getFilteredAndSortedWords();
  }
  return state.words;
}

/**
 * Get the selected export format.
 */
function getExportFormat() {
  if (!exportDialog) return 'standard';
  const formatRadio = exportDialog.querySelector('input[name="export-format"]:checked');
  return formatRadio ? formatRadio.value : 'standard';
}

/**
 * Update live preview in export modal.
 */
function updateExportPreview() {
  if (!exportPreview) return;
  const words = getExportWords();
  const format = getExportFormat();
  const fullText = format === 'compact' ? generateCompactExport(words) : generateStandardExport(words);

  const previewLines = fullText.split('\n').slice(0, 16).join('\n');
  exportPreview.textContent = previewLines + (fullText.split('\n').length > 16 ? '\n\n... (preview truncated)' : '');
}

/**
 * Open the Export modal.
 */
function openExportModal() {
  if (!exportDialog) return;
  const allCount = state.words.length;
  const filteredWords = getFilteredAndSortedWords();
  const filteredCount = filteredWords.length;

  if (exportAllCountLabel) {
    exportAllCountLabel.textContent = `All words (${allCount} ${allCount === 1 ? 'word' : 'words'})`;
  }

  const hasActiveFilter = (state.selectedPos !== 'all' || state.selectedTag !== 'all' || state.searchQuery.trim().length > 0);
  if (exportFilteredOption && exportFilteredCountLabel) {
    if (hasActiveFilter && filteredCount < allCount) {
      exportFilteredOption.style.display = 'flex';
      exportFilteredCountLabel.textContent = `Current filtered words (${filteredCount} ${filteredCount === 1 ? 'word' : 'words'})`;
    } else {
      exportFilteredOption.style.display = 'none';
      const allRadio = exportDialog.querySelector('input[name="export-scope"][value="all"]');
      if (allRadio) allRadio.checked = true;
    }
  }

  updateExportPreview();
  exportDialog.showModal();
}

/**
 * Close the Export modal.
 */
function closeExportModal() {
  if (exportDialog) {
    exportDialog.close();
  }
}

/**
 * Handle Download Export button click.
 */
function handleDownloadExport() {
  const words = getExportWords();
  const format = getExportFormat();
  const text = format === 'compact' ? generateCompactExport(words) : generateStandardExport(words);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const filename = `chelseas-dictionary-${dateStr}.txt`;

  downloadTextFile(filename, text);
  closeExportModal();
}

// ==========================================
// Google Drive Cloud Storage & Sync Logic
// ==========================================

export function syncDictionaryChanges() {
  localStorage.setItem('dictionary_last_local_update', String(Date.now()));

  // Queue background upload to Google Drive if connected
  if (window.DriveSync && window.DriveSync.isConnected()) {
    window.DriveSync.queueSync({
      words: state.words,
      customTags: getCustomTags(),
      updatedAt: Date.now()
    });
  }

  // Also save to local server disk if running on localhost dev server
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.words)
    }).catch(() => {});
  }
}

function setupDriveSync() {
  if (!window.DriveSync) return;

  window.DriveSync.init({
    onStatusChange: handleDriveStatusChange,
    onRemoteData: handleRemoteDriveData
  });

  if (driveSyncBtn) {
    driveSyncBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const clientId = window.DriveSync ? window.DriveSync.getClientId() : '';
      if (!clientId) {
        openDriveSettingsModal();
      } else {
        toggleSyncPopover();
      }
    });
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => {
      const status = window.DriveSync ? window.DriveSync.getStatus() : 'unconfigured';
      if (status === 'unconfigured') {
        closeSyncPopover();
        openDriveSettingsModal();
      } else if (status === 'disconnected') {
        closeSyncPopover();
        window.DriveSync.connect();
      } else {
        // Push local words or pull remote
        window.DriveSync.queueSync({
          words: state.words,
          customTags: getCustomTags(),
          updatedAt: Date.now()
        });
        window.DriveSync.syncNow();
      }
    });
  }

  if (syncSettingsBtn) {
    syncSettingsBtn.addEventListener('click', () => {
      closeSyncPopover();
      openDriveSettingsModal();
    });
  }

  if (syncSignoutBtn) {
    syncSignoutBtn.addEventListener('click', () => {
      closeSyncPopover();
      window.DriveSync.disconnect();
    });
  }

  // Modal Events
  if (closeDriveModalBtn) {
    closeDriveModalBtn.addEventListener('click', closeDriveSettingsModal);
  }

  if (cancelDriveModalBtn) {
    cancelDriveModalBtn.addEventListener('click', closeDriveSettingsModal);
  }

  if (saveDriveClientIdBtn) {
    saveDriveClientIdBtn.addEventListener('click', () => {
      const id = driveClientIdInput ? driveClientIdInput.value.trim() : '';
      if (id) {
        window.DriveSync.setClientId(id);
        closeDriveSettingsModal();
        window.DriveSync.connect();
      }
    });
  }

  if (driveSettingsModal) {
    driveSettingsModal.addEventListener('click', (e) => {
      if (e.target === driveSettingsModal) {
        closeDriveSettingsModal();
      }
    });
  }

  // Close popover on click outside
  document.addEventListener('click', (e) => {
    if (syncPopover && syncPopover.style.display !== 'none') {
      if (!syncPopover.contains(e.target) && !driveSyncBtn.contains(e.target)) {
        closeSyncPopover();
      }
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && driveSettingsModal && driveSettingsModal.style.display !== 'none') {
      closeDriveSettingsModal();
    }
  });
}

function handleDriveStatusChange({ status, detail, user, lastSync, clientId }) {
  if (!driveSyncBtn) return;

  driveSyncBtn.classList.remove('synced', 'syncing', 'error');

  if (status === 'unconfigured') {
    if (driveSyncIndicator) driveSyncIndicator.style.backgroundColor = 'var(--text-light)';
    if (driveStatusLabel) driveStatusLabel.textContent = 'Drive';
    driveSyncBtn.setAttribute('title', 'Connect Google Drive (Click to configure)');
    if (syncPopoverStatus) syncPopoverStatus.textContent = 'Setup required: enter Google OAuth Client ID.';
    if (syncSignoutBtn) syncSignoutBtn.style.display = 'none';
    if (syncNowBtn) syncNowBtn.textContent = 'Setup Drive';
  } else if (status === 'disconnected') {
    if (driveSyncIndicator) driveSyncIndicator.style.backgroundColor = 'var(--text-light)';
    if (driveStatusLabel) driveStatusLabel.textContent = 'Connect';
    driveSyncBtn.setAttribute('title', 'Click to connect Google Drive');
    if (syncPopoverStatus) syncPopoverStatus.textContent = 'Disconnected. Dictionary saved locally.';
    if (syncSignoutBtn) syncSignoutBtn.style.display = 'none';
    if (syncNowBtn) syncNowBtn.textContent = 'Connect Drive';
  } else if (status === 'connecting' || status === 'syncing') {
    driveSyncBtn.classList.add('syncing');
    if (driveStatusLabel) driveStatusLabel.textContent = 'Syncing...';
    driveSyncBtn.setAttribute('title', 'Syncing with Google Drive...');
    if (syncPopoverStatus) syncPopoverStatus.textContent = 'Syncing dictionary with Google Drive...';
  } else if (status === 'synced') {
    driveSyncBtn.classList.add('synced');
    if (driveStatusLabel) driveStatusLabel.textContent = 'Synced';
    const syncTimeStr = lastSync ? new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now';
    driveSyncBtn.setAttribute('title', `Synced to Google Drive (${syncTimeStr})`);
    if (syncPopoverStatus) syncPopoverStatus.textContent = `All words saved in Google Drive (${syncTimeStr}).`;
    if (syncSignoutBtn) syncSignoutBtn.style.display = 'block';
    if (syncNowBtn) syncNowBtn.textContent = 'Sync Now';
  } else if (status === 'error') {
    driveSyncBtn.classList.add('error');
    if (driveStatusLabel) driveStatusLabel.textContent = 'Error';
    driveSyncBtn.setAttribute('title', detail || 'Google Drive sync error');
    if (syncPopoverStatus) syncPopoverStatus.textContent = detail ? `Sync error: ${detail}` : 'Could not reach Google Drive.';
  } else if (status === 'offline') {
    if (driveSyncIndicator) driveSyncIndicator.style.backgroundColor = 'var(--accent-gold)';
    if (driveStatusLabel) driveStatusLabel.textContent = 'Offline';
    driveSyncBtn.setAttribute('title', 'Offline. Changes saved locally.');
    if (syncPopoverStatus) syncPopoverStatus.textContent = 'Device is offline. Changes saved locally.';
  }

  // Update User info in popover
  if (user && user.email) {
    if (syncUserName) syncUserName.textContent = user.name || 'Google Account';
    if (syncUserEmail) syncUserEmail.textContent = user.email;
    if (syncUserAvatar) {
      if (user.picture) {
        syncUserAvatar.innerHTML = `<img src="${user.picture}" alt="${user.name ? user.name.replace(/"/g, '&quot;') : 'Google Account'}" />`;
      } else {
        syncUserAvatar.textContent = (user.name || user.email || 'G').charAt(0).toUpperCase();
      }
    }
  } else {
    if (syncUserName) syncUserName.textContent = 'Google Drive';
    if (syncUserEmail) syncUserEmail.textContent = clientId ? 'Not connected' : 'Not configured';
    if (syncUserAvatar) syncUserAvatar.textContent = 'G';
  }
}

function handleRemoteDriveData(remoteData) {
  if (!remoteData) return;

  let remoteWords = null;
  let remoteTags = null;
  let remoteUpdatedAt = 0;

  if (Array.isArray(remoteData)) {
    remoteWords = remoteData;
  } else if (remoteData && typeof remoteData === 'object') {
    if (Array.isArray(remoteData.words)) {
      remoteWords = remoteData.words;
    }
    if (Array.isArray(remoteData.customTags)) {
      remoteTags = remoteData.customTags;
    }
    remoteUpdatedAt = Number(remoteData.updatedAt) || 0;
  }

  if (remoteWords && remoteWords.length > 0) {
    const localUpdatedAt = Number(localStorage.getItem('dictionary_last_local_update')) || 0;
    // Only update if remote is newer or local has not been updated locally
    if (remoteUpdatedAt >= localUpdatedAt || !localUpdatedAt) {
      const normalizedRemote = remoteWords.map(normalizeEntry);
      const hasChanged = JSON.stringify(state.words) !== JSON.stringify(normalizedRemote);

      if (hasChanged) {
        state.words = normalizedRemote;
        persistWords(state.words);

        if (remoteTags && remoteTags.length > 0) {
          registerCustomTags(remoteTags);
        }

        renderTagFilterBar();
        renderAddTagPicker();
        render();

        // Also save to local server disk if running on localhost dev server
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.words)
          }).catch(() => {});
        }
      }

      localStorage.setItem('dictionary_last_local_update', String(Math.max(remoteUpdatedAt, Date.now())));
    }
  } else if (state.words && state.words.length > 0) {
    // Remote drive file was newly created or empty, upload current local words
    if (window.DriveSync) {
      window.DriveSync.queueSync({
        words: state.words,
        customTags: getCustomTags(),
        updatedAt: Date.now()
      });
    }
  }
}

function toggleSyncPopover() {
  if (!syncPopover) return;
  if (syncPopover.style.display === 'none' || !syncPopover.style.display) {
    syncPopover.style.display = 'block';
  } else {
    closeSyncPopover();
  }
}

function closeSyncPopover() {
  if (syncPopover) syncPopover.style.display = 'none';
}

function openDriveSettingsModal() {
  if (!driveSettingsModal) return;
  closeSyncPopover();
  if (driveClientIdInput) {
    driveClientIdInput.value = window.DriveSync ? window.DriveSync.getClientId() : '';
  }
  driveSettingsModal.style.display = 'flex';
  if (driveClientIdInput) {
    setTimeout(() => driveClientIdInput.focus(), 50);
  }
}

function closeDriveSettingsModal() {
  if (driveSettingsModal) driveSettingsModal.style.display = 'none';
}

/**
 * Initialize event listeners.
 */
function initEvents() {
  // Search
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
    render();
  });

  clearSearchBtn.addEventListener('click', () => {
    state.searchQuery = '';
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    render();
  });

  // Sort Dropdown
  sortSelect.addEventListener('change', (e) => {
    state.selectedSort = e.target.value;
    render();
  });

  // POS Filter
  posFilterContainer.addEventListener('click', (e) => {
    const link = e.target.closest('.filter-link');
    if (!link) return;

    posFilterContainer.querySelectorAll('.filter-link').forEach(btn => {
      btn.classList.remove('active');
    });
    link.classList.add('active');

    state.selectedPos = link.getAttribute('data-pos') || 'all';
    render();
  });

  // Tag Filter in Header
  tagFilterContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-filter-btn');
    if (!btn) return;

    tagFilterContainer.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    state.selectedTag = btn.getAttribute('data-tag') || 'all';
    render();
  });

  // Add Modal interactions
  openAddModalBtn.addEventListener('click', openAddModal);
  closeModalBtn.addEventListener('click', closeAddModal);
  cancelModalBtn.addEventListener('click', closeAddModal);

  addWordDialog.addEventListener('click', (e) => {
    if (e.target === addWordDialog) {
      closeAddModal();
    }
  });

  smartTextInput.addEventListener('input', updateLivePreview);
  addCustomTags.addEventListener('input', updateLivePreview);
  if (addDateInput) {
    addDateInput.addEventListener('input', () => {
      addDateInput.dataset.manual = 'true';
      updateLivePreview();
    });
  }

  // Quick POS choice toggles in Add Modal
  if (addPosPicker) {
    addPosPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.pos-choice-btn');
      if (!btn) return;
      btn.classList.toggle('active');
      updateLivePreview();
    });
  }

  // Quick tag choice toggles in Add Modal
  addTagPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-choice-btn');
    if (!btn) return;
    btn.classList.toggle('active');
    updateLivePreview();
  });

  // Handle typing custom tags and pressing Enter or comma in Add Modal
  addCustomTags.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = addCustomTags.value.trim().replace(/,$/, '');
      if (val) {
        const newTags = val.split(/[,;]+/).map(normalizeTag).filter(Boolean);
        registerCustomTags(newTags);
        const currentActive = getActiveAddTags();
        newTags.forEach(t => currentActive.push(t));
        renderAddTagPicker(currentActive);
        renderTagFilterBar();
        addCustomTags.value = '';
        updateLivePreview();
      }
    }
  });

  // Quick POS choice toggles in Edit Modal
  if (editPosPicker) {
    editPosPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.pos-choice-btn');
      if (!btn) return;
      btn.classList.toggle('active');
    });
  }

  // Quick tag choice toggles in Edit Modal
  editTagPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-choice-btn');
    if (!btn) return;
    btn.classList.toggle('active');
  });

  // Handle typing custom tags and pressing Enter or comma in Edit Modal
  editCustomTags.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = editCustomTags.value.trim().replace(/,$/, '');
      if (val) {
        const newTags = val.split(/[,;]+/).map(normalizeTag).filter(Boolean);
        registerCustomTags(newTags);
        const currentActive = [];
        editTagPicker.querySelectorAll('.tag-choice-btn.active').forEach(b => currentActive.push(b.getAttribute('data-tag')));
        newTags.forEach(t => currentActive.push(t));
        renderEditTagPicker(currentActive);
        renderTagFilterBar();
        editCustomTags.value = '';
      }
    }
  });

  // Add Word Form submission
  addWordForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const parsed = parseWordInput(smartTextInput.value);

    if (!parsed.word) {
      alert('Please enter at least a word.');
      return;
    }

    const posList = getActiveAddPos();
    const tags = getActiveAddTags();
    registerCustomTags(tags);

    let dateAdded;
    if (addDateInput && addDateInput.value) {
      dateAdded = new Date(addDateInput.value + 'T12:00:00.000Z').toISOString();
    } else if (parsed.dateAdded) {
      dateAdded = parsed.dateAdded;
    } else {
      dateAdded = new Date().toISOString();
    }

    const newEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      word: parsed.word,
      partOfSpeech: posList.length > 0 ? posList : ['other'],
      definition: parsed.definition || '',
      source: parsed.source || '',
      tags: tags,
      dateAdded: dateAdded
    };

    state.words.unshift(newEntry);
    persistWords(state.words);

    renderTagFilterBar();
    renderAddTagPicker();
    render();
    closeAddModal();
    syncDictionaryChanges();
  });

  // Edit Modal interactions
  closeEditModalBtn.addEventListener('click', closeEditModal);
  cancelEditModalBtn.addEventListener('click', closeEditModal);

  editWordDialog.addEventListener('click', (e) => {
    if (e.target === editWordDialog) {
      closeEditModal();
    }
  });

  editWordForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = editWordId.value;
    const index = state.words.findIndex(w => w.id === id);

    if (index === -1) {
      closeEditModal();
      return;
    }

    const updatedWord = editWordInput.value.trim();
    const updatedDef = editDefInput.value.trim();
    const updatedSource = editSourceInput.value.trim();

    if (!updatedWord) {
      alert('Word cannot be empty.');
      return;
    }

    // Collect parts of speech from edit modal
    const posSet = new Set();
    if (editPosPicker) {
      editPosPicker.querySelectorAll('.pos-choice-btn.active').forEach(btn => {
        posSet.add(btn.getAttribute('data-pos'));
      });
    }
    if (editCustomPos && editCustomPos.value) {
      parsePosList(editCustomPos.value).forEach(p => posSet.add(p));
    }
    const updatedPos = Array.from(posSet);
    if (updatedPos.length === 0) {
      updatedPos.push('other');
    }

    // Collect tags from edit modal
    const tagsSet = new Set();
    editTagPicker.querySelectorAll('.tag-choice-btn.active').forEach(btn => {
      tagsSet.add(btn.getAttribute('data-tag'));
    });
    if (editCustomTags.value) {
      editCustomTags.value.split(/[,;]+/).map(normalizeTag).filter(Boolean).forEach(t => tagsSet.add(t));
    }
    const updatedTags = Array.from(tagsSet);
    registerCustomTags(updatedTags);

    // Determine updated dateAdded
    let updatedDate = state.words[index].dateAdded;
    if (editDateInput && editDateInput.value) {
      updatedDate = new Date(editDateInput.value + 'T12:00:00.000Z').toISOString();
    }

    state.words[index] = {
      ...state.words[index],
      word: updatedWord,
      partOfSpeech: updatedPos,
      definition: updatedDef,
      source: updatedSource,
      tags: updatedTags,
      dateAdded: updatedDate
    };

    persistWords(state.words);
    renderTagFilterBar();
    renderAddTagPicker();
    render();
    closeEditModal();
    syncDictionaryChanges();
  });

  // Back to Top button
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 280) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }, { passive: true });

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Export Modal interactions
  if (openExportModalBtn) {
    openExportModalBtn.addEventListener('click', openExportModal);
  }
  if (closeExportModalBtn) {
    closeExportModalBtn.addEventListener('click', closeExportModal);
  }
  if (cancelExportModalBtn) {
    cancelExportModalBtn.addEventListener('click', closeExportModal);
  }
  if (exportDialog) {
    exportDialog.addEventListener('click', (e) => {
      if (e.target === exportDialog) {
        closeExportModal();
      }
    });
    exportDialog.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', updateExportPreview);
    });
  }
  if (downloadExportBtn) {
    downloadExportBtn.addEventListener('click', handleDownloadExport);
  }

  // Alphabet Jump Bar interactions
  if (alphabetNavInner) {
    alphabetNavInner.addEventListener('click', (e) => {
      const btn = e.target.closest('.alpha-jump-btn');
      if (!btn || btn.disabled || btn.classList.contains('disabled')) return;

      const action = btn.getAttribute('data-action');
      if (action === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const letter = btn.getAttribute('data-letter');
      if (letter) {
        jumpToLetter(letter);
      }
    });
  }

  // ScrollSpy listener to update active letter button as user scrolls
  window.addEventListener('scroll', updateActiveLetterOnScroll, { passive: true });

  // Google Drive Cloud Sync setup
  setupDriveSync();
}

initEvents();
renderTagFilterBar();
renderAddTagPicker();
render();

// Jump to letter if anchor hash is present in URL
if (window.location.hash && window.location.hash.startsWith('#letter-')) {
  const hashLetter = window.location.hash.replace('#letter-', '').toUpperCase();
  setTimeout(() => {
    jumpToLetter(hashLetter);
  }, 150);
}
