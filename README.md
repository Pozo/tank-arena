# Tank Arena

Free-for-all tank battles in the browser for up to 8 friends.

## Play
1. Enter a name and press **Create room**.
2. **Copy link** and send it to friends. They open it and press **Join**.
3. Optionally add bots, then **Start match**. Friends can also join mid-match.

First to 15 kills, or most kills after 5 minutes.

**Controls:** W/S (or arrows) drive, A/D turn, mouse aims, click or Space fires.
On phones the left thumb drives and the right thumb aims and fires.

Steel walls bounce shells once; brick walls break.
Power-ups: ✚ repair, » rapid fire, ⋔ triple shot, ⛨ shield, ⚡ speed.

## Run locally
    python3 -m http.server 8000     # then open http://localhost:8000
Opening `index.html` as a file does not work (browser modules need a server).
A localhost link only works on your own computer.

## Put it online (so friends can reach it)
There is nothing to build; upload the folder as static files.
- **Netlify Drop:** drag `index.html`, `style.css` and `js/` (in one folder)
  onto https://app.netlify.com/drop.
- **GitHub Pages:** push this folder to a repository, then Settings → Pages →
  deploy from the branch.

## Known limits
- The host's browser runs the game. If the host closes the tab, the match ends.
  On phones, a host who switches apps may freeze the match, so host on a computer.
- Players find each other through PeerJS's free public service. If it is down,
  rooms cannot be created.
- Some strict networks (offices, some mobile carriers) block direct
  connections.
- The host has no lag, and nothing stops a host who edits the code from cheating.

## Tests
    npm test
