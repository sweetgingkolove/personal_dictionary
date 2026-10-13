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

function normalizePos(str) {
  if (!str) return '';
  const cleaned = str.trim().toLowerCase().replace(/[\(\)\[\]\.\,]/g, '');
  return POS_MAP[cleaned] || cleaned;
}

function parsePosList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(normalizePos).filter(Boolean);
  }
  return String(input)
    .split(/[/,&+]|\band\b/i)
    .map(normalizePos)
    .filter(Boolean);
}

function getPartsOfSpeech(entry) {
  if (!entry) return [];
  return parsePosList(entry.partOfSpeech);
}

function normalizeTag(tag) {
  return tag.replace(/^#/, '').trim().toLowerCase();
}

function normalizeEntry(entry) {
  if (!entry) return entry;
  return {
    ...entry,
    partOfSpeech: getPartsOfSpeech(entry)
  };
}

/**
 * Load words from localStorage or fallback to INITIAL_WORDS.
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
 * Shuffle array using Fisher-Yates.
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Escape HTML for safe insertion.
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

// Global Application State
const state = {
  allWords: loadWords(),
  mode: 'quiz', // 'quiz' | 'flashcards' | 'forge'
  filterTag: 'all',
  filterPos: 'all',
  roundSize: 10,
  deck: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  maxStreak: 0,
  history: [], // tracks results for round summary
  flashcardFlipped: false,
  forgeState: {
    enteredLetters: [],
    availableLetters: [],
    hintsUsed: 0
  }
};

// DOM Elements
const practicePoolBadge = document.getElementById('practice-pool-badge');
const modeTabs = document.getElementById('mode-tabs');
const tagSelect = document.getElementById('practice-tag-select');
const posSelect = document.getElementById('practice-pos-select');
const roundSizeSelect = document.getElementById('practice-round-size');
const restartBtn = document.getElementById('practice-restart-btn');
const statusProgressBar = document.getElementById('round-status-bar');
const statusProgressText = document.getElementById('status-progress-text');
const scorePill = document.getElementById('score-pill');
const streakPill = document.getElementById('streak-pill');
const progressMeter = document.getElementById('progress-meter');
const progressMeterFill = document.getElementById('progress-meter-fill');
const gameArena = document.getElementById('game-arena');
const backToTopBtn = document.getElementById('back-to-top-btn');

/**
 * Filter all words according to active tag and POS selections.
 */
function getMatchingWords() {
  return state.allWords.filter(entry => {
    if (!entry.word || !entry.definition) return false;

    if (state.filterTag !== 'all') {
      const tags = (entry.tags || []).map(normalizeTag);
      if (!tags.includes(state.filterTag)) {
        return false;
      }
    }

    if (state.filterPos !== 'all') {
      const posList = getPartsOfSpeech(entry);
      if (!posList.includes(state.filterPos)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Update the words pool count badge in the header.
 */
function updatePoolBadge() {
  const matching = getMatchingWords();
  practicePoolBadge.textContent = `${matching.length} ${matching.length === 1 ? 'word' : 'words'} available`;
}

/**
 * Start a brand-new practice round with current settings.
 */
function startNewRound(customDeck = null) {
  let candidates = customDeck || getMatchingWords();

  if (candidates.length === 0) {
    state.deck = [];
    state.currentIndex = 0;
    renderEmptyArena();
    return;
  }

  const shuffled = shuffle(candidates);
  const size = state.roundSize === 'all' ? shuffled.length : Math.min(Number(state.roundSize), shuffled.length);

  state.deck = shuffled.slice(0, size);
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.history = [];
  state.flashcardFlipped = false;

  updateStats();
  renderCurrentQuestion();
}

/**
 * Update progress bar and score/streak pill badges.
 */
function updateStats() {
  const total = state.deck.length;
  const currentNum = Math.min(state.currentIndex + 1, total);

  statusProgressText.textContent = total > 0 ? `Word ${currentNum} of ${total}` : 'Round complete';
  scorePill.textContent = `Score: ${state.score}`;
  streakPill.textContent = `Streak: ${state.streak} 🔥`;

  if (state.streak > state.maxStreak) {
    state.maxStreak = state.streak;
  }

  const pct = total > 0 ? Math.round((state.currentIndex / total) * 100) : 0;
  progressMeterFill.style.width = `${pct}%`;
}

/**
 * Render empty state if no words match chosen filters.
 */
function renderEmptyArena() {
  statusProgressBar.style.display = 'none';
  progressMeter.style.display = 'none';

  gameArena.innerHTML = `
    <div class="empty-arena">
      <div class="empty-icon">📖</div>
      <h2 class="empty-title">No words match these filters</h2>
      <p class="empty-subtitle">Try selecting "All Tags" or "All Types" to practice with your full dictionary.</p>
      <button class="practice-action-btn" id="reset-filters-btn">Reset Filters</button>
    </div>
  `;

  const resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      tagSelect.value = 'all';
      posSelect.value = 'all';
      state.filterTag = 'all';
      state.filterPos = 'all';
      updatePoolBadge();
      startNewRound();
    });
  }
}

/**
 * Render the current word based on the active mode.
 */
function renderCurrentQuestion() {
  statusProgressBar.style.display = 'flex';
  progressMeter.style.display = 'block';

  if (state.currentIndex >= state.deck.length) {
    renderSummaryScreen();
    return;
  }

  updateStats();

  const entry = state.deck[state.currentIndex];

  if (state.mode === 'quiz') {
    renderQuizQuestion(entry);
  } else if (state.mode === 'flashcards') {
    renderFlashcard(entry);
  } else if (state.mode === 'forge') {
    renderWordForge(entry);
  }
}

/* ==========================================================================
   GAME MODE 1: DEFINITION MATCH (QUIZ)
   ========================================================================== */

function generateQuizDistractors(currentEntry) {
  const currentPosList = getPartsOfSpeech(currentEntry);
  const primaryPos = currentPosList[0] || '';

  // Separate words by matching POS vs other
  const samePosCandidates = [];
  const otherCandidates = [];

  state.allWords.forEach(w => {
    if (w.word.toLowerCase() === currentEntry.word.toLowerCase()) return;
    if (!w.definition || w.definition.trim().length < 5) return;

    const wPos = getPartsOfSpeech(w);
    if (primaryPos && wPos.includes(primaryPos)) {
      samePosCandidates.push(w.definition);
    } else {
      otherCandidates.push(w.definition);
    }
  });

  const distractors = [];
  const shuffledSame = shuffle(samePosCandidates);
  const shuffledOther = shuffle(otherCandidates);

  // Take up to 3 from same POS, and fallback to others
  while (distractors.length < 3 && shuffledSame.length > 0) {
    distractors.push(shuffledSame.pop());
  }
  while (distractors.length < 3 && shuffledOther.length > 0) {
    distractors.push(shuffledOther.pop());
  }

  return distractors;
}

function renderQuizQuestion(entry) {
  const posList = getPartsOfSpeech(entry);
  const posBadge = posList.length > 0 ? `<span class="quiz-pos-badge">${escapeHtml(posList.join(' / '))}</span>` : '';
  const distractors = generateQuizDistractors(entry);

  const choices = shuffle([
    { text: entry.definition, isCorrect: true },
    ...distractors.map(d => ({ text: d, isCorrect: false }))
  ]);

  const letters = ['A', 'B', 'C', 'D'];

  const choicesHtml = choices.map((choice, i) => `
    <button class="quiz-choice-btn" data-correct="${choice.isCorrect}">
      <span class="choice-letter">${letters[i]}</span>
      <span class="choice-text">${escapeHtml(choice.text)}</span>
    </button>
  `).join('');

  gameArena.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-prompt-card">
        <div class="quiz-prompt-header">
          <span class="quiz-hint-tag">Definition Match</span>
          ${posBadge}
        </div>
        <h2 class="quiz-prompt-word">${escapeHtml(entry.word)}</h2>
      </div>

      <div class="quiz-choices-grid" id="quiz-choices">
        ${choicesHtml}
      </div>

      <div class="quiz-feedback-box" id="quiz-feedback" style="display: none;"></div>
    </div>
  `;

  const choicesContainer = document.getElementById('quiz-choices');
  const feedbackBox = document.getElementById('quiz-feedback');
  let answered = false;

  choicesContainer.querySelectorAll('.quiz-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;

      const isCorrect = btn.getAttribute('data-correct') === 'true';

      // Visual feedback on buttons
      choicesContainer.querySelectorAll('.quiz-choice-btn').forEach(b => {
        b.disabled = true;
        if (b.getAttribute('data-correct') === 'true') {
          b.classList.add('correct');
        } else if (b === btn && !isCorrect) {
          b.classList.add('incorrect');
        }
      });

      if (isCorrect) {
        state.score++;
        state.streak++;
      } else {
        state.streak = 0;
      }
      updateStats();

      state.history.push({
        entry,
        correct: isCorrect,
        userSelection: btn.querySelector('.choice-text').textContent
      });

      const metaParts = [];
      if (entry.source) metaParts.push(`Source: ${escapeHtml(entry.source)}`);
      const tags = (entry.tags || []).map(normalizeTag).filter(Boolean);
      if (tags.length > 0) metaParts.push(`Tags: ${tags.map(t => '#' + escapeHtml(t)).join(' ')}`);

      const metaHtml = metaParts.length > 0 ? `<div class="feedback-meta">${metaParts.join(' &bull; ')}</div>` : '';

      feedbackBox.className = `quiz-feedback-box ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
      feedbackBox.innerHTML = `
        <div class="feedback-content">
          <div class="feedback-title">${isCorrect ? '✓ Correct!' : '✕ Not quite'}</div>
          <div class="feedback-desc"><strong>${escapeHtml(entry.word)}</strong>: ${escapeHtml(entry.definition)}</div>
          ${metaHtml}
        </div>
        <button class="feedback-next-btn" id="quiz-next-btn">
          ${state.currentIndex + 1 >= state.deck.length ? 'View Results &rarr;' : 'Next Word &rarr;'}
        </button>
      `;
      feedbackBox.style.display = 'flex';

      const nextBtn = document.getElementById('quiz-next-btn');
      if (nextBtn) {
        nextBtn.focus();
        nextBtn.addEventListener('click', () => {
          state.currentIndex++;
          renderCurrentQuestion();
        });
      }
    });
  });
}

