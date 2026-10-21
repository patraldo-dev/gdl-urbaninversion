<svelte:head>
	<title>How it works — Urban Inversion</title>
</svelte:head>

<h1>How it works</h1>

<h2>Three states, one gesture</h2>
<p>
	<span class="pill open">Open</span> you're visible and approachable.
	<span class="pill quiet">Quiet</span> you're visible with a clear "please
	don't approach". <span class="pill observer">Observer</span> you see only
	counts — never individuals — and are never visible.
	<strong>Invisible</strong> disconnects everything: no socket, no server state.
</p>

<h2>What you actually see</h2>
<p>
	While walking, open people appear as a soft green marker and quiet people
	as a dim one — at a glanceable direction and distance category like
	"about 20–30 m, slightly left". That resolution is deliberate: it's enough
	to decide whether to say hello, and too coarse to follow anyone. People
	outside your narrow field of view appear as edge indicators. Text is kept
	to a minimum; this is a HUD, not a feed.
</p>

<h2>Mutual visibility</h2>
<p>
	You only ever see individual markers while you are yourself visible
	(Open or Quiet). There is no way to watch open people while staying
	unseen — the silent-observer loophole is closed by design. Observers get
	aggregate counts only, and so does anyone whose location source is too
	imprecise that moment.
</p>

<h2>Compass-less alignment</h2>
<p>
	Glasses have no reliable compass, so the display aligns to the real world
	by walking: after a few straight steps the app compares how far you moved
	per your GPS track versus your tracked head movement and locks the
	orientation. Until then it tells you plainly: "alignment low — walk
	straight for a few seconds."
</p>

<h2>On the device</h2>
<p>
	The experience is a plain web app at <code>/xr</code> on this site. On
	Ray-Ban Display glasses you add it once via the Meta AI app in Developer
	Mode (URL or QR code) — no store, no install. Developers can run the same
	build on a laptop with the IWER emulator and a simulated walker.
</p>
