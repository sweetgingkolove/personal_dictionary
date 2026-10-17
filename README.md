# Chelsea's Dictionary

A clean, responsive personal dictionary web application designed to help you curate, search, and master your vocabulary. Built as a pure static web app ready for GitHub Pages hosting, with a zero-dependency local auto-reload development server.

## Features

- **Vintage 1800s Lexicon Aesthetic**: Styled after 19th-century dictionaries with warm aged library book tones, authentic typography (`Cinzel`, `EB Garamond`), and printer's rules.
- **Dictionary Viewer**: Browse curated words with phonetic styling, parts of speech, definitions, example sentences, and contextual notes.
- **Instant Search & POS Filters**: Real-time search across words, definitions, and tags; quick filters for nouns, verbs, adjectives, adverbs, prepositions, and phrases.
- **Alphabet Quick-Jump Index**: Thumb index navigation bar (A–Z) that sticks as you scroll, allowing one-tap jumps to letter sections with live word counts, disabled states for empty letters, and real-time scroll tracking.
- **Dynamic Custom Tags**: Filter words by tag or create custom tags that dynamically appear as options across all entries and filter bars.
- **Practice & Quizzes Suite**: Dedicated interactive learning arena (`practice.html`) featuring:
  - **Definition Match**: Multiple-choice speed quiz with streak counters and instant feedback.
  - **Flashcards**: Archival 3D-flipping cards with mastery tracking.
  - **Word Forge**: Anagram & spelling letterpress tile puzzle with keyboard support and hints.
- **Google Drive Cloud Sync**: Offline-first, debounced cloud synchronization to your private Google Drive (`dictionary_words.json`) with silent background token renewal, keeping your lexicon in sync across phone, tablet, and computer.
- **Export Dictionary**: Download all words and definitions as a clean, formatted text file.
- **Audio Pronunciation**: Uses the browser's built-in Web Speech API to pronounce words aloud.
- **Mobile Optimized**: Ergonomic mobile layout with bottom-sheet modals, touch-friendly controls, and iOS auto-zoom prevention.
- **Auto-Reload Local Server**: Zero-dependency Python dev server with Server-Sent Events (SSE).
- **GitHub Pages Ready**: Zero build steps or bundlers required—just push to GitHub and host on GitHub Pages.

---

## ☁️ Google Drive Cloud Storage & Sync Setup

Chelsea's Dictionary synchronizes your lexicon to a private file (`dictionary_words.json`) in your Google Drive using least-privilege permissions (`drive.file`).

### Quick Setup (2 Minutes):
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. `Dictionary` or reuse your existing project from `Tasks`).
2. Navigate to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen**:
   - Choose **External**, enter an app name (e.g. *Chelsea's Dictionary*), and add your Google email as a **Test User**.
4. Go to **Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, add:
     - `http://localhost:8000` (for local development)
     - `https://sweetgingkolove.github.io` (for GitHub Pages hosting)
5. Copy your **Client ID** (looks like `123456789-xyz.apps.googleusercontent.com`).
6. In **Chelsea's Dictionary**, click the **Drive** pill in the top header, paste your Client ID, and click **Save & Connect**.
7. Google will prompt authorization once — from then on, your session stays active automatically via silent token renewal!

---

## Getting Started Locally

### Option 1: Double-click
Double-click `run.bat` in the project folder.

### Option 2: Command Line
Run the local dev server using the Python launcher:

```bash
py serve.py
```

This will:
1. Start the server at `http://localhost:8000`.
2. Automatically open your default browser.
3. Watch for changes in `.html`, `.css`, and `.js` files and automatically refresh the browser when saved.

To stop the server, press `Ctrl + C` in the terminal.

---

## Project Structure

```text
personal_dictionary/
├── index.html        # Main dictionary viewer, search, and word editor
├── practice.html     # Interactive games (Quiz, Flashcards, Word Forge)
├── css/
│   └── styles.css    # 1800s vintage book styling, animations, and responsive layout
├── js/
│   ├── app.js        # Main dictionary UI, search, tag system, export, modals
│   ├── drive-sync.js # Google Drive cloud storage and sync engine
│   ├── practice.js   # Quiz, flashcards, word forge games logic
│   └── words.js      # Curated dictionary vocabulary entries
├── serve.py          # Python dev server with auto-reload (zero dependencies)
├── run.bat           # Windows quick-launcher script
└── README.md         # Project documentation
```

---

## Adding or Editing Words

All dictionary data is stored locally and synchronized with your personal Google Drive (`dictionary_words.json`). You can add new words directly through the web UI using the **+ Add word** button, or via the `INITIAL_WORDS` seed in [`js/words.js`](js/words.js).

---

## Deploying to GitHub Pages

Because this project uses vanilla HTML, CSS, and modern JavaScript modules, deploying to GitHub Pages takes less than a minute:

1. Initialize git and commit your files (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Add Google Drive cloud sync to personal dictionary"
   ```
2. Create a repository on GitHub (e.g. `personal_dictionary`).
3. Add the remote and push:
   ```bash
   git remote add origin https://github.com/<your-username>/personal_dictionary.git
   git branch -M main
   git push -u origin main
   ```
4. On your GitHub repository page:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
   - Select branch **`main`** and folder **`/ (root)`**, then click **Save**.
5. Your dictionary will be live at `https://<your-username>.github.io/personal_dictionary/`!