/* ==========================================================================
   GAME MODE 2: FLASHCARDS
   ========================================================================== */

function renderFlashcard(entry) {
  state.flashcardFlipped = false;

  const posList = getPartsOfSpeech(entry);
  const posStr = posList.length > 0 ? posList.join(' / ') : '';
  const tagsList = (entry.tags || []).map(normalizeTag).filter(Boolean);
  const tagsHtml = tagsList.length > 0 ? tagsList.map(t => `<span class="tag-badge">#${escapeHtml(t)}</span>`).join(' ') : '';

  const metaParts = [];
  if (entry.source) metaParts.push(`Found in: ${escapeHtml(entry.source)}`);

  gameArena.innerHTML = `
    <div class="flashcard-scene">
      <div class="flashcard" id="flashcard" role="button" tabindex="0" aria-label="Flashcard for ${escapeHtml(entry.word)}. Tap to flip.">
        <!-- Front Side -->
        <div class="flashcard-face flashcard-front">
          <div class="flashcard-header">
            <span class="flashcard-badge">Card ${state.currentIndex + 1} of ${state.deck.length}</span>
            ${posStr ? `<span class="flashcard-pos">${escapeHtml(posStr)}</span>` : ''}
          </div>
          <div class="flashcard-body">
            <h2 class="flashcard-term">${escapeHtml(entry.word)}</h2>
            ${entry.source ? `<div class="flashcard-source-hint">from: ${escapeHtml(entry.source)}</div>` : ''}
          </div>
          <div class="flashcard-footer">
            <span class="flip-hint">Tap card or press Space to flip ↺</span>
          </div>
        </div>

        <!-- Back Side -->
        <div class="flashcard-face flashcard-back">
          <div class="flashcard-header">
            <span class="flashcard-badge">Definition</span>
            ${posStr ? `<span class="flashcard-pos">${escapeHtml(posStr)}</span>` : ''}
          </div>
          <div class="flashcard-body">
            <h3 class="flashcard-term-small">${escapeHtml(entry.word)}</h3>
            <p class="flashcard-def">${escapeHtml(entry.definition)}</p>
            ${tagsHtml ? `<div class="flashcard-tags">${tagsHtml}</div>` : ''}
            ${metaParts.length > 0 ? `<div class="flashcard-meta">${metaParts.join(' &bull; ')}</div>` : ''}
          </div>
          <div class="flashcard-footer">
            <span class="flip-hint">Tap to flip back ↺</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flashcard-actions">
        <button class="fc-btn fc-learning" id="fc-learning-btn" title="Review this word again">
          Still Learning
        </button>
        <button class="fc-btn fc-flip" id="fc-flip-btn" title="Flip card">
          Flip ↺
        </button>
        <button class="fc-btn fc-mastered" id="fc-mastered-btn" title="Mark as mastered">
          Mastered ✓
        </button>
      </div>
    </div>
  `;

  const card = document.getElementById('flashcard');
  const flipBtn = document.getElementById('fc-flip-btn');
  const learningBtn = document.getElementById('fc-learning-btn');
  const masteredBtn = document.getElementById('fc-mastered-btn');

  function toggleFlip() {
    state.flashcardFlipped = !state.flashcardFlipped;
    card.classList.toggle('is-flipped', state.flashcardFlipped);
  }

  card.addEventListener('click', toggleFlip);
  flipBtn.addEventListener('click', toggleFlip);

  learningBtn.addEventListener('click', () => {
    state.streak = 0;
    // Re-queue card to end of deck so user encounters it again!
    state.deck.push(entry);
    state.history.push({ entry, correct: false });
    state.currentIndex++;
    renderCurrentQuestion();
  });

  masteredBtn.addEventListener('click', () => {
    state.score++;
    state.streak++;
    state.history.push({ entry, correct: true });
    state.currentIndex++;
    renderCurrentQuestion();
  });
}

