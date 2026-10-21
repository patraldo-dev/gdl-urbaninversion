<script>
	import favicon from '#lib/assets/favicon.svg';

	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Urban Inversion</title>
	<meta
		name="description"
		content="A presence layer for glasses wearers: see who nearby is open to a conversation, and who wants quiet. Privacy-first, ephemeral, opt-in."
	/>
</svelte:head>

<div class="shell">
	<header>
		<a class="brand" href="/">Urban&nbsp;Inversion</a>
		<nav>
			<a href="/how-it-works">How it works</a>
			<a href="/privacy">Privacy &amp; safety</a>
			<a class="cta" href="/enter">Enter</a>
		</nav>
	</header>
	<main>
		{@render children()}
	</main>
	<footer>
		<p>
			No accounts. No tracking. Positions live only briefly in server memory and never leave it.
			<a href="/privacy">Read the details</a>.
		</p>
	</footer>
</div>

<style>
	:global(:root) {
		--ink: #1c2733;
		--muted: #5b6b7b;
		--accent: #2e8b57;
		--bg: #faf9f6;
		--line: #e3e0d8;
	}
	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		color: var(--ink);
		background: var(--bg);
		line-height: 1.6;
	}
	.shell {
		max-width: 46rem;
		margin: 0 auto;
		padding: 0 1.25rem 3rem;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.5rem 0 1rem;
		border-bottom: 1px solid var(--line);
	}
	.brand {
		font-weight: 800;
		font-size: 1.15rem;
		letter-spacing: -0.02em;
		color: var(--ink);
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 1.1rem;
		align-items: baseline;
	}
	nav a {
		color: var(--muted);
		text-decoration: none;
		font-size: 0.95rem;
	}
	nav a:hover {
		color: var(--ink);
	}
	nav a.cta {
		color: var(--bg);
		background: var(--accent);
		padding: 0.35rem 0.9rem;
		border-radius: 999px;
		font-weight: 600;
	}
	footer {
		margin-top: 3rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.9rem;
	}
	footer a {
		color: var(--muted);
	}
	:global(h1),
	:global(h2),
	:global(h3) {
		line-height: 1.2;
		letter-spacing: -0.02em;
	}
	:global(h1) {
		font-size: 2.2rem;
		margin: 2rem 0 1rem;
	}
	:global(h2) {
		font-size: 1.35rem;
		margin: 2.2rem 0 0.6rem;
	}
	p {
		margin: 0.6rem 0;
	}
	a {
		color: var(--accent);
	}
	:global(.lede) {
		font-size: 1.15rem;
		color: var(--muted);
	}
	:global(.pill) {
		display: inline-block;
		padding: 0.15rem 0.75rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		border: 1px solid var(--line);
		margin-right: 0.4rem;
	}
	:global(.pill.open) {
		background: #e7f6ec;
		border-color: #b7e2c6;
		color: #1d6b3f;
	}
	:global(.pill.quiet) {
		background: #eef0f3;
		border-color: #d6dbe2;
		color: #46525f;
	}
	:global(.pill.observer) {
		background: #f1f0ec;
		border-color: #ddd9cd;
		color: #6b6353;
	}
</style>
