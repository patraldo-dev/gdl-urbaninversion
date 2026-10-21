<svelte:head>
	<title>Pair a phone — Urban Inversion</title>
</svelte:head>

<h1>Pair a phone</h1>

<p class="lede">
	This page is a stub. Phone pairing is intentionally not implemented in v1.
</p>

<h2>Why it isn't needed today</h2>
<p>
	Ray-Ban Display glasses pair with a phone at the operating-system level,
	and the glasses' web runtime exposes that phone-sourced location to web
	apps directly. The XR client reads it through its location provider, so
	there is nothing to pair in-app.
</p>

<h2>What would live here</h2>
<p>
	If on-device measurements ever show the runtime's location is unusable,
	this page becomes the companion flow: a short-lived pairing code shown in
	XR, entered here on the phone, after which the phone streams GPS and
	compass into your session over the same presence infrastructure. The
	client-side interface for that provider already exists in the code as a
	documented stub.
</p>