/* ==========================================================================
   GAME MODE 3: WORD FORGE (LETTER PUZZLE / UNSCRAMBLE)
   ========================================================================== */

function renderWordForge(entry) {
  const targetWord = entry.word.trim();
  const cleanTargetLetters = targetWord.replace(/[^a-zA-Z]/g, '').toLowerCase().split('');

  // Generate scrambled letter bank: target letters + 2 random distractors
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const distractors = [
    alphabet[Math.floor(Math.random() * alphabet.length)],
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ];
  const allBankLetters = shuffle([...cleanTargetLetters, ...distractors]).map((char, id) => ({
    id: `${char}-${id}-${Math.random()}`,
    char: char,
    used: false
  }));

  state.forgeState = {
    target: targetWord,
    cleanLetters: cleanTargetLetters,
    bank: allBankLetters,
    placedTiles: [], // array of tile objects placed in slots
    hintsRevealed: 0
  };

  const posList = getPartsOfSpeech(entry);
  const posBadge = posList.length > 0 ? `<span class="quiz-pos-badge">${escapeHtml(posList.join(' / '))}</span>` : '';

  gameArena.innerHTML = `
    <div class="forge-container">
      <div class="forge-clue-card">
        <div class="forge-clue-header">
          <span class="forge-tag">Word Forge</span>
          ${posBadge}
        </div>
        <p class="forge-definition">"${escapeHtml(entry.definition)}"</p>
        ${entry.source ? `<div class="forge-source-hint">Hint: found in ${escapeHtml(entry.source)}</div>` : ''}
      </div>

      <!-- Letter Slots (where entered tiles go) -->
      <div class="forge-slots-row" id="forge-slots">
        <!-- Rendered by updateForgeDisplay -->
      </div>

      <!-- Scrambled Letter Tiles -->
      <div class="forge-bank-row" id="forge-bank">
        <!-- Rendered by updateForgeDisplay -->
      </div>

      <!-- Controls -->
      <div class="forge-controls">
        <button class="forge-btn-clear" id="forge-clear-btn" title="Clear entered letters">Clear</button>
        <button class="forge-btn-hint" id="forge-hint-btn" title="Reveal the next letter">Hint (💡)</button>
        <button class="forge-btn-check" id="forge-check-btn">Check Answer</button>
      </div>

      <div class="forge-feedback" id="forge-feedback" style="display: none;"></div>
    </div>
  `;

  const slotsContainer = document.getElementById('forge-slots');
  const bankContainer = document.getElementById('forge-bank');
  const clearBtn = document.getElementById('forge-clear-btn');
  const hintBtn = document.getElementById('forge-hint-btn');
  const checkBtn = document.getElementById('forge-check-btn');
  const feedbackBox = document.getElementById('forge-feedback');

  function updateForgeDisplay() {
    const { cleanLetters, bank, placedTiles } = state.forgeState;

    // Render slots
    slotsContainer.innerHTML = cleanLetters.map((_, index) => {
      const tile = placedTiles[index];
      if (tile) {
        return `<div class="forge-slot filled" data-index="${index}">${tile.char.toUpperCase()}</div>`;
      }
      return `<div class="forge-slot empty" data-index="${index}"></div>`;
    }).join('');

    // Render bank
    bankContainer.innerHTML = bank.map(tile => {
      return `
        <button class="forge-tile-btn ${tile.used ? 'used' : ''}" data-id="${tile.id}" ${tile.used ? 'disabled' : ''}>
          ${tile.char.toUpperCase()}
        </button>
      `;
    }).join('');

    // Click on filled slot removes that tile
    slotsContainer.querySelectorAll('.forge-slot.filled').forEach(slot => {
      slot.addEventListener('click', () => {
        const idx = Number(slot.getAttribute('data-index'));
        const removedTile = placedTiles.splice(idx, 1)[0];
        if (removedTile) {
          const bankItem = bank.find(b => b.id === removedTile.id);
          if (bankItem) bankItem.used = false;
        }
        feedbackBox.style.display = 'none';
        updateForgeDisplay();
      });
    });

    // Click on bank tile adds to slots
    bankContainer.querySelectorAll('.forge-tile-btn:not(.used)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (placedTiles.length >= cleanLetters.length) return;
        const id = btn.getAttribute('data-id');
        const bankItem = bank.find(b => b.id === id);
        if (bankItem && !bankItem.used) {
          bankItem.used = true;
          placedTiles.push(bankItem);
          feedbackBox.style.display = 'none';
          updateForgeDisplay();

          // Auto-check when all slots filled
          if (placedTiles.length === cleanLetters.length) {
            checkAnswer();
          }
        }
      });
    });
  }

  function checkAnswer() {
    const { cleanLetters, placedTiles } = state.forgeState;
    const spelled = placedTiles.map(t => t.char).join('');
    const correctStr = cleanLetters.join('');

    if (spelled === correctStr) {
      state.score++;
      state.streak++;
      updateStats();

      state.history.push({ entry, correct: true });

      feedbackBox.className = 'forge-feedback feedback-correct';
      feedbackBox.innerHTML = `
        <div class="forge-feedback-msg">
          <div class="feedback-title">✓ Brilliant! "${escapeHtml(targetWord)}" is correct!</div>
          <div class="forge-feedback-def">${escapeHtml(entry.definition)}</div>
        </div>
        <div class="forge-action-row">
          <button class="forge-next-btn" id="forge-next-btn">
            ${state.currentIndex + 1 >= state.deck.length ? 'View Results &rarr;' : 'Next Word &rarr;'}
          </button>
        </div>
      `;
      feedbackBox.style.display = 'flex';

      const nextBtn = document.getElementById('forge-next-btn');
      if (nextBtn) {
        nextBtn.focus();
        nextBtn.addEventListener('click', () => {
          state.currentIndex++;
          renderCurrentQuestion();
        });
      }
    } else {
      feedbackBox.className = 'forge-feedback feedback-incorrect';
      feedbackBox.innerHTML = `
        <div class="forge-feedback-msg">
          <div class="feedback-title">✕ Not quite right</div>
          <div class="forge-feedback-def">Try rearranging your tiles or click Hint (💡) to reveal a letter!</div>
        </div>
      `;
      feedbackBox.style.display = 'flex';
    }
  }

  clearBtn.addEventListener('click', () => {
    state.forgeState.placedTiles.forEach(t => {
      const b = state.forgeState.bank.find(item => item.id === t.id);
      if (b) b.used = false;
    });
    state.forgeState.placedTiles = [];
    feedbackBox.style.display = 'none';
    updateForgeDisplay();
  });

  hintBtn.addEventListener('click', () => {
    const { cleanLetters, bank, placedTiles } = state.forgeState;
    const nextSlotIndex = placedTiles.length;
    if (nextSlotIndex >= cleanLetters.length) return;

    const neededChar = cleanLetters[nextSlotIndex];
    // Find unused bank tile with this char
    let match = bank.find(b => b.char === neededChar && !b.used);
    if (!match) {
      // If already incorrectly used elsewhere, release it
      const incorrectPlacedIdx = placedTiles.findIndex((t, i) => t.char === neededChar && cleanLetters[i] !== neededChar);
      if (incorrectPlacedIdx !== -1) {
        match = placedTiles.splice(incorrectPlacedIdx, 1)[0];
      }
    }

    if (match) {
      match.used = true;
      placedTiles.push(match);
      updateForgeDisplay();
      if (placedTiles.length === cleanLetters.length) {
        checkAnswer();
      }
    }
  });

  checkBtn.addEventListener('click', checkAnswer);

  updateForgeDisplay();
}

