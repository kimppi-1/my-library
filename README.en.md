# My Library (my-library)

[한국어](README.md) · **English** · [中文](README.zh.md) · [日本語](README.ja.md)

A web app for reading books you own, chapter by chapter. Add a PDF of a book (scanned is fine) or photos of its pages: the text is read **on your own device**, split into chapters, and put on your shelf. Use it in the browser without installing, or install it like an app.

**Open it:** https://kimppi-1.github.io/my-library/

## What it does

- **Add a book**: join several PDFs (e.g. volume 1 and 2) or many photos into one book.
  - Text PDFs are read directly; scanned PDFs are read with OCR (tesseract.js).
  - Small numbers such as Bible references (`3:16`) and English words inside Korean text are re-read at a larger size.
  - Korean books: misread letters are corrected with the Kiwi Korean language model, following the method of [hwp2docx](https://github.com/kimppi-1/hwp2docx).
  - **Protecting key words** (Korean books): words such as 하나님 (God), 예수 (Jesus), 그리스도 (Christ), 성령 (Holy Spirit), 성경 (Bible), the 66 book names of the Bible and key theological terms are corrected when OCR gets them wrong. You can add your own words in Settings.
- **Book languages**: Korean, English, Chinese (Simplified/Traditional) and Japanese.
- **Chapter split**: pages with large-type titles are guessed as chapter starts. For each page you can choose Body text / New chapter / Part title page / Skip and edit the titles.
- **Reading**: contents, read marks, bookmarks for any paragraph, font · size · line spacing · background and text colours · margins, a page-flip effect, a reading-progress bar, and ← → keys to change chapters.
- **Highlights & notes**: select text to highlight it in one of four colours and attach a note. View them all, filter by colour, search, and copy them all at once.
- **Questions & quizzes**: for each chapter, AI makes a summary, three reflection questions and four multiple-choice questions, in the language you chose for the screen. You can also make them for every chapter at once.
  - **Copy & paste (no key)**: copy the prompt into the AI app you already use (Claude, ChatGPT, Gemini …) and paste the answer back.
  - **API key**: enter your own key for Claude (Anthropic), ChatGPT (OpenAI) or Gemini (Google) and the app makes them for you. The key is stored only on that device.
- **Backup**: export your books and records to one file and import it on another device.
- **Screen language**: 한국어 · English · 中文 · 日本語 (top right).

## Privacy and copyright

- Book files, text, reading records and notes are stored **only in your browser (IndexedDB)**. Nothing is uploaded to this repository or to any server.
- Only when you make questions with an AI API is that chapter's text sent to the AI company you chose.
- This repository contains no books. Add **books you own, for your personal study**, and do not share the text you create.

## Installing

- **Computer (Chrome · Edge)**: the install button at the right of the address bar (or Settings → Install on this device). It appears on your desktop and Start menu and opens in its own window.
- **iPhone**: Safari Share button → Add to Home Screen.
- **Android**: Chrome menu → Install app.

Once opened, it works offline. The OCR data (about 15 MB the first time) and the Korean correction model (about 28 MB) are downloaded once when you add your first book.

## Hosting your own copy (fork)

1. Fork this repository, or upload the files to a new repository.
2. Settings → Pages → set Branch to `main` / `(root)` and save.
3. After a moment it opens at `https://<account>.github.io/<repository>/`.

There is no build step: edit the HTML and JavaScript files and the changes appear directly.

## Files

| File | What it does |
|---|---|
| `index.html` | Page frame and styles |
| `src/app.mjs` | Library, contents, reader, highlights and settings screens |
| `src/importer.mjs` | Add-a-book and chapter-split screens |
| `src/ocr.mjs` | PDF text extraction, OCR, re-reading references and English, spelling correction |
| `src/chapters.mjs` | Finding chapter titles, subtitles, Bible epigraphs and paragraphs from line size and position |
| `src/glossary.mjs` | Protecting key words |
| `src/ai.mjs` | Choosing an AI and the prompts |
| `src/i18n.mjs`, `src/i18n-dict.mjs` | Screen language and translation dictionary |
| `src/store.mjs` | On-device storage (IndexedDB) |
| `src/ko-fix.mjs` | Korean typo correction from hwp2docx |
| `vendor/` | pdf.js and the Kiwi language model |
| `sw.js`, `manifest.webmanifest` | Installing and offline use |

## License

MIT. Licenses of the programs and data used are listed in [NOTICE](NOTICE).
