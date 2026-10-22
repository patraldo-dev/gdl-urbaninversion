<script>
	import { t } from '#lib/i18n/index.js';
</script>

<svelte:head>
	<title>{$t('meta.title_home')}</title>
</svelte:head>

<h1>{$t('home.title_a')}<br />{$t('home.title_b')}</h1>

<p class="lede">
	{$t('home.lede_a')} <strong>{$t('home.lede_open')}</strong> {$t('home.lede_and')}
	<strong>{$t('home.lede_alone')}</strong> {$t('home.lede_b')}
</p>

<p>
	<span class="pill open">{$t('home.pill_open')}</span>
	<span class="pill quiet">{$t('home.pill_quiet')}</span>
	<span class="pill observer">{$t('home.pill_observer')}</span>
	{$t('home.pills_note')}
</p>

<h2>{$t('home.why_h')}</h2>
<p>{$t('home.why_p')}</p>

<h2>{$t('home.privacy_h')}</h2>
<p>
	{$t('home.privacy_p_a')}
	<a href="/privacy">{$t('home.privacy_link')}</a>
</p>

<h2>{$t('home.start_h')}</h2>
<p>
	{$t('home.start_p_a')} <code>/xr</code> {$t('home.start_p_b')}
	<a href="/enter">{$t('home.start_link')}</a> {$t('home.start_p_c')}
</p>