/* ==========================================================================
   ROUND SUMMARY SCREEN
   ========================================================================== */

function renderSummaryScreen() {
  statusProgressBar.style.display = 'none';
  progressMeterFill.style.width = '100%';

  const total = state.deck.length;
  const score = state.score;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  let praise = '';
  if (pct === 100) praise = 'Flawless recall! You have complete mastery of this set.';
  else if (pct >= 80) praise = 'Outstanding work! Your vocabulary is expanding rapidly.';
  else if (pct >= 50) praise = 'Good study session! Review the words below to lock them in.';
  else praise = 'Keep practicing! Regular repetition builds long-term vocabulary memory.';

  // Gather missed words
  const missedWords = state.history.filter(h => !h.correct).map(h => h.entry);
  const uniqueMissed = Array.from(new Set(missedWords));

  const missedListHtml = uniqueMissed.length > 0 ? `
    <div class="summary-review-card">
      <h3 class="review-title">Words to Review (${uniqueMissed.length})</h3>
      <div class="review-words-list">
        ${uniqueMissed.map(entry => {
          const posList = getPartsOfSpeech(entry);
          return `
            <div class="review-word-item">
              <div class="review-term-row">
                <strong class="review-term">${escapeHtml(entry.word)}</strong>
                ${posList.length > 0 ? `<span class="review-pos">${escapeHtml(posList.join(' / '))}</span>` : ''}
              </div>
              <p class="review-def">${escapeHtml(entry.definition)}</p>
            </div>
          `;
        }).join('')}
      </div>
      <button class="review-practice-btn" id="practice-missed-btn">
        Practice Only These ${uniqueMissed.length} Words &rarr;
      </button>
    </div>
  ` : `
    <div class="summary-perfect-card">
      <div class="perfect-trophy">🌟</div>
      <p class="perfect-text">Zero errors! You answered every word correctly this round.</p>
    </div>
  `;

  gameArena.innerHTML = `
    <div class="summary-container">
      <div class="summary-score-hero">
        <span class="summary-label">Round Complete</span>
        <div class="summary-score-number">${score} <span class="summary-total">/ ${total}</span></div>
        <div class="summary-pct">${pct}% Accuracy &bull; Peak Streak: ${state.maxStreak} 🔥</div>
        <p class="summary-praise">${praise}</p>
      </div>

      ${missedListHtml}

      <div class="summary-actions">
        <button class="practice-action-btn" id="play-again-btn">
          Play Again
        </button>
        <a href="index.html" class="summary-back-btn">
          Back to Dictionary
        </a>
      </div>
    </div>
  `;

  const playAgainBtn = document.getElementById('play-again-btn');
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => startNewRound());
  }

  const practiceMissedBtn = document.getElementById('practice-missed-btn');
  if (practiceMissedBtn) {
    practiceMissedBtn.addEventListener('click', () => {
      startNewRound(uniqueMissed);
    });
  }
}

