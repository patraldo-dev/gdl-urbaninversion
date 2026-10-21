<svelte:head>
	<title>Privacy &amp; safety — Urban Inversion</title>
</svelte:head>

<h1>Privacy &amp; safety</h1>

<p class="lede">
	This page describes what the running code actually does — not an
	aspiration. It tracks the implementation, and changes when the code does.
</p>

<h2>The short version</h2>
<p>
	No accounts, no names, no faces, no camera use, no third-party trackers or
	analytics. Your precise position exists only in server memory, for at
	most half a minute, and is never sent to another user — others see only a
	direction category, a distance category, and a rotating anonymous handle.
	Going invisible disconnects you entirely: the server then holds nothing
	about you at all.
</p>

<h2>Identity</h2>
<p>
	Each session, your browser generates a fresh cryptographic key pair
	(did:key, P-256) and discards it afterward. It signs your messages so
	nobody can forge or tamper with them. It is <em>not</em> an identity:
	there is no profile, no login, and no way to link one session to the
	next. One anti-abuse mechanism runs at session start — a Cloudflare
	Turnstile challenge on the Enter page — plus rate limits per connection
	and per network (networks are counted only as short-lived salted hashes,
	never stored as addresses).
</p>

<h2>Location</h2>
<p>
	While active you send position updates several times a minute. They live
	only in a server-side Durable Object's memory with a 30-second expiry —
	never in a database, never in logs, never in backups. The glasses have no
	GPS; the phone they're paired with supplies location through the
	operating system. If the reported accuracy is too coarse for individual
	markers, you are not rejected — you simply see counts instead of people,
	and the interface says so.
</p>

<h2>What other people can see about you</h2>
<p>
	When you are Open or Quiet, nearby visible users see: a direction bucket
	(45°), a distance bucket (10 m), your state, and an opaque handle that
	rotates every 5 minutes. Never your coordinates, never your key, never
	anything stable across sessions. You only appear to people who are
	themselves visible — there is no silent observation. Observers see
	aggregate counts only. Any user can block you for their session, and you
	them.
</p>

<h2>Aggregate statistics</h2>
<p>
	We keep one database table: counts of Open/Quiet/Observer users per
	15-minute window per coarse area (~20 km cell). Rows are written only
	when an area has at least 5 people in the window after combining
	small areas — below that, nothing is stored at all. No identifiers, no
	positions, no finer time resolution exists anywhere in storage.
</p>

<h2>Honest limitations</h2>
<ul>
	<li>
		A determined person moving physically while visible to you could, over
		minutes, estimate a visible person's rough location from repeated
		bearing/distance categories. Quantization, per-pair noise, movement
		plausibility checks and mutual visibility raise the cost — they cannot
		eliminate it. The product's own display is the alarm: a visible marker
		closing in on you is exactly what you see.
	</li>
	<li>
		Operating any website means Cloudflare transiently processes IP
		addresses and request metadata. We do not persist them or use them for
		analytics.
	</li>
	<li>
		Functional state (your consent and the anti-abuse token) lives in the
		tab's session storage and disappears when the tab does.
	</li>
</ul>

<h2>Your controls</h2>
<p>
	State toggle (Open / Quiet / Observer / Invisible) is one gesture away at
	all times. Invisible means zero server-side state, by construction and by
	test. Questions: hello@urbaninversion.com.
</p>
