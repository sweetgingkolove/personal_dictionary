# Chelsea's Dictionary

A clean, responsive personal dictionary web application designed to help you curate, search, and master your vocabulary. Built as a pure static web app ready for GitHub Pages hosting, with a zero-dependency local auto-reload development server.

## Features

- **Vintage 1800s Lexicon Aesthetic**: Styled after 19th-century dictionaries with warm aged library book tones, authentic typography (`Cinzel`, `EB Garamond`), and printer's rules.
- **Dictionary Viewer**: Browse curated words with phonetic styling, parts of speech, definitions, example sentences, and contextual notes.
- **Instant Search & POS Filters**: Real-time search across words, definitions, and tags; quick filters for nouns, verbs, adjectives, adverbs, prepositions, and phrases.
- **Dynamic Custom Tags**: Filter words by tag or create custom tags that dynamically appear as options across all entries and filter bars.
- **Practice & Quizzes Suite**: Dedicated interactive learning arena (`practice.html`) featuring:
  - **Definition Match**: Multiple-choice speed quiz with streak counters and instant feedback.
  - **Flashcards**: Archival 3D-flipping cards with mastery tracking.
  - **Word Forge**: Anagram & spelling letterpress tile puzzle with keyboard support and hints.
- **Export Dictionary**: Download all words and definitions as a clean, formatted text file.
- **Audio Pronunciation**: Uses the browser's built-in Web Speech API to pronounce words aloud.
- **Mobile Optimized**: Ergonomic mobile layout with bottom-sheet modals, touch-friendly controls, and iOS auto-zoom prevention.
- **Auto-Reload Local Server**: Zero-dependency Python dev server with Server-Sent Events (SSE).
- **GitHub Pages Ready**: Zero build steps or bundlers required—just push to GitHub and enable GitHub Pages.

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
│   ├── practice.js   # Quiz, flashcards, word forge games logic
│   └── words.js      # Curated dictionary vocabulary entries
├── serve.py          # Python dev server with auto-reload (zero dependencies)
├── run.bat           # Windows quick-launcher script
└── README.md         # Project documentation
```

---

## Adding or Editing Words

All dictionary data is stored in [`js/words.js`](js/words.js). You can add new words by adding an entry to the `INITIAL_WORDS` array:

```javascript
{
  id: "ineffable",
  word: "ineffable",
  partOfSpeech: "adjective",
  definition: "Too great or extreme to be expressed or described in words.",
  tags: ["literary", "wonder"]
}
```

Whenever you save [`js/words.js`](js/words.js), the development server will instantly reload your browser with the updated dictionary!

---

## Deploying to GitHub Pages

Because this project uses vanilla HTML, CSS, and modern JavaScript modules, deploying to GitHub Pages takes less than a minute:

1. Initialize git and commit your files (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit of personal dictionary"
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