/* ==========================================================================
   INITIALIZATION & EVENT BINDINGS
   ========================================================================== */

function initEvents() {
  // Mode switcher tabs
  modeTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-tab-btn');
    if (!btn) return;

    modeTabs.querySelectorAll('.mode-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    state.mode = btn.getAttribute('data-mode');
    startNewRound();
  });

  // Filter changes
  tagSelect.addEventListener('change', (e) => {
    state.filterTag = e.target.value;
    updatePoolBadge();
    startNewRound();
  });

  posSelect.addEventListener('change', (e) => {
    state.filterPos = e.target.value;
    updatePoolBadge();
    startNewRound();
  });

  roundSizeSelect.addEventListener('change', (e) => {
    state.roundSize = e.target.value;
    startNewRound();
  });

  restartBtn.addEventListener('click', () => startNewRound());

  // Back to top button
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

  // Keyboard accessibility
  window.addEventListener('keydown', (e) => {
    // Only handle if not typing in an input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    // Quiz hotkeys: 1, 2, 3, 4
    if (state.mode === 'quiz') {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 4) {
        const choices = document.querySelectorAll('.quiz-choice-btn');
        if (choices[num - 1]) choices[num - 1].click();
      }
    }

    // Flashcard hotkey: Space bar flips card
    if (state.mode === 'flashcards' && e.code === 'Space') {
      e.preventDefault();
      const card = document.getElementById('flashcard');
      if (card) card.click();
    }
  });
}

