<img width="1162" height="634" alt="image" src="https://github.com/user-attachments/assets/77cc8d1b-9bd4-44c8-b3ff-0d8f379892af" />

# Road Rash (1996, Windows 95) in the browser

EA's *Road Rash* for Windows 95, running in a web page with menus, races, music, cut-scenes and saves at full speed. It isn't an emulator: the game's x86 machine code was **statically translated to Rust** with [Theseus](https://github.com/evmar/theseus) and compiled to **WebAssembly**. The same translated code also runs as a native macOS app.

This is a personal hobby project and has nothing to do with EA. The game's code and data in this repo are **encrypted** and the site asks for a password, so it isn't a way to get the game. If you want to try this approach yourself, you'll need your own copy.

---

## How it works

```
ROADRASH.EXE (1996, x86, Win32 + DirectDraw)
        │  Theseus "tc": static translation, one Rust function per x86 function
        ▼
430k lines of Rust  +  a Win32 API reimplementation (also Rust)
        │  rustc
        ├──► native macOS binary (SDL)
        └──► WebAssembly (threads + shared memory) + a small TypeScript host
```

**Static translation.** Theseus decodes the executable ahead of time and emits Rust that does what each instruction did: registers become variables, memory becomes a byte array, and indirect calls are looked up at runtime. Road Rash's 0.38 MB of x86 code became about 430,000 lines of Rust in a few seconds. Because nothing is interpreted while you play, it runs at full speed, and the browser build is just a normal wasm build of that Rust.

**The real work is Windows, not x86.** The translated code calls about 270 Windows functions (kernel32, user32, gdi32, ddraw, dsound, winmm and others), and 138 of them didn't exist in Theseus yet. The main pieces that had to be written:

- **Windows and input:** child windows used as menu buttons, focus and keyboard routing, a keyboard hook, per-thread message queues, timers.
- **Graphics:** DirectDraw surfaces in 16-bit (RGB565) and 8-bit palettized modes, and GDI text drawn with the game's own TrueType fonts.
- **Video:** the cut-scenes are Cinepak AVIs with IMA ADPCM audio played through MCI, so I wrote both decoders.
- **Music:**
  - The streamed `.RRA` music tracks play through DirectSound.
  - The menu music is MIDI, played by a SoundFont synth (rustysynth).
  - The game shipped instrument banks for the Sound Blaster AWE32 (`.SBK`), which were converted to SF2 (awesfx) so it sounds like the original.
- **Saves and settings:** a small registry saved to a file, file dialogs, and saves kept in the browser.
- **Threads:** the race engine uses worker threads and multimedia timers, which in the browser become Web Workers sharing one WebAssembly memory.

All of this lives in Theseus's Rust Win32 layer, about 5,000 lines of changes. Each piece was written until the game stopped hitting it, not as a complete Windows implementation.

**The browser host.** A small TypeScript page:
- runs the program in a Web Worker and starts more workers for the game's threads;
- sends keyboard and mouse input;
- plays audio through a ring buffer in shared memory;
- draws frames to a canvas.

The game reads files synchronously, so on-demand files (music, videos) are fetched with synchronous XHR inside the worker. That's the one place where a slow network shows up as a pause.

## Loading fast

The first version downloaded about 300 small files one by one, which was far too slow over the internet. What it does now, partly inspired by how [reVCDOS](https://github.com/yukonga/revcdos) (GTA: Vice City in the browser) loads its data:

1. **One startup bundle.** Everything the game needs to start (about 28 MB) is packed into a single download, with a real progress bar.
2. **A service worker as a permanent cache.** Every file is stored in Cache Storage after its first download, and that includes the game's own synchronous reads, which pass through the service worker too. Repeat visits load the startup files in about 0.1 s with no network.
3. **Background download.** Once you're in the menus, the remaining files (music, race videos; about 470 MB) download two at a time at low priority, in the order you're likely to need them.
4. **Cross-origin isolation without server headers.** WebAssembly threads need `SharedArrayBuffer`, which needs COOP/COEP headers. GitHub Pages can't send those, so the same service worker adds them to every response (the page reloads once on the first visit while it installs).

Two gotchas that cost me time:
- **Hand the response back first.** The service worker has to return the response right away and save its copy in the background (`event.waitUntil(cache.put(...))`). Saving first made large files stall on GitHub Pages, though it worked fine on a local server.
- **Use a fresh folder per key.** When the encryption key changes, the browser can mix cached old files with new ones. Each key now gets its own folder of files.

## Encryption

The repo is public (free GitHub Pages requires that), so the WebAssembly and every game file are encrypted with ChaCha20. The key comes from the password via PBKDF2. Decryption is plain JavaScript rather than WebCrypto because the game's synchronous file reads can't wait for an async API. It decrypts at a few hundred MB/s, so even a 55 MB video takes a fraction of a second.

## Controls (WASD layout)

| Key | Action |
|---|---|
| W / S | Accelerate / brake (also move through menus) |
| A / D | Steer |
| Left Shift | Nitro |
| Cmd | Punch / grab a weapon |
| Space | Kick |
| X | Backhand |
| F | Get off the bike |
| Esc | Pause; twice to quit the race |

Add `?keys=classic` to the address for the original keys (arrows, Ins, Space, Enter). The WASD remap switches itself off while you type a name.

## What works and what doesn't

- **Tested and working:**
  - Thrash and Big Game menus, mouse and keyboard;
  - races with fighting and crashes;
  - winning a race (Napa Valley, with the winner video);
  - music, cut-scenes, and settings that persist.
  - It's been run in Chromium, Firefox and Safari's engine, and natively on macOS.
- **Not done:**
  - Multiplayer: the game supports modem, IPX and TCP/IP, but the network functions are stubs.
  - Joystick support.
  - A thorough test of Big Game save files.

## Tips if you want to try Theseus on your own game

- **Expect the effort to go into the Win32 layer, not translation.** Translation took seconds; the Windows API took days.
- **Stub what's missing first.** Generate stubs that log every missing function with the right stdcall argument count, then implement whatever the game actually trips over, in order.
- **Test natively first.** Native builds are much faster to debug than the browser, and once native works, the wasm build mostly comes along.
- **Watch for undocumented behaviour old games rely on.** In this game: the CD check (`GetDriveTypeA`), child windows used as buttons, and the exit code carried in `WM_QUIT`.

## Source

The code changes (the Win32 additions, the browser host, the loading and caching, and the build scripts) are on the `roadrash` branch of my Theseus fork: **https://github.com/kaustubhxd/theseus/tree/roadrash** (start with `roadrash/README.md`). It has no game content: you translate your own copy of the game with Theseus.

## Credits

- [Theseus](https://github.com/evmar/theseus) by Evan Martin: the translator and Win32 base this builds on.
- [awesfx](https://github.com/tiwai/awesfx): AWE32 SoundFont tools used to convert the original `.SBK` banks.
- [rustysynth](https://github.com/sinshu/rustysynth) (MIDI synth) and [fontdue](https://github.com/mooman219/fontdue) (font rendering).
- [reVCDOS](https://github.com/yukonga/revcdos): ideas for loading and caching.
- *Road Rash* © 1996 Electronic Arts. This project isn't affiliated with or endorsed by EA.
