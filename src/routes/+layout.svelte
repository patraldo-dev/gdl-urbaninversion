<script>
    import '@fontsource/playfair-display/400.css';
    import '@fontsource/playfair-display/700.css';
    import '@fontsource/inter/400.css';
    import '@fontsource/inter/700.css';

    let { children } = $props();
</script>

<div class="layout">
    <nav class="nav">
        <a href="/" class="nav-brand">GDL <span class="accent">Urban Inversion</span></a>
        <div class="nav-links">
            <a href="/">Mapa</a>
            <a href="/tour">Recorrido</a>
        </div>
    </nav>
    <main>
        {@render children()}
    </main>
</div>

<style>
    :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
    :global(body) {
        background: #09090b;
        color: #e4e4e7;
        font-family: 'Inter', sans-serif;
    }
    :global(a) { color: #c9a87c; text-decoration: none; }
    .layout {
        min-height: 100vh;
    }
    .nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 2rem;
        border-bottom: 1px solid #1a1a1e;
    }
    .nav-brand {
        font-family: 'Playfair Display', serif;
        font-size: 1.2rem;
        color: #e4e4e7;
        font-weight: 700;
    }
    .accent { color: #c9a87c; }
    .nav-links {
        display: flex;
        gap: 1.5rem;
    }
    .nav-links a {
        color: #71717a;
        font-size: 0.85rem;
    }
    .nav-links a:hover { color: #c9a87c; }
</style>
