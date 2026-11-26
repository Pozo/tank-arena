# Tank game: design

## Intent
A browser tank game a group of friends can play together over the internet at the
same time. Inspired by https://pickled-soil-uj6lj.ship.place/ (single player vs
one bot, decorative rocks, no walls, sound or restart), but much better and nice
to look at.

## Goals, non-goals, anti-goals
**Goals**
- Several friends play at once: send a link, click, play.
- Up to 8 tanks per room.
- Feels good: responsive driving, clear hits, effects, sound.
- Works in desktop and phone browsers.
- Nothing to run or pay for.

**Non-goals:** accounts, matchmaking with strangers, saved stats, teams, chat,
host migration, protection against a cheating host.

**Anti-goals:** setup friction for friends; sluggish own-tank controls; players
sitting out after dying; a match that freezes when the host switches tabs.

## Approaches
| Option | Trade-off |
|---|---|
| **A. Friend's browser hosts over WebRTC, 2D (chosen)** | No server. Host has zero lag, host leaving ends the match, some strict networks cannot connect. |
| B. Node WebSocket server, 2D | Fair and connects almost anywhere, but someone must host and maintain a server. |
| C. A in 3D (three.js) | Flashier, much more work, harder aiming, weaker on phones. |

You picked A: "send link, play" with no upkeep. If friends cannot connect, B is
the fallback and only the networking part changes.

## Gameplay (my proposals unless noted)
- **Mode:** free-for-all deathmatch. First to 15 kills, or most kills after
  5 minutes. Scoreboard, then the next round starts by itself.
- **Death:** respawn after 3 s at the spawn point farthest from enemies, with
  2 s of invulnerability that ends early if you fire.
- **Controls:** W/S drive, A/D turn hull, mouse aims turret independently,
  click or Space fires (hold to keep firing at the reload rate).
  Phone: left stick drives, right stick aims and fires.
- **Combat:** 100 HP, shell does 25, reload about 0.7 s, no self-damage.
- **Map:** one hand-made arena. Steel walls (shells bounce once), brick walls
  (break when shot, rebuilt each round), tanks collide with walls and each other.
- **Power-ups:** repair, rapid fire, triple shot, shield, speed. They appear at
  fixed spots and time out.
- **Bots:** host can add bots, 0 to 7, to fill the room. Humans joining a full
  room replace a bot.
- **Late join:** allowed mid-round. A leaver's tank disappears.

## Look and sound
Top-down, camera follows your tank. Each player has a distinct color, name tag
and health bar. Tread marks, muzzle flash, explosions, smoke, screen shake,
minimap, kill feed. Sounds are synthesized in the browser (no audio files), with
a mute button. All art is drawn in code.

## Screens
1. **Menu:** name, "Create room", or room code + "Join". Opening an invite link
   pre-fills the code.
2. **Lobby:** invite link with copy button, player list, bot count, "Start"
   (host only).
3. **Game:** arena plus HUD (health, power-up timer, scores, kill feed, minimap).

If the connection fails or the host leaves, show a plain message and a button
back to the menu.

## Technical
- Plain JavaScript modules and Canvas 2D. No build step, no framework.
- PeerJS (pinned version, from CDN) for WebRTC and its free public broker.
- The host runs the only authoritative simulation at a fixed 60 Hz and sends
  snapshots about 20 to 30 times a second. Clients send only their inputs.
- Clients predict their own tank's movement and correct toward the host's
  state; other tanks and shells are interpolated.
- The host's clock must keep running in a background tab (worker timer, not
  `requestAnimationFrame`).
- The host validates everything a client sends (input ranges, name length,
  room size). Names are never inserted as HTML.
- Simulation is a separate module with no browser dependencies, covered by
  `node --test`.
- Layout: `tank-game/index.html`, `style.css`, `js/`, `test/`, `README.md`.

## Running and publishing
Local: `python3 -m http.server` in `tank-game/`. For friends it needs a public
static host (GitHub Pages, Netlify or similar). The README will give the steps.
Publishing is not part of the build and happens only if you ask.

## Done means
- Simulation tests pass.
- Two or more browser tabs can create, join and play a full round locally, with
  no console errors.
- Not verifiable on this machine alone: connecting across different home or
  mobile networks. That needs a real try with a friend.

## Left to the builder
Exact map layout, colors, tuning numbers, message format, module split inside
`js/`.