const CUSTOM_TAGS_STORAGE_KEY = 'personal_dictionary_custom_tags';
const SUGGESTED_TAGS = ['architecture', 'botany and zoology', 'christian', 'color', 'french', 'geology', 'latin', 'medical', 'military', 'nautical', 'textiles'];

function getAllPracticeTags() {
  const tagSet = new Set(SUGGESTED_TAGS);
  if (state.allWords && Array.isArray(state.allWords)) {
    state.allWords.forEach(entry => {
      (entry.tags || []).forEach(t => {
        const clean = normalizeTag(t);
        if (clean) tagSet.add(clean);
      });
    });
  }

  try {
    const raw = localStorage.getItem(CUSTOM_TAGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(t => {
          const clean = normalizeTag(t);
          if (clean) tagSet.add(clean);
        });
      }
    }
  } catch {}

  const custom = Array.from(tagSet)
    .filter(t => !SUGGESTED_TAGS.includes(t))
    .sort((a, b) => a.localeCompare(b));

  return [...SUGGESTED_TAGS, ...custom];
}

function populateTagSelect() {
  if (!tagSelect) return;
  const currentVal = tagSelect.value || state.filterTag || 'all';
  const allTags = getAllPracticeTags();

  tagSelect.innerHTML = `
    <option value="all">All Tags</option>
    ${allTags.map(tag => `
      <option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>
    `).join('')}
  `;

  if (allTags.includes(currentVal) || currentVal === 'all') {
    tagSelect.value = currentVal;
    state.filterTag = currentVal;
  } else {
    tagSelect.value = 'all';
    state.filterTag = 'all';
  }
}

// Initial Boot
populateTagSelect();
updatePoolBadge();
initEvents();
startNewRound();
